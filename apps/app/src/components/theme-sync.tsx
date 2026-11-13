import { useEffect } from "react";
import { Appearance } from "react-native";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { getVariableValue, useTheme } from "tamagui";
import type { AppearancePreference } from "./appearance-provider";

export type ThemeSyncProps = { preference: AppearancePreference; scheme: "light" | "dark" };

export function ThemeSync({ preference, scheme }: ThemeSyncProps) {
  const theme = useTheme();
  const background = getVariableValue(theme.background);
  useEffect(() => {
    Appearance.setColorScheme(preference === "device" ? "auto" : preference);
  }, [preference]);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(background).catch(error => console.warn("Could not update system background", error));
  }, [background]);
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}
