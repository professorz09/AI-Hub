import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { ModelAvatar } from "@/components/ModelAvatar";
import { getModelById } from "@/constants/models";
import { supabase } from "@/lib/supabase";

interface Conversation {
  id: number;
  title: string;
  model: string;
  category: string | null;
  created_at: string;
}

const FILTER_CATEGORIES = ["All", "Chat", "YouTube"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function groupByDate(convos: Conversation[]) {
  const groups = new Map<string, Conversation[]>();
  for (const c of convos) {
    const label = formatDate(c.created_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(c);
  }
  return groups;
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  // Per-row 3-dot menu / rename / delete-confirm state. Replaces the
  // OS-styled Alert.alert that only offered Delete — users wanted
  // Rename too, and the white iOS/Android alert clashed with the dark
  // app shell.
  const [menuConv, setMenuConv] = useState<Conversation | null>(null);
  const [renameConv, setRenameConv] = useState<Conversation | null>(null);
  const [renameText, setRenameText] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [confirmDelConv, setConfirmDelConv] = useState<Conversation | null>(
    null,
  );

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("conversations")
        .select("id, title, model, category, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setConversations((data ?? []) as Conversation[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  async function deleteConversation(id: number) {
    try {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error(e);
    }
  }

  async function commitRename() {
    if (!renameConv) return;
    const next = renameText.trim().slice(0, 60);
    if (!next || next === renameConv.title) {
      setRenameConv(null);
      return;
    }
    setRenameSaving(true);
    try {
      const { error } = await supabase
        .from("conversations")
        .update({ title: next })
        .eq("id", renameConv.id);
      if (error) throw error;
      setConversations((prev) =>
        prev.map((c) => (c.id === renameConv.id ? { ...c, title: next } : c)),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRenameConv(null);
    } catch (e) {
      console.error(e);
    } finally {
      setRenameSaving(false);
    }
  }

  const filtered =
    filter === "All"
      ? conversations
      : conversations.filter(
          (c) =>
            (c.category ?? "chat").toLowerCase() === filter.toLowerCase()
        );

  const groups = groupByDate(filtered);
  const groupEntries = Array.from(groups.entries());

  type ListItem =
    | { type: "header"; label: string; key: string }
    | { type: "item"; conv: Conversation; key: string };

  const flatData: ListItem[] = groupEntries.flatMap(([label, convos]) => [
    { type: "header", label, key: `h-${label}` } as ListItem,
    ...convos.map((c) => ({ type: "item", conv: c, key: `c-${c.id}` } as ListItem)),
  ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>History</Text>
        {/* Right-side spacer keeps the title visually centred. The
            previous settings icon had no handler — removing it instead
            of pretending it works. Wire a real settings route here
            when one exists. */}
        <View style={styles.rightSpacer} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        contentContainerStyle={styles.filtersContent}
      >
        {FILTER_CATEGORIES.map((cat) => {
          const active = filter === cat;
          const iconTint = active
            ? cat === "YouTube"
              ? "#FF0000"
              : colors.primaryForeground
            : cat === "YouTube"
              ? "#FF0000"
              : colors.mutedForeground;
          return (
            <Pressable
              key={cat}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : "transparent",
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter(cat)}
            >
              {cat === "Chat" && (
                <Ionicons
                  name="chatbubbles-outline"
                  size={16}
                  color={iconTint}
                  style={{ marginRight: 6 }}
                />
              )}
              {cat === "YouTube" && (
                <Ionicons
                  name="logo-youtube"
                  size={16}
                  color={iconTint}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text
                style={[
                  styles.chipText,
                  {
                    color: active
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  },
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : flatData.length === 0 ? (
        <View style={styles.emptyCenter}>
          <Ionicons name="chatbubbles-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No conversations yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>
                  {item.label}
                </Text>
              );
            }
            const { conv } = item;
            const model = getModelById(conv.model);
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed ? colors.accent : colors.card,
                  },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/chat/[id]",
                    params: { id: String(conv.id), modelId: conv.model },
                  })
                }
              >
                <ModelAvatar model={model} size={40} />
                <View style={styles.rowContent}>
                  <Text
                    style={[styles.rowTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {conv.title}
                  </Text>
                  <Text
                    style={[styles.rowDate, { color: colors.mutedForeground }]}
                  >
                    {new Date(conv.created_at).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  // Stop the nested press from bubbling to the row's
                  // onPress (which opens the chat). Without this the
                  // user tapping the ⋮ menu also opened the chat
                  // behind the menu sheet.
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMenuConv(conv);
                  }}
                >
                  <Ionicons
                    name="ellipsis-vertical"
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: bottomInset + 16 }}
        />
      )}

      {/* Action menu — Rename + Delete. Opens when the row's 3-dot is
          tapped; dismisses on backdrop tap or option selection. */}
      <Modal
        transparent
        visible={!!menuConv}
        animationType="fade"
        onRequestClose={() => setMenuConv(null)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuConv(null)}
        >
          <View
            style={[
              styles.menuCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                {
                  backgroundColor: pressed
                    ? "rgba(255,255,255,0.06)"
                    : "transparent",
                },
              ]}
              onPress={() => {
                const c = menuConv;
                if (!c) return;
                setMenuConv(null);
                setRenameText(c.title);
                setRenameConv(c);
              }}
            >
              <Ionicons
                name="pencil-outline"
                size={18}
                color={colors.foreground}
              />
              <Text
                style={[styles.menuLabel, { color: colors.foreground }]}
              >
                Rename
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                {
                  backgroundColor: pressed
                    ? "rgba(248,113,113,0.12)"
                    : "transparent",
                },
              ]}
              onPress={() => {
                const c = menuConv;
                if (!c) return;
                setMenuConv(null);
                setConfirmDelConv(c);
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#F87171" />
              <Text style={[styles.menuLabel, { color: "#F87171" }]}>
                Delete
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Rename dialog */}
      <Modal
        transparent
        visible={!!renameConv}
        animationType="fade"
        onRequestClose={() => setRenameConv(null)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setRenameConv(null)}
        >
          <Pressable
            style={[
              styles.dialogCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => {}}
          >
            <Text style={[styles.dialogTitle, { color: colors.foreground }]}>
              Rename conversation
            </Text>
            <TextInput
              style={[
                styles.dialogInput,
                {
                  backgroundColor: colors.input,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Title"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={commitRename}
            />
            <View style={styles.dialogActions}>
              <Pressable
                style={[styles.dialogBtn, { backgroundColor: colors.secondary }]}
                onPress={() => setRenameConv(null)}
                disabled={renameSaving}
              >
                <Text
                  style={[styles.dialogBtnText, { color: colors.foreground }]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.dialogBtn,
                  {
                    backgroundColor:
                      renameText.trim() && !renameSaving
                        ? colors.primary
                        : colors.accent,
                  },
                ]}
                onPress={commitRename}
                disabled={!renameText.trim() || renameSaving}
              >
                {renameSaving ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primaryForeground}
                  />
                ) : (
                  <Text
                    style={[
                      styles.dialogBtnText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete-confirm dialog */}
      <Modal
        transparent
        visible={!!confirmDelConv}
        animationType="fade"
        onRequestClose={() => setConfirmDelConv(null)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setConfirmDelConv(null)}
        >
          <Pressable
            style={[
              styles.dialogCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => {}}
          >
            <Text style={[styles.dialogTitle, { color: colors.foreground }]}>
              Delete conversation
            </Text>
            <Text
              style={[styles.dialogBody, { color: colors.mutedForeground }]}
              numberOfLines={2}
            >
              Delete &quot;{confirmDelConv?.title}&quot;? This can&apos;t be undone.
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={[styles.dialogBtn, { backgroundColor: colors.secondary }]}
                onPress={() => setConfirmDelConv(null)}
              >
                <Text
                  style={[styles.dialogBtnText, { color: colors.foreground }]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[styles.dialogBtn, { backgroundColor: "#F87171" }]}
                onPress={() => {
                  const c = confirmDelConv;
                  setConfirmDelConv(null);
                  if (c) deleteConversation(c.id);
                }}
              >
                <Text style={[styles.dialogBtnText, { color: "#FFFFFF" }]}>
                  Delete
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  rightSpacer: {
    // Same width as the chevron-back icon (26) + hitSlop margin so the
    // title stays optically centred without the settings icon.
    width: 26,
  },
  // Earlier maxHeight: 52 was tight enough that the chip border was
  // getting clipped at the top/bottom on devices where the system
  // font scaled the chip text up a touch. Removing the cap and
  // letting the ScrollView size to its content fixes it without
  // changing the visible padding.
  filters: {
    flexGrow: 0,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 38,
  },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  dateLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginBottom: 6,
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  rowContent: { flex: 1 },
  rowTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  rowDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
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
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  menuLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 14,
  },
  dialogTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  dialogBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 19,
  },
  dialogInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  dialogActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  dialogBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
