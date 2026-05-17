import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  Keyboard,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { fetch } from "expo/fetch";
import { useColors } from "@/hooks/useColors";
import { ModelAvatar } from "@/components/ModelAvatar";
import { ModelPicker } from "@/components/ModelPicker";
import { MessageBubble } from "@/components/MessageBubble";
import { getModelById, AIModel } from "@/constants/models";
import { supabase, chatFunctionUrl, SUPABASE_ANON_KEY } from "@/lib/supabase";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  model?: string;
}

type ChatMode = "single" | "compare";

interface Column {
  model: AIModel;
  messages: Message[];
  streaming: boolean;
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id: string;
    initialMessage?: string;
    modelId?: string;
    systemPrompt?: string;
    mode?: string;
    models?: string;
  }>();

  const conversationId = params.id;
  const mode: ChatMode = params.mode === "compare" ? "compare" : "single";
  const compareModelIds = (params.models ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Single-mode state
  const [model, setModel] = useState<AIModel>(
    getModelById(params.modelId ?? ""),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Compare-mode state: one column per selected model
  const [columns, setColumns] = useState<Column[]>(() =>
    mode === "compare"
      ? compareModelIds.map((id) => ({
          model: getModelById(id),
          messages: [],
          streaming: false,
        }))
      : [],
  );

  const [inputText, setInputText] = useState("");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [attachVisible, setAttachVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Web-search toggle. Visual state lives here; the actual search
  // routing will be wired in when the backend gets a web-search tool.
  // ChatGPT uses the same pattern — a globe pill in the input row.
  const [webSearchOn, setWebSearchOn] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const hasSentInitial = useRef(false);
  // Ref-mirror of "is any stream in flight" used to guard against the
  // rapid-double-tap race: reading the state version inside sendMessage's
  // closure can see a stale `false` if the user fires Enter twice before
  // React commits setIsStreaming(true). The ref is set synchronously.
  const sendingRef = useRef(false);
  // Active stream's AbortController. Cancels both the fetch + reader on
  // navigation away / new send so we don't leak the SSE pipe (and don't
  // setState on an unmounted screen).
  const activeAbortRef = useRef<AbortController | null>(null);
  // RAF-batch incoming SSE deltas. Without this, fast models emit a
  // setState per character (hundreds/sec) → FlatList re-renders the
  // streaming row hundreds of times per second → visible jank on lower-
  // end Android. Accumulate per-assistant-id and flush once per frame.
  const pendingDeltasRef = useRef<Map<string, string>>(new Map());
  const flushFrameRef = useRef<number | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInsetRaw = Platform.OS === "web" ? 34 : insets.bottom;
  // Track keyboard visibility so we can drop the home-gesture-bar
  // inset while the keyboard is up. Without this, Android edge-to-edge
  // mode (adjustResize) + the static safe-area inset *both* push the
  // input upward → a visible empty strip between the input pill and
  // the keyboard.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // Tight against the keyboard looks crushed — ChatGPT keeps a small
  // breathing strip even when the soft keyboard is up. 10 px is the
  // sweet spot: enough air above the pill, but not so much that the
  // earlier "empty band" complaint comes back.
  const bottomInset = keyboardOpen ? 10 : bottomInsetRaw;

  const anyStreaming = isStreaming || columns.some((c) => c.streaming);

  // Abort any live stream on unmount so reader.read() promises resolve
  // and the route can tear down cleanly. Without this, navigating away
  // mid-stream produced "state update on unmounted component" warnings
  // and the assistant row was still written to the DB out-of-band.
  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      if (flushFrameRef.current != null) {
        cancelAnimationFrame(flushFrameRef.current);
        flushFrameRef.current = null;
      }
      pendingDeltasRef.current.clear();
    };
  }, []);

  // Drain pendingDeltasRef into the appropriate state slice. Called
  // from the RAF callback and directly from onDone/onError so the last
  // tail of a fast stream isn't deferred a frame past completion.
  const flushDeltas = useCallback(() => {
    const pending = pendingDeltasRef.current;
    if (pending.size === 0) return;
    if (mode === "compare") {
      setColumns((prev) =>
        prev.map((c) => ({
          ...c,
          messages: c.messages.map((m) => {
            const add = pending.get(m.id);
            return add ? { ...m, content: m.content + add } : m;
          }),
        })),
      );
    } else {
      setMessages((prev) =>
        prev.map((m) => {
          const add = pending.get(m.id);
          return add ? { ...m, content: m.content + add } : m;
        }),
      );
    }
    pending.clear();
  }, [mode]);

  // Schedule a single flush per animation frame. Multiple chunks
  // arriving in the same frame coalesce into one setState — bounding
  // work to ~60 fps regardless of the model's token rate.
  const scheduleFlush = useCallback(() => {
    if (flushFrameRef.current != null) return;
    flushFrameRef.current = requestAnimationFrame(() => {
      flushFrameRef.current = null;
      flushDeltas();
    });
  }, [flushDeltas]);

  // Cancel any in-flight RAF and synchronously drain. Used on
  // stream-done / stream-error so the assistant row is fully written
  // before we toggle streaming=false (otherwise the trailing chunk
  // would render one frame after the cursor disappears).
  const flushDeltasNow = useCallback(() => {
    if (flushFrameRef.current != null) {
      cancelAnimationFrame(flushFrameRef.current);
      flushFrameRef.current = null;
    }
    flushDeltas();
  }, [flushDeltas]);

  const loadMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content, model")
        .eq("conversation_id", Number(conversationId))
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as {
        id: number;
        role: "user" | "assistant";
        content: string;
        model: string | null;
      }[];

      if (mode === "compare") {
        setColumns((prev) =>
          prev.map((col) => ({
            ...col,
            messages: rows
              .filter(
                (r) => r.role === "user" || r.model === col.model.id,
              )
              .map((r) => ({
                id: String(r.id),
                role: r.role,
                content: r.content,
                model: r.model ?? undefined,
              })),
          })),
        );
      } else {
        setMessages(
          rows.map((r) => ({
            id: String(r.id),
            role: r.role,
            content: r.content,
            model: r.model ?? undefined,
          })),
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, mode]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!isLoading && params.initialMessage && !hasSentInitial.current) {
      hasSentInitial.current = true;
      sendMessage(params.initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  async function streamOne(args: {
    text: string;
    modelId: string;
    assistantId: string;
    skipUserInsert: boolean;
    historyForModel: string | null;
    signal: AbortSignal;
    onChunk: (delta: string) => void;
    onDone: () => void;
    onError: (msg: string) => void;
  }) {
    try {
      const resp = await fetch(chatFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          conversationId: Number(conversationId),
          content: args.text,
          systemPrompt: params.systemPrompt ?? "",
          model: args.modelId,
          skipUserInsert: args.skipUserInsert,
          historyForModel: args.historyForModel,
        }),
        signal: args.signal,
      });
      if (!resp.ok || !resp.body) {
        // Surface the actual reason from the edge function (e.g.
        // "No endpoints found", "Unsupported model") instead of the
        // useless "Stream failed". Most common case: an old chat
        // pinned to a model the OpenRouter account no longer has —
        // hint to swap models from the header.
        let detail = "Stream failed";
        try {
          const errBody = await resp.json();
          if (errBody?.error) detail = String(errBody.error);
        } catch { /* ignore */ }
        const friendly =
          /no endpoints|not found|unsupported|credits|insufficient/i.test(detail)
            ? `${args.modelId.split("/")[1] ?? "This model"} isn't available right now. Tap the model name at the top to switch.`
            : detail;
        throw new Error(friendly);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // If the user navigates away or fires a new send, abort the
      // reader so reader.read() unblocks instead of holding the SSE
      // pipe open indefinitely.
      const onAbort = () => { reader.cancel().catch(() => {}); };
      args.signal.addEventListener("abort", onAbort, { once: true });
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (args.signal.aborted) return;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data) continue;
            try {
              const parsed = JSON.parse(data) as {
                content?: string;
                done?: boolean;
                error?: string;
              };
              if (parsed.error) {
                args.onError(parsed.error);
                return;
              }
              if (parsed.done) {
                args.onDone();
                return;
              }
              if (parsed.content) args.onChunk(parsed.content);
            } catch {
              // ignore
            }
          }
        }
        args.onDone();
      } finally {
        args.signal.removeEventListener("abort", onAbort);
      }
    } catch (e) {
      // AbortError is the cleanup path, not an error. Swallow so the UI
      // doesn't flash "Something went wrong" when the user navigates
      // away mid-stream.
      if (args.signal.aborted) return;
      args.onError(
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    // Synchronous race-guard. anyStreaming reads React state and lags
    // a render; a double-tap on the send button (or fast Enter) could
    // slip a second send through before setIsStreaming(true) committed.
    if (sendingRef.current || anyStreaming) return;
    sendingRef.current = true;

    // Cancel any previous live stream (defensive — shouldn't happen
    // because of the guard above, but if a stream finished but was
    // never observed cleared, this releases it).
    activeAbortRef.current?.abort();
    const abort = new AbortController();
    activeAbortRef.current = abort;

    setInputText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (mode === "compare") {
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
      };

      // Persist the shared user turn once. Edge Function calls will skip insert.
      const { error: insertErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: Number(conversationId),
          role: "user",
          content: text,
        });
      if (insertErr) {
        console.error(insertErr);
        return;
      }

      const placeholders = columns.map((col) => ({
        col,
        assistantId: `a-${col.model.id}-${Date.now()}`,
      }));

      setColumns((prev) =>
        prev.map((col, i) => ({
          ...col,
          streaming: true,
          messages: [
            ...col.messages,
            userMsg,
            {
              id: placeholders[i]!.assistantId,
              role: "assistant",
              content: "",
              streaming: true,
              model: col.model.id,
            },
          ],
        })),
      );

      // allSettled so one model failing doesn't abandon the other
      // mid-stream. Each branch's onDone/onError already updates its
      // column independently — the wait here just keeps the input
      // disabled until both columns have settled.
      await Promise.allSettled(
        placeholders.map(({ col, assistantId }) =>
          streamOne({
            text,
            modelId: col.model.id,
            assistantId,
            skipUserInsert: true,
            historyForModel: col.model.id,
            signal: abort.signal,
            onChunk: (delta) => {
              pendingDeltasRef.current.set(
                assistantId,
                (pendingDeltasRef.current.get(assistantId) ?? "") + delta,
              );
              scheduleFlush();
            },
            onDone: () => {
              flushDeltasNow();
              setColumns((prev) =>
                prev.map((c) =>
                  c.model.id === col.model.id
                    ? {
                        ...c,
                        streaming: false,
                        messages: c.messages.map((m) =>
                          m.id === assistantId ? { ...m, streaming: false } : m,
                        ),
                      }
                    : c,
                ),
              );
            },
            onError: (msg) => {
              pendingDeltasRef.current.delete(assistantId);
              setColumns((prev) =>
                prev.map((c) =>
                  c.model.id === col.model.id
                    ? {
                        ...c,
                        streaming: false,
                        messages: c.messages.map((m) =>
                          m.id === assistantId
                            ? { ...m, content: msg, streaming: false }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
            },
          }),
        ),
      );
      // Only release the global send/streaming flags if this same
      // request is still the active one. If the user hit Stop and then
      // immediately sent a new message, activeAbortRef has moved on —
      // clobbering sendingRef here would let a third send slip past
      // the race-guard while the new stream is still in flight.
      if (activeAbortRef.current === abort) {
        sendingRef.current = false;
        activeAbortRef.current = null;
        inputRef.current?.focus();
      }
      return;
    }

    // Single mode
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        model: model.id,
      },
    ]);
    setIsStreaming(true);

    await streamOne({
      text,
      modelId: model.id,
      assistantId,
      skipUserInsert: false,
      historyForModel: null,
      signal: abort.signal,
      onChunk: (delta) => {
        pendingDeltasRef.current.set(
          assistantId,
          (pendingDeltasRef.current.get(assistantId) ?? "") + delta,
        );
        scheduleFlush();
      },
      onDone: () => {
        flushDeltasNow();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m,
          ),
        );
      },
      onError: (msg) => {
        pendingDeltasRef.current.delete(assistantId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: msg, streaming: false }
              : m,
          ),
        );
      },
    });
    // Same guard as compare mode — if a stopStream + new send already
    // superseded this stream, leave the new stream's flags alone.
    if (activeAbortRef.current === abort) {
      setIsStreaming(false);
      sendingRef.current = false;
      activeAbortRef.current = null;
      inputRef.current?.focus();
    }
  }

  /** Interrupt the in-flight stream. Used by the Stop button that
   *  replaces Send while a reply is generating. Drains any RAF-buffered
   *  deltas first so the partial sentence the model already emitted
   *  isn't lost (visually truncates mid-word otherwise), then aborts
   *  the SSE pipe and settles every still-streaming row so the typing
   *  cursor disappears and the input becomes a Send button again. */
  function stopStream() {
    if (!anyStreaming) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    flushDeltasNow();
    if (mode === "compare") {
      setColumns((prev) =>
        prev.map((c) => ({
          ...c,
          streaming: false,
          messages: c.messages.map((m) =>
            m.streaming ? { ...m, streaming: false } : m,
          ),
        })),
      );
    } else {
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
      );
    }
    sendingRef.current = false;
  }

  /** Find the user message that prompted this assistant turn and
   *  re-send it. Strips any post-target turns off the visible list
   *  too so the new stream replaces (visually) the failed reply.
   *  Compare mode replays for all columns. */
  function retryAt(assistantId: string) {
    if (anyStreaming) return;
    if (mode === "compare") {
      const col = columns.find((c) =>
        c.messages.some((m) => m.id === assistantId),
      );
      const idx = col?.messages.findIndex((m) => m.id === assistantId) ?? -1;
      if (!col || idx < 0) return;
      const prevUser = [...col.messages.slice(0, idx)]
        .reverse()
        .find((m) => m.role === "user");
      if (!prevUser) return;
      sendMessage(prevUser.content);
      return;
    }
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx < 0) return;
    const prevUser = [...messages.slice(0, idx)]
      .reverse()
      .find((m) => m.role === "user");
    if (!prevUser) return;
    sendMessage(prevUser.content);
  }

  function renderTranscript(list: Message[]) {
    if (list.length === 0) return null;
    return (
      <FlatList
        data={[...list].reverse()}
        inverted
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble
            role={item.role}
            content={item.content}
            streaming={!!item.streaming}
            modelId={item.model ?? (item.role === "assistant" ? model.id : undefined)}
            onRetry={item.role === "assistant" ? () => retryAt(item.id) : undefined}
          />
        )}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        removeClippedSubviews
        windowSize={11}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topInset + 8, borderBottomColor: colors.border },
        ]}
      >
        <Pressable onPress={() => router.push("/history")} hitSlop={8}>
          <Ionicons name="menu" size={26} color={colors.foreground} />
        </Pressable>

        {mode === "compare" ? (
          <View style={styles.compareHeader}>
            {columns.map((c, i) => (
              <View key={c.model.id} style={styles.compareHeaderItem}>
                <ModelAvatar model={c.model} size={24} />
                <Text
                  style={[styles.compareHeaderName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {c.model.name}
                </Text>
                {i === 0 && (
                  <Text
                    style={[
                      styles.compareHeaderVs,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    vs
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.modelBtnWrap}>
            <Pressable
              style={[
                styles.modelPill,
                {
                  backgroundColor: "transparent",
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setPickerVisible(true)}
              hitSlop={6}
            >
              <ModelAvatar model={model} size={20} />
              <Text
                style={[styles.modelPillText, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {model.name}{" "}
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {model.version}
                </Text>
              </Text>
              <Ionicons
                name="chevron-down"
                size={12}
                color={colors.mutedForeground}
              />
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={() => router.push("/")}
          hitSlop={8}
          style={styles.headerIconBtn}
        >
          <Ionicons
            name="create-outline"
            size={22}
            color={colors.foreground}
          />
        </Pressable>
        <Pressable
          onPress={() => router.push("/")}
          hitSlop={8}
          style={styles.headerIconBtn}
        >
          <Ionicons name="home-outline" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // iOS lifts the whole view with padding; Android handles soft
        // keyboard via adjustResize at the window level. Setting
        // behavior="padding" on Android with offset=0 caused the input
        // to sit *under* the keyboard on edge-to-edge devices — fixed
        // by switching Android to "height" and offsetting by the
        // header height so the FlatList collapses, not the input row.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? topInset + 56 : 0}
      >
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : mode === "compare" ? (
          <View style={styles.compareWrap}>
            {columns.map((c, idx) => (
              <View
                key={c.model.id}
                style={[
                  styles.compareCol,
                  idx > 0 && {
                    borderLeftWidth: StyleSheet.hairlineWidth,
                    borderLeftColor: colors.border,
                  },
                ]}
              >
                {c.messages.length === 0 ? (
                  <View style={styles.colEmpty}>
                    <ModelAvatar model={c.model} size={44} />
                    <Text
                      style={[
                        styles.colEmptyTitle,
                        { color: colors.foreground },
                      ]}
                    >
                      {c.model.name}
                    </Text>
                  </View>
                ) : (
                  renderTranscript(c.messages)
                )}
              </View>
            ))}
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyCenter}>
            <ModelAvatar model={model} size={64} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {model.name} {model.version}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {model.description}
            </Text>
          </View>
        ) : (
          renderTranscript(messages)
        )}

        <View
          style={[
            styles.inputArea,
            {
              borderTopColor: colors.border,
              paddingBottom: bottomInset + 4,
              backgroundColor: colors.background,
            },
          ]}
        >
          <View style={[styles.inputRow, { backgroundColor: colors.input }]}>
            <Pressable hitSlop={8} onPress={() => setAttachVisible(true)}>
              <Ionicons
                name="add-circle"
                size={26}
                color={colors.mutedForeground}
              />
            </Pressable>
            <Pressable
              hitSlop={6}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setWebSearchOn((v) => !v);
              }}
              style={[
                styles.searchToggle,
                {
                  backgroundColor: webSearchOn ? colors.primary : "transparent",
                  borderColor: webSearchOn ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons
                name="globe-outline"
                size={14}
                color={
                  webSearchOn
                    ? colors.primaryForeground
                    : colors.mutedForeground
                }
              />
              <Text
                style={[
                  styles.searchToggleText,
                  {
                    color: webSearchOn
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  },
                ]}
              >
                Search
              </Text>
            </Pressable>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: colors.foreground }]}
              placeholder={
                mode === "compare"
                  ? "Ask both models..."
                  : "Write your message..."
              }
              placeholderTextColor={colors.mutedForeground}
              value={inputText}
              onChangeText={setInputText}
              multiline
              returnKeyType="default"
            />
            <Pressable
              style={[
                styles.sendBtn,
                {
                  backgroundColor: anyStreaming
                    ? colors.foreground
                    : inputText.trim()
                      ? colors.primary
                      : colors.accent,
                },
              ]}
              onPress={() => {
                if (anyStreaming) stopStream();
                else sendMessage(inputText);
              }}
              disabled={!anyStreaming && !inputText.trim()}
            >
              <Ionicons
                name={anyStreaming ? "stop" : "arrow-up"}
                size={anyStreaming ? 14 : 18}
                color={
                  anyStreaming ? colors.background : colors.primaryForeground
                }
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {mode === "single" && (
        <ModelPicker
          visible={pickerVisible}
          selectedId={model.id}
          onSelect={setModel}
          onClose={() => setPickerVisible(false)}
        />
      )}

      <Modal
        visible={attachVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setAttachVisible(false)}
        />
        <View
          style={[
            styles.attachSheet,
            { backgroundColor: colors.card, paddingBottom: bottomInset + 16 },
          ]}
        >
          {[
            { icon: "camera-outline", label: "Camera" },
            { icon: "image-outline", label: "Photos" },
            { icon: "add-circle-outline", label: "Files" },
          ].map((item) => (
            <Pressable
              key={item.label}
              style={[styles.attachRow, { backgroundColor: colors.secondary }]}
              onPress={() => setAttachVisible(false)}
            >
              <Ionicons
                name={item.icon as any}
                size={22}
                color={colors.foreground}
              />
              <Text style={[styles.attachLabel, { color: colors.foreground }]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  modelBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerIconBtn: {
    padding: 2,
  },
  searchToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchToggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  // Centered slot in the header — the pill itself sizes to its
  // content; this wrapper just claims the empty space between the
  // menu icon and the home icon so the pill lands in the middle.
  modelBtnWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Tight pill, no fill — a hairline border keeps it readable on
  // pure black without the "white glow" the secondary-grey fill
  // produced. ChatGPT mobile uses the same near-invisible chip.
  modelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
  },
  modelPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    flexShrink: 1,
  },
  modelName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  compareHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  compareHeaderItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compareHeaderName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    maxWidth: 80,
  },
  compareHeaderVs: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginHorizontal: 4,
  },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    marginTop: 8,
  },
  emptySub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  compareWrap: {
    flex: 1,
    flexDirection: "row",
  },
  compareCol: {
    flex: 1,
  },
  colEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  },
  colEmptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  listContent: { paddingVertical: 12, paddingHorizontal: 12 },
  inputArea: {
    borderTopWidth: 0.5,
    paddingTop: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 26,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    maxHeight: 120,
    paddingTop: 2,
    paddingBottom: 2,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  attachSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  attachRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    gap: 14,
  },
  attachLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
});
