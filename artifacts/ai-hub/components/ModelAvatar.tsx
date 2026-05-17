import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { AIModel } from "@/constants/models";

interface Props {
  model: AIModel;
  size?: number;
}

export function ModelAvatar({ model, size = 52 }: Props) {
  const initials = model.name.slice(0, 1).toUpperCase();
  const fontSize = size * 0.4;
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: model.color,
        },
      ]}
    >
      <Text style={[styles.initial, { fontSize, color: model.textColor }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontFamily: "Inter_700Bold",
  },
});
