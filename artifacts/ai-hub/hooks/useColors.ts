import { useMemo } from "react";
import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object reference is stable per active scheme — callers
 * can put it in dependency arrays or pass it to memoised children
 * without forcing a re-render every parent tick.
 */
export function useColors() {
  const scheme = useColorScheme();
  return useMemo(() => {
    const palette =
      scheme === "dark" && "dark" in colors
        ? ((colors as unknown as Record<string, typeof colors.light>).dark ??
          colors.light)
        : colors.light;
    return { ...palette, radius: colors.radius };
  }, [scheme]);
}
