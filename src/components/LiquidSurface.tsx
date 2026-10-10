import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import type { PropsWithChildren } from "react";
import { Platform, StyleSheet, View } from "react-native";
import type { ColorValue, StyleProp, ViewProps, ViewStyle } from "react-native";

type LiquidSurfaceProps = PropsWithChildren<
  ViewProps & {
    isInteractive?: boolean;
    style?: StyleProp<ViewStyle>;
    tintColor?: ColorValue;
  }
>;

// The native effect needs both the device API and the current build to support it.
// Older iOS versions and non-iOS platforms keep the same hierarchy with a calm material fallback.
function supportsLiquidGlass(): boolean {
  if (Platform.OS !== "ios") {
    return false;
  }

  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    // A development build created before this native module is installed can still
    // load the JavaScript refresh with the material fallback instead of crashing.
    return false;
  }
}

const canUseLiquidGlass = supportsLiquidGlass();

export function LiquidSurface({
  children,
  isInteractive = false,
  style,
  tintColor,
  ...viewProps
}: LiquidSurfaceProps) {
  if (canUseLiquidGlass) {
    return (
      <GlassView
        {...viewProps}
        glassEffectStyle="regular"
        isInteractive={isInteractive}
        style={style}
        tintColor={tintColor}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View {...viewProps} style={[styles.fallback, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: "rgba(255, 255, 255, 0.78)",
  },
});
