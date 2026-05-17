import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { ModelAvatar } from "@/components/ModelAvatar";
import { getModelById } from "@/constants/models";
type Vote = "like" | "dislike" | null;

interface Props {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** Model id stored on the message row. When supplied, the assistant
   *  bubble renders the matching ModelAvatar on its left so the user
   *  can tell which model produced each reply. */
  modelId?: string;
  /** Fired when the user taps Retry on an assistant message. Receives
   *  the assistant message id so the chat screen can find the
   *  preceding user turn and re-send it. */
  onRetry?: () => void;
}

function MessageBubbleImpl({
  role,
  content,
  streaming,
  modelId,
  onRetry,
}: Props) {
  const colors = useColors();
  const isUser = role === "user";
  const model = modelId ? getModelById(modelId) : null;
  const showDots = streaming && content.length === 0;
  const [vote, setVote] = useState<Vote>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectable, setSelectable] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(content);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMenuVisible(false);
  };

  const handleSelect = () => {
    setSelectable(true);
    setMenuVisible(false);
  };

  const handleVote = (next: Vote) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVote((prev) => (prev === next ? null : next));
    setMenuVisible(false);
  };

  const handleRetry = () => {
    setMenuVisible(false);
    onRetry?.();
  };

  const onLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuVisible(true);
  };

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowRight : styles.rowLeft,
      ]}
    >
      <View style={isUser ? styles.userCol : styles.assistantCol}>
        {!isUser && model && (
          <View style={styles.assistantHeader}>
            <ModelAvatar model={model} size={20} />
          </View>
        )}
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={350}
          style={[
            isUser ? styles.userBubble : styles.assistantBubble,
            isUser && {
              backgroundColor: colors.primary,
              borderBottomRightRadius: 4,
            },
          ]}
        >
          {showDots ? (
            <TypingDots color={colors.mutedForeground} />
          ) : (
            <View>
              <Text
                selectable={selectable}
                style={[
                  styles.text,
                  {
                    color: isUser ? colors.primaryForeground : colors.foreground,
                  },
                ]}
              >
                {content}
              </Text>
              {streaming && <BlinkingCursor color={colors.foreground} />}
            </View>
          )}
        </Pressable>

        {/* Inline action row — only on assistant messages once streaming
            is done. Hidden during the typing-dots state. */}
        {!isUser && !streaming && content.length > 0 && (
          <View style={styles.actionRow}>
            <ActionIcon
              name="copy-outline"
              tint={colors.mutedForeground}
              onPress={handleCopy}
            />
            {onRetry && (
              <ActionIcon
                name="refresh-outline"
                tint={colors.mutedForeground}
                onPress={handleRetry}
              />
            )}
            <ActionIcon
              name={vote === "like" ? "thumbs-up" : "thumbs-up-outline"}
              tint={vote === "like" ? colors.primary : colors.mutedForeground}
              onPress={() => handleVote("like")}
            />
            <ActionIcon
              name={vote === "dislike" ? "thumbs-down" : "thumbs-down-outline"}
              tint={
                vote === "dislike" ? "#F87171" : colors.mutedForeground
              }
              onPress={() => handleVote("dislike")}
            />
          </View>
        )}
      </View>

      {/* Long-press context menu. Mirrors ChatGPT's bubble action sheet
          so the user has Copy / Select / Retry / Like / Dislike in one
          place even after the message has scrolled off the inline-action
          surface area. */}
      <Modal
        transparent
        visible={menuVisible}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <View
            style={[
              styles.menuCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <MenuItem
              icon="copy-outline"
              label="Copy"
              tint={colors.foreground}
              onPress={handleCopy}
            />
            <MenuItem
              icon="text-outline"
              label="Select Text"
              tint={colors.foreground}
              onPress={handleSelect}
            />
            {!isUser && onRetry && (
              <MenuItem
                icon="refresh-outline"
                label="Retry"
                tint={colors.foreground}
                onPress={handleRetry}
              />
            )}
            {!isUser && (
              <>
                <MenuItem
                  icon={vote === "like" ? "thumbs-up" : "thumbs-up-outline"}
                  label="Like"
                  tint={
                    vote === "like" ? colors.primary : colors.foreground
                  }
                  onPress={() => handleVote("like")}
                />
                <MenuItem
                  icon={
                    vote === "dislike" ? "thumbs-down" : "thumbs-down-outline"
                  }
                  label="Dislike"
                  tint={vote === "dislike" ? "#F87171" : colors.foreground}
                  onPress={() => handleVote("dislike")}
                />
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// React.memo so a streaming update to one row doesn't re-render every
// already-settled row in the transcript. Equality checks the cheap
// scalars; React handles function/object identity itself for the rest.
export const MessageBubble = React.memo(MessageBubbleImpl, (prev, next) =>
  prev.role === next.role &&
  prev.content === next.content &&
  prev.streaming === next.streaming &&
  prev.modelId === next.modelId,
);

function ActionIcon({
  name,
  tint,
  onPress,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.actionIconBtn, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Ionicons name={name} size={16} color={tint} />
    </Pressable>
  );
}

function MenuItem({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: pressed ? "rgba(255,255,255,0.06)" : "transparent" },
      ]}
    >
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={[styles.menuLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

/** Blinking caret that sits beneath the streaming text. Replaces the
 *  static "▋" character which felt frozen — a slow opacity loop gives
 *  the visual heartbeat ChatGPT mobile has during generation. */
function BlinkingCursor({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.15,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 480,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        styles.cursor,
        { backgroundColor: color, opacity },
      ]}
    />
  );
}

function TypingDots({ color }: { color: string }) {
  const animsRef = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]);

  useEffect(() => {
    const anims = animsRef.current;
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  // memoise the dot views so the parent doesn't rebuild them every render
  const dots = useMemo(
    () =>
      animsRef.current.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: color,
              opacity: v,
              transform: [
                {
                  scale: v.interpolate({
                    inputRange: [0.3, 1],
                    outputRange: [0.8, 1.1],
                  }),
                },
              ],
            },
          ]}
        />
      )),
    [color],
  );

  return <View style={styles.dotsRow}>{dots}</View>;
}

const styles = StyleSheet.create({
  row: {
    marginVertical: 6,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  // Assistant avatar lives ABOVE the text as a small header chip
  // (ChatGPT mobile style), so the text below can wrap edge-to-edge
  // instead of being pushed inward by a side-aligned avatar slot.
  assistantHeader: {
    marginBottom: 4,
    marginLeft: 2,
  },
  userCol: {
    maxWidth: "82%",
  },
  assistantCol: {
    flex: 1,
  },
  // Assistant: no bubble background, just text on the page so the
  // line wraps to the full visible width like ChatGPT mobile.
  assistantBubble: {
    paddingVertical: 2,
  },
  userBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    alignSelf: "flex-start",
  },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 6,
    marginLeft: 4,
  },
  actionIconBtn: {
    padding: 2,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cursor: {
    width: 8,
    height: 14,
    marginTop: 4,
    marginLeft: 1,
    borderRadius: 2,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  menuCard: {
    minWidth: 220,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
