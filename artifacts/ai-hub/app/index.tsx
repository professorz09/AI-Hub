import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { ModelAvatar } from "@/components/ModelAvatar";
import { ModelPicker } from "@/components/ModelPicker";
import { QuickActions } from "@/components/QuickActions";
import {
  DEFAULT_MODEL,
  AIModel,
  QuickAction,
  QUICK_ACTIONS,
} from "@/constants/models";
import { supabase } from "@/lib/supabase";

// Strict YouTube URL matcher — require https:// and canonical host to
// avoid feeding attacker-controlled strings into the LLM prompt as
// "trusted" content. Captures the 11-char video id so we can pass a
// normalised https://youtu.be/<id> URL to the model instead of the raw
// input.
const YOUTUBE_URL_RE =
  /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&#].*)?$/;

// Hardcoded YouTube-summary model. Pinning it here means the YouTube
// quick action always runs against the same model regardless of the
// home picker. Using GLM 4.5 Air (Z.AI) — free tier, reliable
// availability (the Llama free route is constantly rate-limited).
const YOUTUBE_MODEL_ID = "z-ai/glm-4.5-air:free";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedModel, setSelectedModel] = useState<AIModel>(DEFAULT_MODEL);
  const [compareModels, setCompareModels] = useState<AIModel[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [inputText, setInputText] = useState("");
  const [youtubeVisible, setYoutubeVisible] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  // Inline error for the YouTube modal — replaces the Alert.alert popup
  // that felt heavy / OS-styled. Cleared on every input change so the
  // user sees their typing feedback, not a stale error.
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  // Compare-mode picker error — same pattern, surfaces "pick 2 models"
  // inline instead of via Alert.
  const [compareError, setCompareError] = useState<string | null>(null);
  // Disables the send button + shows a spinner while we're creating a
  // conversation row and navigating to the chat screen. Without this
  // the tap felt unresponsive — a 300-800 ms gap between send tap and
  // chat screen mount looked like a frozen UI.
  const [navigating, setNavigating] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const compareReady = compareMode && compareModels.length === 2;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  async function startConversation(args: {
    title: string;
    initialMessage: string;
    systemPrompt: string;
    category: string;
    /** Force a specific model id, bypassing the home picker + compare
     *  mode. Used by quick actions like YouTube summary that always
     *  run against the same model regardless of the user's current
     *  picker selection. */
    forceModelId?: string;
  }) {
    if (navigating) return;
    if (!args.forceModelId && compareMode && compareModels.length !== 2) {
      setCompareError("Pick 2 models to compare");
      setPickerVisible(true);
      return;
    }
    const useCompare =
      !args.forceModelId && compareMode && compareModels.length === 2;
    const primaryFromState = useCompare ? compareModels[0]! : selectedModel;
    const primary = args.forceModelId
      ? { ...primaryFromState, id: args.forceModelId }
      : primaryFromState;

    setNavigating(true);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          title: args.title.slice(0, 60),
          model: primary.id,
          category: args.category,
          mode: useCompare ? "compare" : "single",
          models: useCompare ? compareModels.map((m) => m.id) : null,
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Failed to create conversation");
      setInputText("");
      router.push({
        pathname: "/chat/[id]",
        params: {
          id: String(data.id),
          initialMessage: args.initialMessage,
          modelId: primary.id,
          systemPrompt: args.systemPrompt,
          mode: useCompare ? "compare" : "single",
          models: useCompare ? compareModels.map((m) => m.id).join(",") : "",
        },
      });
      // Release the navigating flag a tick later so it doesn't flicker
      // back to "ready" before the chat screen has actually animated in.
      setTimeout(() => setNavigating(false), 400);
    } catch (e) {
      console.error(e);
      setNavigating(false);
      setCompareError("Couldn't start the conversation. Try again.");
    }
  }

  function handleSend(text: string) {
    if (!text.trim()) return;
    startConversation({
      title: text,
      initialMessage: text,
      systemPrompt: "",
      category: "chat",
    });
  }

  function toggleCompareModel(m: AIModel) {
    setCompareModels((prev) => {
      const exists = prev.find((p) => p.id === m.id);
      if (exists) return prev.filter((p) => p.id !== m.id);
      if (prev.length >= 2) return prev;
      return [...prev, m];
    });
  }

  function toggleCompareMode() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCompareMode((prev) => {
      const next = !prev;
      if (next && compareModels.length === 0) {
        setCompareModels([selectedModel]);
        setPickerVisible(true);
      }
      return next;
    });
  }

  function handleQuickAction(action: QuickAction) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action.id === "youtube") {
      setYoutubeUrl("");
      setYoutubeError(null);
      setYoutubeVisible(true);
      return;
    }
    if (action.id === "chat") {
      // Bring focus to the message input — previously this was a no-op
      // (just a haptic) which made the button feel broken.
      inputRef.current?.focus();
      return;
    }
  }

  function submitYoutube() {
    const url = youtubeUrl.trim();
    const match = url.match(YOUTUBE_URL_RE);
    if (!match) {
      setYoutubeError(
        "Not a valid YouTube link. Try a https://youtube.com/watch?v=… or https://youtu.be/… URL.",
      );
      return;
    }
    // Pass only the canonical short-form URL with the 11-char id we
    // captured. Strips tracking params, playlist contexts, and any
    // attacker-controlled query string that might otherwise reach the
    // model as authoritative content.
    const videoId = match[1];
    const cleanUrl = `https://youtu.be/${videoId}`;
    const youtube = QUICK_ACTIONS.find((a) => a.id === "youtube")!;
    setYoutubeVisible(false);
    // Force Gemini for the initial summary turn. After that, the
    // user can switch model from the chat header picker for follow-up
    // turns — the conversation row's `model` column is updated by the
    // chat screen's model swap, so subsequent sends use the new pick.
    startConversation({
      title: "YouTube Summary",
      initialMessage: `Please summarize this YouTube video:\n${cleanUrl}`,
      systemPrompt: youtube.systemPrompt,
      category: "youtube",
      forceModelId: YOUTUBE_MODEL_ID,
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.push("/history")} hitSlop={8}>
          <Ionicons name="menu" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.brand, { color: colors.foreground }]}>AI Hub</Text>
        <Pressable
          hitSlop={8}
          onPress={toggleCompareMode}
          style={[
            styles.compareBtn,
            {
              backgroundColor: compareMode ? colors.primary : colors.secondary,
            },
          ]}
        >
          <Ionicons
            name="git-compare-outline"
            size={14}
            color={compareMode ? colors.primaryForeground : colors.mutedForeground}
          />
          <Text
            style={[
              styles.compareBtnText,
              {
                color: compareMode
                  ? colors.primaryForeground
                  : colors.mutedForeground,
              },
            ]}
          >
            Compare
          </Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPickerVisible(true);
          }}
          style={styles.avatarWrap}
          hitSlop={8}
        >
          {compareMode ? (
            // Side-by-side with a clean "vs" pill between, instead of
            // the earlier overlapping circles which read as one weird
            // bubble on phones. Empty slot shows a dashed placeholder
            // so it's obvious the user still needs to pick model #2.
            <View style={styles.compareAvatars}>
              <ModelAvatar
                model={compareModels[0] ?? selectedModel}
                size={64}
              />
              <View
                style={[
                  styles.vsPill,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.vsPillText, { color: colors.mutedForeground }]}>
                  vs
                </Text>
              </View>
              {compareModels[1] ? (
                <ModelAvatar model={compareModels[1]} size={64} />
              ) : (
                <View
                  style={[
                    styles.avatarPlaceholder,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.secondary,
                    },
                  ]}
                >
                  <Ionicons name="add" size={28} color={colors.mutedForeground} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.singleAvatarWrap}>
              <ModelAvatar model={selectedModel} size={88} />
              <View
                style={[
                  styles.chevron,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color={colors.mutedForeground}
                />
              </View>
            </View>
          )}
        </Pressable>

        {compareMode ? (
          <Text style={[styles.greeting, { color: colors.foreground }]}>
            {compareReady
              ? `${compareModels[0]!.name} vs ${compareModels[1]!.name}`
              : "Pick 2 models to compare"}
          </Text>
        ) : (
          <Text style={[styles.greeting, { color: colors.foreground }]}>
            Hi, I&apos;m{" "}
            <Text style={{ color: colors.foreground }}>
              {selectedModel.name}
            </Text>
            {"  "}
            <Text style={[styles.version, { color: colors.mutedForeground }]}>
              {selectedModel.version}
            </Text>
          </Text>
        )}
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {compareMode
            ? "Same prompt, two models, side by side."
            : "How can I help you today?"}
        </Text>

        <View style={[styles.inputBar, { backgroundColor: colors.input }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Write your message..."
            placeholderTextColor={colors.mutedForeground}
            value={inputText}
            onChangeText={(t) => {
              setInputText(t);
              if (compareError) setCompareError(null);
            }}
            returnKeyType="send"
            onSubmitEditing={() => handleSend(inputText)}
            editable={!navigating}
            multiline={false}
          />
          <Pressable
            hitSlop={8}
            onPress={() => handleSend(inputText)}
            disabled={!inputText.trim() || navigating}
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  inputText.trim() && !navigating
                    ? colors.primary
                    : colors.accent,
              },
            ]}
          >
            {navigating ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Ionicons name="arrow-up" size={18} color={colors.primaryForeground} />
            )}
          </Pressable>
        </View>
        {compareError && (
          <Text style={[styles.inlineError, { color: colors.destructive ?? "#F87171" }]}>
            {compareError}
          </Text>
        )}
      </View>

      <QuickActions onSelect={handleQuickAction} />
      <View style={{ height: bottomInset }} />

      <ModelPicker
        visible={pickerVisible}
        selectedId={selectedModel.id}
        multi={compareMode}
        selectedIds={compareModels.map((m) => m.id)}
        onSelect={setSelectedModel}
        onToggle={toggleCompareModel}
        onClose={() => setPickerVisible(false)}
      />

      <Modal
        visible={youtubeVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setYoutubeVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setYoutubeVisible(false)}
        />
        <View
          style={[
            styles.ytSheet,
            {
              backgroundColor: colors.card,
              paddingBottom: bottomInset + 20,
            },
          ]}
        >
          <View style={styles.ytHeader}>
            <View
              style={[styles.ytIcon, { backgroundColor: "#FF0000" + "22" }]}
            >
              <Ionicons name="logo-youtube" size={22} color="#FF0000" />
            </View>
            <Text style={[styles.ytTitle, { color: colors.foreground }]}>
              Summarize a YouTube video
            </Text>
          </View>
          <Text style={[styles.ytSub, { color: colors.mutedForeground }]}>
            Paste a YouTube link and {selectedModel.name} will give you a
            structured summary.
          </Text>
          <TextInput
            style={[
              styles.ytInput,
              {
                backgroundColor: colors.input,
                color: colors.foreground,
                borderColor: youtubeError
                  ? (colors.destructive ?? "#F87171")
                  : colors.border,
              },
            ]}
            placeholder="https://youtube.com/watch?v=..."
            placeholderTextColor={colors.mutedForeground}
            value={youtubeUrl}
            onChangeText={(t) => {
              setYoutubeUrl(t);
              if (youtubeError) setYoutubeError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={submitYoutube}
          />
          {youtubeError && (
            <View style={styles.ytErrorRow}>
              <Ionicons
                name="alert-circle"
                size={14}
                color={colors.destructive ?? "#F87171"}
              />
              <Text style={[styles.ytErrorText, { color: colors.destructive ?? "#F87171" }]}>
                {youtubeError}
              </Text>
            </View>
          )}
          <View style={styles.ytActions}>
            <Pressable
              style={[styles.ytBtn, { backgroundColor: colors.secondary }]}
              onPress={() => setYoutubeVisible(false)}
            >
              <Text style={[styles.ytBtnText, { color: colors.foreground }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.ytBtn,
                {
                  backgroundColor: youtubeUrl.trim()
                    ? colors.primary
                    : colors.accent,
                },
              ]}
              onPress={submitYoutube}
              disabled={!youtubeUrl.trim()}
            >
              <Text
                style={[styles.ytBtnText, { color: colors.primaryForeground }]}
              >
                Summarize
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  brand: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    letterSpacing: 0.3,
  },
  compareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  compareBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  compareAvatars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  singleAvatarWrap: {
    position: "relative",
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  vsPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  vsPillText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inlineError: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  ytErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -6,
  },
  ytErrorText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  avatarWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  chevron: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    textAlign: "center",
  },
  version: {
    fontFamily: "Inter_400Regular",
    fontSize: 20,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16,
  },
  inputBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  ytSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },
  ytHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ytIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  ytTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  ytSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  ytInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  ytActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  ytBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ytBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
