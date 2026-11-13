import { Stack } from "expo-router";
import { useEffect } from "react";
import { registerPwa } from "../lib/pwa";
import { AppearanceProvider } from "../components/appearance-provider";
import { getVariableValue, useTheme } from "tamagui";

function Screens() {
  const theme = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: getVariableValue(theme.background) } }} />;
}
export default function Layout() {
  useEffect(() => {
    registerPwa();
  }, []);
  return (
    <AppearanceProvider>
      <Screens />
    </AppearanceProvider>
  );
}
