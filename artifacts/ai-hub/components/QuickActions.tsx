import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { QUICK_ACTIONS, QuickAction } from "@/constants/models";
import { useColors } from "@/hooks/useColors";

interface Props {
  onSelect: (action: QuickAction) => void;
}

function ActionTile({ action, onPress }: { action: QuickAction; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: pressed ? colors.accent : colors.secondary,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      onPress={onPress}
    >
      <View style={[styles.iconCircle, { backgroundColor: action.color + "33" }]}>
        <Ionicons
          name={action.icon as any}
          size={22}
          color={action.color}
        />
      </View>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {action.name}
      </Text>
    </Pressable>
  );
}

export function QuickActions({ onSelect }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.grid}>
        {QUICK_ACTIONS.map((action) => (
          <ActionTile
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
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: "22%",
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    gap: 6,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
});
