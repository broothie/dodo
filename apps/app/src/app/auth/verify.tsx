import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, H2, H3, Paragraph, YStack } from "tamagui";
import { authClient } from "../../lib/auth-client";

export default function VerifyEmailLink() {
  const params = useLocalSearchParams<{ token?: string; email?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  const valid = /^[A-Za-z0-9_-]{16,256}$/.test(token) && !!email;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    if (busy || !valid) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.magicLink.verify({
        query: { token },
        fetchOptions: { headers: { "X-Dodo-Magic-Link": "1" } },
      });
      if (result.error || !result.data?.user?.email) throw new Error("This link is invalid, expired, or already used. Request a new one.");
      // Check the actual authenticated account before opening the task screen
      // (which can import a legacy browser list). An edited email hint is not proof.
      if (result.data?.user.email.toLowerCase() !== email) {
        await authClient.signOut();
        throw new Error("This link belongs to a different email address. Request a new one.");
      }
      router.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <Head><title>Sign in · Dodo</title><meta name="referrer" content="no-referrer" /></Head>
      <YStack p="4" gap="4" w="100%" maxW={440} self="center">
        <H2>Dodo</H2>
        <H3>Confirm sign-in</H3>
        <Paragraph>{valid ? `Sign in as ${email}?` : "This sign-in link is incomplete. Request a new one."}</Paragraph>
        {!!error && <Paragraph theme="red" role="alert">{error}</Paragraph>}
        <Button theme="accent" disabled={!valid || busy} onPress={() => void verify()}>{busy ? "Signing in…" : "Sign in"}</Button>
        <Button variant="outlined" disabled={busy} onPress={() => router.replace("/")}>Back to sign in</Button>
      </YStack>
    </SafeAreaView>
  );
}
