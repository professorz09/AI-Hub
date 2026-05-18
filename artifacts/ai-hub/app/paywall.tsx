import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useEntitlement } from "@/hooks/useEntitlement";

// Static feature list — surfaces value without depending on the
// store-fetched offering, which can be slow on cold start.
const FEATURES = [
  "Unlimited chats across every model",
  "GPT-5, Claude 4.5, Gemini Pro, GLM 4.5 — all included",
  "Compare two models side-by-side",
  "YouTube summaries + web search",
  "No ads, no waitlist, priority routing",
];

// Identifiers we expect in the RevenueCat offering. Defaults to the
// standard RC package IDs ("$rc_monthly" / "$rc_annual") which is
// what the dashboard auto-assigns when you attach products to a
// package via the UI. Override at config time if you use custom IDs.
const MONTHLY_PKG_ID = "$rc_monthly";
const YEARLY_PKG_ID = "$rc_annual";

export default function PaywallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { offering, purchase, restore, loading, error, refresh } =
    useEntitlement();
  const [selectedId, setSelectedId] = useState<string>(YEARLY_PKG_ID);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const { monthlyPkg, yearlyPkg } = useMemo(() => {
    const pkgs = offering?.availablePackages ?? [];
    return {
      monthlyPkg: pkgs.find((p) => p.identifier === MONTHLY_PKG_ID) ?? null,
      yearlyPkg: pkgs.find((p) => p.identifier === YEARLY_PKG_ID) ?? null,
    };
  }, [offering]);

  // Derive a "per-month effective price" for the yearly tier so the
  // savings copy stays honest if the user changes prices in the
  // store. Falls back to the headline string when amounts aren't
  // available (e.g. the offering hasn't loaded yet).
  const yearlyMonthlyEquivalent = useMemo(() => {
    if (!yearlyPkg) return null;
    const price = yearlyPkg.product.price;
    if (!price) return null;
    const monthly = price / 12;
    const code = yearlyPkg.product.currencyCode;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        maximumFractionDigits: 2,
      }).format(monthly);
    } catch {
      return `${code} ${monthly.toFixed(2)}`;
    }
  }, [yearlyPkg]);

  async function handlePurchase() {
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await purchase(selectedId);
    } catch {
      // error already surfaced via context
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    try {
      await restore();
    } finally {
      setRestoring(false);
    }
  }

  function openLegal(url: string) {
    Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topInset + 20, paddingBottom: bottomInset + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <View style={[styles.heroBadge, { backgroundColor: colors.card }]}>
            <Ionicons name="sparkles" size={26} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            AI Hub Pro
          </Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            Every model. One subscription.
          </Text>
        </View>

        <View style={styles.featuresWrap}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <View
                style={[
                  styles.featureCheck,
                  { backgroundColor: colors.primary + "26" },
                ]}
              >
                <Ionicons name="checkmark" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.featureText, { color: colors.foreground }]}>
                {f}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.plansWrap}>
          <PlanCard
            label="Yearly"
            price={yearlyPkg?.product.priceString ?? "$199.99"}
            perPeriod="per year"
            footnote={
              yearlyMonthlyEquivalent
                ? `${yearlyMonthlyEquivalent}/mo billed yearly`
                : "About $16.67/mo billed yearly"
            }
            badge="SAVE 17%"
            selected={selectedId === YEARLY_PKG_ID}
            onPress={() => setSelectedId(YEARLY_PKG_ID)}
            colors={colors}
            recommended
          />
          <PlanCard
            label="Monthly"
            price={monthlyPkg?.product.priceString ?? "$19.99"}
            perPeriod="per month"
            footnote="Cancel anytime"
            selected={selectedId === MONTHLY_PKG_ID}
            onPress={() => setSelectedId(MONTHLY_PKG_ID)}
            colors={colors}
          />
        </View>

        {error && (
          <View style={styles.errorRow}>
            <Ionicons
              name="alert-circle"
              size={14}
              color={colors.destructive ?? "#F87171"}
            />
            <Text
              style={[
                styles.errorText,
                { color: colors.destructive ?? "#F87171" },
              ]}
            >
              {error}
            </Text>
          </View>
        )}

        <Pressable
          style={[
            styles.ctaBtn,
            {
              backgroundColor:
                busy || loading ? colors.accent : colors.primary,
            },
          ]}
          onPress={handlePurchase}
          disabled={busy || loading || !offering}
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text
              style={[styles.ctaText, { color: colors.primaryForeground }]}
            >
              {selectedId === YEARLY_PKG_ID
                ? "Start yearly plan"
                : "Start monthly plan"}
            </Text>
          )}
        </Pressable>

        {loading && !offering && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.mutedForeground} size="small" />
            <Text
              style={[styles.loadingText, { color: colors.mutedForeground }]}
            >
              Loading plans…
            </Text>
          </View>
        )}

        {!offering && !loading && (
          <Pressable
            onPress={refresh}
            style={[styles.secondaryBtn]}
            hitSlop={8}
          >
            <Text
              style={[styles.secondaryText, { color: colors.mutedForeground }]}
            >
              Tap to retry
            </Text>
          </Pressable>
        )}

        <View style={styles.bottomLinks}>
          <Pressable onPress={handleRestore} disabled={restoring} hitSlop={8}>
            <Text style={[styles.linkText, { color: colors.foreground }]}>
              {restoring ? "Restoring…" : "Restore purchases"}
            </Text>
          </Pressable>
          <Text style={[styles.linkDivider, { color: colors.mutedForeground }]}>
            •
          </Text>
          <Pressable
            onPress={() =>
              openLegal("https://www.apple.com/legal/internet-services/itunes/")
            }
            hitSlop={8}
          >
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
              Terms
            </Text>
          </Pressable>
          <Text style={[styles.linkDivider, { color: colors.mutedForeground }]}>
            •
          </Text>
          <Pressable
            onPress={() =>
              openLegal("https://www.apple.com/legal/privacy/")
            }
            hitSlop={8}
          >
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
              Privacy
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.fineprint, { color: colors.mutedForeground }]}>
          Subscription auto-renews unless cancelled at least 24 hours before
          the end of the current period. Manage or cancel in your{" "}
          {Platform.OS === "ios" ? "App Store" : "Google Play"} account
          settings.
        </Text>
      </ScrollView>
    </View>
  );
}

