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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id: string;
    initialMessage?: string;
    modelId?: string;
    systemPrompt?: string;
  }>();

  const conversationId = params.id;
  const [model, setModel] = useState<AIModel>(
    getModelById(params.modelId ?? "")
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [attachVisible, setAttachVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const inputRef = useRef<TextInput>(null);
  const hasSentInitial = useRef(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  const loadMessages = useCallback(async () => {
    try {
      const resp = await fetch(
        `${baseUrl}/api/openrouter/conversations/${conversationId}/messages`
      );
      if (resp.ok) {
        const data = await resp.json();
        setMessages(
          (data as { id: number; role: string; content: string }[]).map((m) => ({
            id: String(m.id),
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, baseUrl]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!isLoading && params.initialMessage && !hasSentInitial.current) {
      hasSentInitial.current = true;
      sendMessage(params.initialMessage);
    }
  }, [isLoading]);

  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInputText("");
    setIsStreaming(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const resp = await fetch(
        `${baseUrl}/api/openrouter/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text,
            systemPrompt: params.systemPrompt ?? "",
            model: model.id,
          }),
        }
      );

      if (!resp.ok || !resp.body) throw new Error("Stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data) as { content?: string; done?: boolean; error?: string };
            if (parsed.error) break;
            if (parsed.done) break;
            if (parsed.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.content }
                    : m
                )
              );
            }
          } catch {}
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m
        )
      );
    } catch (e) {
      console.error(e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Something went wrong. Please try again.", streaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  }

  const reversedMessages = [...messages].reverse();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="menu" size={26} color={colors.foreground} />
        </Pressable>
        <Pressable
          style={styles.modelBtn}
          onPress={() => setPickerVisible(true)}
          hitSlop={4}
        >
          <ModelAvatar model={model} size={28} />
          <Text style={[styles.modelName, { color: colors.foreground }]}>
            {model.name}{" "}
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {model.version}
            </Text>
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => router.push("/")} hitSlop={8}>
          <Ionicons name="home-outline" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.primary} size="large" />
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
          <FlatList
            data={reversedMessages}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageBubble
                role={item.role}
                content={item.content}
                streaming={!!item.streaming}
              />
            )}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
          />
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
            <Pressable
              hitSlop={8}
              onPress={() => setAttachVisible(true)}
            >
              <Ionicons name="add-circle" size={26} color={colors.mutedForeground} />
            </Pressable>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: colors.foreground }]}
              placeholder="Write your message..."
              placeholderTextColor={colors.mutedForeground}
              value={inputText}
              onChangeText={setInputText}
              multiline
              returnKeyType="default"
            />
            <Pressable hitSlop={8}>
              <Ionicons name="mic-outline" size={22} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    inputText.trim() && !isStreaming
                      ? colors.primary
                      : colors.accent,
                },
              ]}
              onPress={() => sendMessage(inputText)}
              disabled={!inputText.trim() || isStreaming}
            >
              <Ionicons name="arrow-up" size={18} color={colors.primaryForeground} />
            </Pressable>
          </View>
          <View style={styles.actionsRow}>
            <Pressable style={[styles.searchBtn, { backgroundColor: colors.primary + "33" }]}>
              <Ionicons name="globe-outline" size={15} color={colors.primary} />
              <Text style={[styles.searchText, { color: colors.primary }]}>Search</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ModelPicker
        visible={pickerVisible}
        selectedId={model.id}
        onSelect={setModel}
        onClose={() => setPickerVisible(false)}
      />

      <Modal
        visible={attachVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAttachVisible(false)} />
        <View style={[styles.attachSheet, { backgroundColor: colors.card, paddingBottom: bottomInset + 16 }]}>
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
              <Ionicons name={item.icon as any} size={22} color={colors.foreground} />
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
  modelName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
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
  listContent: { paddingVertical: 12 },
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
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 4,
    gap: 8,
  },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  searchText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
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
