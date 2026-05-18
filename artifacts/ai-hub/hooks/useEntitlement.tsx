import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
} from "react-native-purchases";

// Pin the entitlement identifier so the rest of the app doesn't have
// to know any RevenueCat strings. Configure this exact identifier
// on a single Entitlement in the RevenueCat dashboard ("premium")
// and attach both the monthly + yearly products to it.
export const ENTITLEMENT_ID = "premium";

// RevenueCat public SDK keys per platform — set these via env so the
// repo stays free of secrets. The Apple key is needed for both iOS
// builds (App Store IAP) and the Android key for Play Billing.
const APPLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ?? "";
const GOOGLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY ?? "";

let initialized = false;
function initPurchases() {
  if (initialized) return;
  const key = Platform.OS === "ios" ? APPLE_KEY : GOOGLE_KEY;
  if (!key) {
    console.warn(
      "[purchases] Missing EXPO_PUBLIC_REVENUECAT_APPLE_KEY / EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY. " +
        "Paywall will render but purchases will fail until the key is set.",
    );
    return;
  }
  Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.INFO);
  Purchases.configure({ apiKey: key });
  initialized = true;
}

interface EntitlementContextValue {
  /** True iff the user has the premium entitlement active. The
   *  whole gate downstream pivots off this flag. */
  active: boolean;
  /** Initial load — gate shows a spinner until this clears so we
   *  don't flash the paywall to subscribed users coming back to a
   *  cold start. */
  loading: boolean;
  /** Last error from purchase / restore — surfaced inline on the
   *  paywall. Null when there's nothing to show. */
  error: string | null;
  /** Currently-fetched offering (monthly + yearly packages bundled).
   *  Null until the first getOfferings() call resolves. */
  offering: PurchasesOffering | null;
  /** Re-fetches offering + customer info. Used by the paywall's
   *  pull-to-refresh and after a Restore. */
  refresh: () => Promise<void>;
  /** Triggers Play Billing / StoreKit for the given package ID
   *  (monthly or yearly identifier from the offering). Resolves
   *  once the purchase completes or fails. */
  purchase: (packageIdentifier: string) => Promise<void>;
  /** Cross-device subscription restore — talks to Apple/Google to
   *  re-issue entitlements bound to the current store account. */
  restore: () => Promise<void>;
  /** Raw customer info for debugging / account screens. */
  customerInfo: CustomerInfo | null;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);

  // Apply a fresh CustomerInfo. RevenueCat reports entitlements as a
  // map keyed by identifier; "active" is a derived flag they manage.
  const applyCustomerInfo = useCallback((info: CustomerInfo | null) => {
    setCustomerInfo(info);
    setActive(!!info?.entitlements.active[ENTITLEMENT_ID]);
  }, []);

  const refresh = useCallback(async () => {
    try {
      initPurchases();
      if (!initialized) {
        // No RevenueCat key configured yet → don't lock the user out.
        // Treat the entitlement as active so the app behaves as if
        // there's no paywall. Real gating engages the moment a key
        // is set in env (rebuild required). This lets the screens
        // ship before the store dashboards are wired up.
        setActive(true);
        setOffering(null);
        return;
      }
      const [offerings, info] = await Promise.all([
        Purchases.getOfferings(),
        Purchases.getCustomerInfo(),
      ]);
      setOffering(offerings.current ?? null);
      applyCustomerInfo(info);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't reach the store. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyCustomerInfo]);

  const purchase = useCallback(
    async (packageIdentifier: string) => {
      if (!offering) throw new Error("No offering loaded yet.");
      const pkg = offering.availablePackages.find(
        (p) => p.identifier === packageIdentifier,
      );
      if (!pkg) throw new Error("That plan isn't available right now.");
      setError(null);
      try {
        const result = await Purchases.purchasePackage(pkg);
        applyCustomerInfo(result.customerInfo);
      } catch (e: any) {
        // userCancelled is a normal flow, not an error worth showing.
        if (e?.userCancelled) return;
        setError(e instanceof Error ? e.message : "Purchase failed.");
        throw e;
      }
    },
    [offering, applyCustomerInfo],
  );

  const restore = useCallback(async () => {
    setError(null);
    try {
      initPurchases();
      const info = await Purchases.restorePurchases();
      applyCustomerInfo(info);
      if (!info.entitlements.active[ENTITLEMENT_ID]) {
        setError(
          "No active subscription found on this store account. " +
            "If you bought on another device, make sure you're signed into the same Apple ID / Google account.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed.");
    }
  }, [applyCustomerInfo]);

  useEffect(() => {
    refresh();
    // Subscribe to entitlement changes from the store (renewal,
    // family sharing, manual revocation) so the paywall lifts the
    // moment a purchase clears or drops when a sub lapses.
    let removeListener: (() => void) | null = null;
    try {
      initPurchases();
      if (initialized) {
        const listener = (info: CustomerInfo) => applyCustomerInfo(info);
        Purchases.addCustomerInfoUpdateListener(listener);
        removeListener = () =>
          Purchases.removeCustomerInfoUpdateListener(listener);
      }
    } catch (e) {
      console.error(e);
    }
    return () => {
      removeListener?.();
    };
  }, [refresh, applyCustomerInfo]);

  return (
    <EntitlementContext.Provider
      value={{
        active,
        loading,
        error,
        offering,
        refresh,
        purchase,
        restore,
        customerInfo,
      }}
    >
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) {
    throw new Error("useEntitlement must be used inside EntitlementProvider.");
  }
  return ctx;
}