function PlanCard({
  label,
  price,
  perPeriod,
  footnote,
  badge,
  selected,
  onPress,
  colors,
  recommended,
}: {
  label: string;
  price: string;
  perPeriod: string;
  footnote: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  recommended?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.planCard,
        {
          backgroundColor: colors.card,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      {recommended && (
        <View
          style={[
            styles.recommendedTag,
            { backgroundColor: colors.primary },
          ]}
        >
          <Text
            style={[styles.recommendedText, { color: colors.primaryForeground }]}
          >
            BEST VALUE
          </Text>
        </View>
      )}
      <View style={styles.planTop}>
        <Text style={[styles.planLabel, { color: colors.foreground }]}>
          {label}
        </Text>
        {badge && (
          <View
            style={[
              styles.savingsBadge,
              { backgroundColor: colors.primary + "26" },
            ]}
          >
            <Text style={[styles.savingsText, { color: colors.primary }]}>
              {badge}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.priceRow}>
        <Text style={[styles.priceText, { color: colors.foreground }]}>
          {price}
        </Text>
        <Text
          style={[styles.pricePeriod, { color: colors.mutedForeground }]}
        >
          {" "}
          {perPeriod}
        </Text>
      </View>
      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
        {footnote}
      </Text>
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary : "transparent",
          },
        ]}
      >
        {selected && (
          <Ionicons name="checkmark" size={14} color={colors.primaryForeground} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: 20,
    gap: 22,
  },
  heroWrap: {
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  heroSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  featuresWrap: {
    gap: 12,
    paddingHorizontal: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  plansWrap: {
    gap: 10,
    marginTop: 4,
  },
  planCard: {
    borderRadius: 16,
    padding: 16,
    position: "relative",
  },
  recommendedTag: {
    position: "absolute",
    top: -10,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  recommendedText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  planTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  planLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  savingsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  savingsText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 4,
  },
  priceText: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
  },
  pricePeriod: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  footnote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  radio: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  errorText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  ctaBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: -8,
  },
  loadingText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  secondaryBtn: {
    alignSelf: "center",
    paddingVertical: 6,
  },
  secondaryText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  bottomLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  linkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  linkDivider: {
    fontSize: 10,
  },
  fineprint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 8,
  },
});
