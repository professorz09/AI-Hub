import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
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
} from "@/constants/models";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedModel, setSelectedModel] = useState<AIModel>(DEFAULT_MODEL);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [inputText, setInputText] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  async function handleSend(text: string, systemPrompt?: string) {
    if (!text.trim()) return;
    try {
      const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const resp = await fetch(`${baseUrl}/api/openrouter/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: text.slice(0, 60),
          model: selectedModel.id,
          category: systemPrompt ? "custom" : "chat",
        }),
      });
      if (!resp.ok) throw new Error("Failed to create conversation");
      const conv = await resp.json();
      setInputText("");
      router.push({
        pathname: "/chat/[id]",
        params: {
          id: String(conv.id),
          initialMessage: text,
          modelId: selectedModel.id,
          systemPrompt: systemPrompt ?? "",
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  function handleQuickAction(action: QuickAction) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleSend(`Let's explore: ${action.name}`, action.systemPrompt);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.push("/history")} hitSlop={8}>
          <Ionicons name="menu" size={26} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable hitSlop={8}>
          <Ionicons name="home-outline" size={24} color={colors.mutedForeground} />
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
          <View style={[styles.chevron, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
          <Pressable hitSlop={8}>
            <Ionicons name="add" size={22} color={colors.mutedForeground} />
          </Pressable>
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
          <Pressable hitSlop={8}>
            <Ionicons name="mic-outline" size={22} color={colors.mutedForeground} />
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
    paddingVertical: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
});
