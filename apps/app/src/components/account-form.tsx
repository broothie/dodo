import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, H2, H3, Input, Paragraph, YStack } from "tamagui";
import { authClient } from "../lib/auth-client";

type Method = "code" | "link" | "password";
function check(result: { error?: { message?: string } | null }) {
  if (result.error) throw new Error(result.error.message || "Could not sign in. Please try again.");
}

export function AccountForm() {
  const [method, setMethod] = useState<Method>("code");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  function send(next: "code" | "link") {
    const address = (sentTo || email).trim().toLowerCase();
    if (!address) { setError("Enter your email address."); return; }
    void perform(async () => {
      if (next === "code")
        check(await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" }));
      else
        check(await authClient.signIn.magicLink({ email: address }));
      setEmail(address);
      setSentTo(address);
      setMethod(next);
      setCode("");
      setRemaining(60);
    });
  }

  function submit() {
    if (method !== "password" && !sentTo) { send("code"); return; }
    void perform(async () => {
      if (method === "password") {
        if (!email.trim() || !password || (creating && !name.trim()))
          throw new Error("Fill in the account fields.");
        check(creating
          ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
          : await authClient.signIn.email({ email: email.trim(), password }));
        setPassword("");
      } else {
        if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code from your email.");
        check(await authClient.signIn.emailOtp({ email: sentTo!, otp: code }));
        setCode("");
      }
    });
  }

  function reset(next: Method = "code") {
    setMethod(next);
    setSentTo(null);
    setCode("");
    setPassword("");
    setError("");
    setCreating(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <YStack p="4" gap="4" w="100%" maxW={440} self="center">
        <H2>Dodo</H2>
        <H3>{sentTo ? "Check your email" : creating ? "Create account" : "Sign in"}</H3>
        {sentTo ? (
          <>
            <Paragraph>{method === "code" ? "Enter the code sent to" : "We sent a sign-in link to"} {sentTo}.</Paragraph>
            {method === "code" ? (
              <>
                <Input aria-label="Email code" placeholder="6-digit code" value={code}
                  onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="one-time-code" keyboardType="number-pad" maxLength={6}
                  readOnly={busy} onSubmitEditing={submit} returnKeyType="go" />
                <Button theme="accent" disabled={busy || code.length !== 6} onPress={submit}>
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </>
            ) : (
              <>
                <Paragraph>Open the link and confirm sign-in. It expires in 5 minutes.</Paragraph>
                <Button disabled={busy} onPress={() => send("code")}>Use an email code</Button>
              </>
            )}
            <Button variant="outlined" disabled={busy || remaining > 0} onPress={() => send(method === "link" ? "link" : "code")}>
              {remaining > 0 ? `Resend in ${remaining}s` : method === "link" ? "Resend link" : "Resend code"}
            </Button>
            <Button variant="outlined" disabled={busy} onPress={() => reset()}>Use another email</Button>
          </>
        ) : (
          <>
            {creating && <Input aria-label="Name" placeholder="Name" value={name} onChangeText={setName} autoComplete="name" readOnly={busy} />}
            <Input aria-label="Email" placeholder="Email" value={email} onChangeText={setEmail}
              autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
              readOnly={busy} onSubmitEditing={submit} returnKeyType="go" />
            {method === "password" && <Input aria-label="Password" placeholder="Password" value={password}
              onChangeText={setPassword} secureTextEntry autoComplete={creating ? "new-password" : "current-password"}
              autoCapitalize="none" readOnly={busy} onSubmitEditing={submit} returnKeyType="go" />}
            {creating && <Paragraph size="sm">Use at least 8 characters for your password.</Paragraph>}
            <Button theme="accent" disabled={busy || !email.trim()} onPress={submit}>
              {busy ? "Please wait…" : method === "password" ? creating ? "Create account" : "Sign in" : "Email me a code"}
            </Button>
            {method !== "password" ? (
              <>
                <Button variant="outlined" disabled={busy || !email.trim()} onPress={() => send("link")}>Email me a sign-in link</Button>
                <Button variant="outlined" disabled={busy} onPress={() => reset("password")}>Use a password</Button>
              </>
            ) : (
              <>
                <Button variant="outlined" disabled={busy} onPress={() => { setCreating(!creating); setError(""); }}>
                  {creating ? "Already have an account? Sign in" : "Create a password account"}
                </Button>
                <Button variant="outlined" disabled={busy} onPress={() => reset()}>Sign in with email instead</Button>
              </>
            )}
          </>
        )}
        {!!error && <Paragraph theme="red" role="alert">{error}</Paragraph>}
      </YStack>
    </SafeAreaView>
  );
}
