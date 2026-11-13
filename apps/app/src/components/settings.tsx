import { useState } from "react";
import { Link, router } from "expo-router";
import Head from "expo-router/head";
import { SafeAreaView } from "react-native-safe-area-context";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import LogOut from "lucide-react-native/icons/log-out";
import { Button, Card, getVariableValue, H2, H3, Paragraph, ScrollView, useTheme, XGroup, XStack, YStack } from "tamagui";
import { authClient } from "../lib/auth-client";
import type { AccountUser } from "./auth-gate";
import { useAppearance, type AppearancePreference } from "./appearance-provider";
import { Logo } from "./brand";

const appearanceOptions: { value: AppearancePreference; label: string }[] = [
  { value: "device", label: "Device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function Settings({ user }: { user: AccountUser }) {
  const theme = useTheme();
  const appearance = useAppearance();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Could not sign out.");
      router.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign out.");
    } finally { setSigningOut(false); }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: getVariableValue(theme.background) }}>
      <Head><title>Settings · Dodo</title></Head>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack w="100%" maxW={900} self="center" px="6" py="4" gap="4">
          <XStack items="center" gap="3">
            <Link href="/" asChild>
              <Button size="sm" circular variant="outlined" borderWidth={0} icon={ArrowLeft} aria-label="Back to tasks" />
            </Link>
            <H2 flex={1}>Settings</H2>
            <Logo size={32} />
          </XStack>
          <Card theme="level2" p="4" gap="3">
            <H3>Account</H3>
            {!!user.name && <Paragraph>{user.name}</Paragraph>}
            <YStack gap="1">
              <Paragraph size="sm" fontWeight="bold">Email</Paragraph>
              <Paragraph>{user.email}</Paragraph>
            </YStack>
            <Button self="flex-start" size="sm" icon={LogOut} disabled={signingOut} onPress={() => void signOut()}>
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
            {!!error && <Paragraph theme="red" role="alert">{error}</Paragraph>}
          </Card>
          <Card theme="level2" p="4" gap="3">
            <H3>Appearance</H3>
            <XGroup role="group" aria-label="Appearance">
              {appearanceOptions.map(option => (
                <XGroup.Item key={option.value}>
                  <Button flex={1} minW={0}
                    theme={appearance.preference === option.value ? "inverse" : undefined}
                    aria-pressed={appearance.preference === option.value}
                    disabled={!appearance.ready}
                    onPress={() => appearance.setPreference(option.value)}>
                    {option.label}
                  </Button>
                </XGroup.Item>
              ))}
            </XGroup>
            {!!appearance.error && <Paragraph theme="red" role="alert">{appearance.error}</Paragraph>}
          </Card>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
