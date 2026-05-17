import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { useColors } from "@/hooks/useColors";
import { ModelAvatar } from "@/components/ModelAvatar";
import { getModelById } from "@/constants/models";

interface Props {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** Model id stored on the message row. When supplied, the assistant
   *  bubble renders the matching ModelAvatar on its left so the user
   *  can tell which model produced each reply (especially useful in
   *  compare mode or after switching models mid-conversation). */
  modelId?: string;
}

export function MessageBubble({ role, content, streaming, modelId }: Props) {
  const colors = useColors();
  const isUser = role === "user";
  const model = modelId ? getModelById(modelId) : null;

  // Three-dot "thinking" indicator shown when the assistant has been
  // asked but no tokens have streamed back yet. Replaces the static
  // block-cursor mid-stream so the user gets feedback that the request
  // is in flight, not stalled.
  const showDots = streaming && content.length === 0;

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowRight : styles.rowLeft,
      ]}
    >
      {!isUser && model && (
        <View style={styles.avatarSlot}>
          <ModelAvatar model={model} size={26} />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.primary : colors.card,
            borderBottomRightRadius: isUser ? 4 : 18,
            borderBottomLeftRadius: isUser ? 18 : 4,
          },
        ]}
      >
        {showDots ? (
          <TypingDots color={colors.mutedForeground} />
        ) : (
          <Text
            style={[
              styles.text,
              {
                color: isUser ? colors.primaryForeground : colors.foreground,
              },
            ]}
          >
            {content}
            {streaming && (
              <Text style={{ color: colors.mutedForeground }}>{"▋"}</Text>
            )}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * Three-dot pulse animation. Each dot fades + scales in sequence with
 * a 200ms phase offset so the row reads as a left-to-right wave.
 * Native driver so the animation doesn't block JS while the request
 * is in flight.
 */
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
          Animated.delay(i * 200),
          Animated.timing(v, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View style={styles.dotsRow}>
      {animsRef.current.map((v, i) => (
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
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginVertical: 3,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  avatarSlot: {
    marginRight: 8,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
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
});
