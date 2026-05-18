import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  EntitlementProvider,
  useEntitlement,
} from "@/hooks/useEntitlement";

SystemUI.setBackgroundColorAsync("#000000");

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/** Paywall gate. Bounces users without an active subscription
 *  entitlement onto the /paywall screen and keeps them off the rest
 *  of the app. No login is involved — the entitlement lives on the
 *  device's Google Play / Apple ID, fetched via RevenueCat. The
 *  /paywall route is the only one allowed when entitlement is
 *  inactive. */
function PaywallGate({ children }: { children: React.ReactNode }) {
  const { active, loading } = useEntitlement();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onPaywall = (segments[0] as string) === "paywall";
    if (!active && !onPaywall) {
      router.replace("/paywall" as never);
    } else if (active && onPaywall) {
      router.replace("/");
    }
  }, [active, loading, segments, router]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000000",
        }}
      >
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }
  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#000000" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="paywall" options={{ animation: "fade" }} />
      <Stack.Screen name="chat/[id]" options={{ animation: "fade_from_bottom" }} />
      <Stack.Screen name="history" options={{ animation: "slide_from_left" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <EntitlementProvider>
                <PaywallGate>
                  <RootLayoutNav />
                </PaywallGate>
              </EntitlementProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
