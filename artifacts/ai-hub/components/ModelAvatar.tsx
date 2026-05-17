import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { AIModel } from "@/constants/models";

interface Props {
  model: AIModel;
  size?: number;
}

export function ModelAvatar({ model, size = 52 }: Props) {
  const [failed, setFailed] = useState(false);
  const initials = model.name.slice(0, 1).toUpperCase();
  const fontSize = size * 0.4;
  const logoSize = Math.round(size * 0.62);

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
      {!failed && model.logoUrl ? (
        <Image
          source={{ uri: model.logoUrl }}
          style={{ width: logoSize, height: logoSize }}
          contentFit="contain"
          transition={150}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.initial, { fontSize, color: model.textColor }]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initial: {
    fontFamily: "Inter_700Bold",
  },
});
