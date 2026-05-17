import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  Modal,
  Alert,
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

const YOUTUBE_URL_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{6,}/i;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedModel, setSelectedModel] = useState<AIModel>(DEFAULT_MODEL);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [inputText, setInputText] = useState("");
  const [youtubeVisible, setYoutubeVisible] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  async function startConversation(args: {
    title: string;
    initialMessage: string;
    systemPrompt: string;
    category: string;
  }) {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          title: args.title.slice(0, 60),
          model: selectedModel.id,
          category: args.category,
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
          modelId: selectedModel.id,
          systemPrompt: args.systemPrompt,
        },
      });
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Couldn't start the conversation. Please try again.");
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

  function handleQuickAction(action: QuickAction) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action.id === "youtube") {
      setYoutubeUrl("");
      setYoutubeVisible(true);
      return;
    }
    // "chat" action just focuses the user back on writing — no-op besides haptic.
  }

  function submitYoutube() {
    const url = youtubeUrl.trim();
    if (!YOUTUBE_URL_RE.test(url)) {
      Alert.alert(
        "Invalid link",
        "Please paste a valid YouTube video URL (youtube.com/watch?v=... or youtu.be/...).",
      );
      return;
    }
    const youtube = QUICK_ACTIONS.find((a) => a.id === "youtube")!;
    setYoutubeVisible(false);
    startConversation({
      title: "YouTube Summary",
      initialMessage: `Please summarize this YouTube video:\n${url}`,
      systemPrompt: youtube.systemPrompt,
      category: "youtube",
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.push("/history")} hitSlop={8}>
          <Ionicons name="menu" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.brand, { color: colors.foreground }]}>AI Hub</Text>
        <Pressable hitSlop={8} onPress={() => router.push("/history")}>
          <Ionicons name="time-outline" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPickerVisible(true);
          }}
          style={styles.avatarWrap}
        >
          <ModelAvatar model={selectedModel} size={88} />
          <View
            style={[
              styles.chevron,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
          </View>
        </Pressable>

        <Text style={[styles.greeting, { color: colors.foreground }]}>
          Hi, I&apos;m{" "}
          <Text style={{ color: colors.foreground }}>{selectedModel.name}</Text>
          {"  "}
          <Text style={[styles.version, { color: colors.mutedForeground }]}>
            {selectedModel.version}
          </Text>
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          How can I help you today?
        </Text>

        <View style={[styles.inputBar, { backgroundColor: colors.input }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Write your message..."
            placeholderTextColor={colors.mutedForeground}
            value={inputText}
            onChangeText={setInputText}
            returnKeyType="send"
            onSubmitEditing={() => handleSend(inputText)}
            multiline={false}
          />
          <Pressable
            hitSlop={8}
            onPress={() => handleSend(inputText)}
            disabled={!inputText.trim()}
            style={[
              styles.sendBtn,
              {
                backgroundColor: inputText.trim() ? colors.primary : colors.accent,
              },
            ]}
          >
            <Ionicons name="arrow-up" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>

      <QuickActions onSelect={handleQuickAction} />
      <View style={{ height: bottomInset }} />

      <ModelPicker
        visible={pickerVisible}
        selectedId={selectedModel.id}
        onSelect={setSelectedModel}
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
                borderColor: colors.border,
              },
            ]}
            placeholder="https://youtube.com/watch?v=..."
            placeholderTextColor={colors.mutedForeground}
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={submitYoutube}
          />
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
