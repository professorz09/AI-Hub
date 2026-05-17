import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
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

  function confirmDelete(conv: Conversation) {
    Alert.alert("Delete conversation", `Delete "${conv.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteConversation(conv.id),
      },
    ]);
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
                  size={14}
                  color={iconTint}
                  style={{ marginRight: 4 }}
                />
              )}
              {cat === "YouTube" && (
                <Ionicons
                  name="logo-youtube"
                  size={14}
                  color={iconTint}
                  style={{ marginRight: 4 }}
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
                  // behind the confirm alert.
                  onPress={(e) => {
                    e.stopPropagation();
                    confirmDelete(conv);
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
  filters: {
    maxHeight: 52,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
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
});
