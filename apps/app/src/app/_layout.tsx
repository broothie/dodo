import { Stack } from "expo-router";
import { useEffect } from "react";
import { registerPwa } from "../lib/pwa";
import { AppearanceProvider } from "../components/appearance-provider";
import { getVariableValue, useTheme } from "tamagui";
import { TaskToasts } from "../components/task-toasts";

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
      <TaskToasts />
    </AppearanceProvider>
  );
}
