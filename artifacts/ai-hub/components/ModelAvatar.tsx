import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { AIModel } from "@/constants/models";

interface Props {
  model: AIModel;
  size?: number;
}

function ModelAvatarImpl({ model, size = 52 }: Props) {
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

// Memoised so list rows / chrome (header avatar, picker rows, message
// bubbles) don't re-render when the parent re-renders for an unrelated
// state change. Equality on model identity + size is enough — the
// component reads no other props.
export const ModelAvatar = React.memo(
  ModelAvatarImpl,
  (prev, next) => prev.model === next.model && prev.size === next.size,
);

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
