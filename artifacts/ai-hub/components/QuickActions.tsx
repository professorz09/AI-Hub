import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { QUICK_ACTIONS, QuickAction } from "@/constants/models";
import { useColors } from "@/hooks/useColors";

interface Props {
  onSelect: (action: QuickAction) => void;
}

function ActionCard({
  action,
  onPress,
}: {
  action: QuickAction;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.accent : colors.secondary,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      onPress={onPress}
    >
      <View style={[styles.iconCircle, { backgroundColor: action.color + "26" }]}>
        <Ionicons name={action.icon as any} size={20} color={action.color} />
      </View>
      <Text style={[styles.label, { color: colors.foreground }]}>
        {action.name}
      </Text>
    </Pressable>
  );
}

export function QuickActions({ onSelect }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.row}>
        {QUICK_ACTIONS.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            onPress={() => onSelect(action)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
