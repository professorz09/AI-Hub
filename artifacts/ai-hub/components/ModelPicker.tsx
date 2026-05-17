import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AI_MODELS, AIModel } from "@/constants/models";
import { ModelAvatar } from "./ModelAvatar";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  /** Single-select active model (used in single mode and as primary in multi). */
  selectedId: string;
  /** Multi-select picker: tap toggles, max 2 picks. */
  multi?: boolean;
  selectedIds?: string[];
  onSelect: (model: AIModel) => void;
  onToggle?: (model: AIModel) => void;
  onClose: () => void;
}

function Badge({ type }: { type: "hot" | "think" | "think+hot" }) {
  const colors = useColors();
  if (type === "hot") {
    return (
      <View style={[styles.badge, { backgroundColor: "#FF6B35" }]}>
        <Ionicons name="flame" size={10} color="#FFF" />
        <Text style={styles.badgeText}>Hot</Text>
      </View>
    );
  }
  if (type === "think") {
    return (
      <View style={[styles.badge, { backgroundColor: colors.accent }]}>
        <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Think</Text>
      </View>
    );
  }
  return (
    <View style={styles.badgeRow}>
      <View style={[styles.badge, { backgroundColor: colors.accent }]}>
        <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Think</Text>
      </View>
      <View style={[styles.badge, { backgroundColor: "#FF6B35" }]}>
        <Ionicons name="flame" size={10} color="#FFF" />
        <Text style={styles.badgeText}>Hot</Text>
      </View>
    </View>
  );
}

function ModelRow({
  model,
  selected,
  multi,
  disabled,
  onPress,
}: {
  model: AIModel;
  selected: boolean;
  multi: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected
            ? colors.accent
            : pressed
              ? colors.secondary
              : colors.card,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
      onPress={disabled ? undefined : onPress}
    >
      <ModelAvatar model={model} size={44} />
      <View style={styles.rowText}>
        <View style={styles.rowNameRow}>
          <Text style={[styles.modelName, { color: colors.foreground }]}>
            {model.name}
          </Text>
          <Text style={[styles.modelVersion, { color: colors.mutedForeground }]}>
            {"  "}
            {model.version}
          </Text>
        </View>
        <Text
          style={[styles.modelDesc, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          {model.description}
        </Text>
      </View>
      {multi ? (
        <View
          style={[
            styles.check,
            {
              backgroundColor: selected ? colors.primary : "transparent",
              borderColor: selected ? colors.primary : colors.border,
            },
          ]}
        >
          {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      ) : (
        model.badge && <Badge type={model.badge} />
      )}
    </Pressable>
  );
}

export function ModelPicker({
  visible,
  selectedId,
  multi = false,
  selectedIds = [],
  onSelect,
  onToggle,
  onClose,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const recent = AI_MODELS.filter((m) => m.section === "recent");
  const more = AI_MODELS.filter((m) => m.section === "more");

  const isSelected = (id: string) =>
    multi ? selectedIds.includes(id) : id === selectedId;
  const maxReached = multi && selectedIds.length >= 2;

  function handlePress(m: AIModel) {
    if (multi) {
      onToggle?.(m);
    } else {
      onSelect(m);
      onClose();
    }
  }

  function renderRow(m: AIModel) {
    const selected = isSelected(m.id);
    return (
      <ModelRow
        key={m.id}
        model={m}
        selected={selected}
        multi={multi}
        disabled={multi && !selected && maxReached}
        onPress={() => handlePress(m)}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.handle} />
        <Text style={[styles.title, { color: colors.foreground }]}>
          {multi ? `Pick 2 models (${selectedIds.length}/2)` : "Choose your model"}
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[styles.section, { color: colors.mutedForeground }]}>
            Recently
          </Text>
          {recent.map(renderRow)}
          <Text style={[styles.section, { color: colors.mutedForeground }]}>
            More
          </Text>
          {more.map(renderRow)}
        </ScrollView>
        {multi && (
          <Pressable
            style={[
              styles.doneBtn,
              {
                backgroundColor:
                  selectedIds.length === 2 ? colors.primary : colors.accent,
              },
            ]}
            onPress={onClose}
            disabled={selectedIds.length !== 2}
          >
            <Text
              style={[styles.doneText, { color: colors.primaryForeground }]}
            >
              Done
            </Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: "75%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#555",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },
  section: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginBottom: 8,
    marginTop: 8,
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  modelName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  modelVersion: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  modelDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#FFFFFF",
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  doneText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
