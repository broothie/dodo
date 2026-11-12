import { TamaguiProvider } from "tamagui";
import { tamaguiConfig } from "../../tamagui.config";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { registerPwa } from "../lib/pwa";
export default function Layout() {
  useEffect(() => {
    registerPwa();
  }, []);
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </TamaguiProvider>
  );
}
