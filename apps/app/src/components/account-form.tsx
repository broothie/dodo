import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, getVariableValue, H2, H3, Input, Paragraph, useTheme, YStack } from "tamagui";
import { authClient } from "../lib/auth-client";

function check(result: { error?: { message?: string } | null }) {
  if (result.error) throw new Error(result.error.message || "Could not sign in. Please try again.");
}

export function AccountForm() {
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (error) {
      setError(error instanceof Error ? error.message : "Could not reach Dodo. Please try again.");
    } finally { setBusy(false); }
  }

  function send() {
    const address = (sentTo || email).trim().toLowerCase();
    if (!address) { setError("Enter your email address."); return; }
    void perform(async () => {
      check(await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" }));
      setEmail(address);
      setSentTo(address);
      setCode("");
      setRemaining(60);
    });
  }

  function submit() {
    if (!sentTo) { send(); return; }
    void perform(async () => {
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code from your email.");
      check(await authClient.signIn.emailOtp({ email: sentTo, otp: code }));
      setCode("");
    });
  }

  function reset() {
    setSentTo(null);
    setCode("");
    setError("");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: getVariableValue(theme.background) }}>
      <YStack p="4" gap="4" w="100%" maxW={440} self="center">
        <H2>Dodo</H2>
        <H3>{sentTo ? "Check your email" : "Sign in"}</H3>
        {sentTo ? (
          <>
            <Paragraph>Enter the code sent to {sentTo}.</Paragraph>
            <Input aria-label="Email code" placeholder="6-digit code" value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
              autoComplete={Platform.OS === "android" ? "email-otp" : "one-time-code"}
              keyboardType="number-pad" maxLength={6}
              readOnly={busy} onSubmitEditing={submit} returnKeyType="go" />
            <Button theme="accent" disabled={busy || code.length !== 6} onPress={submit}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <Button variant="outlined" disabled={busy || remaining > 0} onPress={send}>
              {remaining > 0 ? `Resend in ${remaining}s` : "Resend code"}
            </Button>
            <Button variant="outlined" disabled={busy} onPress={() => reset()}>Use another email</Button>
          </>
        ) : (
          <>
            <Input aria-label="Email" placeholder="Email" value={email} onChangeText={setEmail}
              autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
              readOnly={busy} onSubmitEditing={submit} returnKeyType="go" />
            <Button theme="accent" disabled={busy || !email.trim()} onPress={submit}>
              {busy ? "Please wait…" : "Email me a code"}
            </Button>
          </>
        )}
        {!!error && <Paragraph theme="red" role="alert">{error}</Paragraph>}
      </YStack>
    </SafeAreaView>
  );
}
