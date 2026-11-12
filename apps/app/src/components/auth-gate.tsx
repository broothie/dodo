import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, H2, H3, Input, Paragraph, Spinner, YStack } from "tamagui";
import { authClient } from "../lib/auth-client";
import { importBrowserTasks } from "../lib/api";
import Tasks from "./tasks";

export function AuthGate() {
  const session = authClient.useSession();
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const user = session.data?.user;
  const userId = user?.id;
  useEffect(() => {
    let active = true;
    if (userId) importBrowserTasks().then(() => {
      if (active) { setReadyFor(userId); setError(""); }
    }, (error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [userId, retry]);
  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Could not sign out.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign out.");
    } finally { setSigningOut(false); }
  }
  if (user && readyFor === user.id && !signingOut && !error)
    return <Tasks key={user.id} email={user.email} onSignOut={() => void signOut()} />;
  if (!session.isPending && !user && !session.error) return <AccountForm />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
    <YStack p="4" gap="3" maxW={440} w="100%" self="center">
      <H2>Dodo</H2>
      {error || session.error ? <>
        <Paragraph role="alert">{error || "Could not check your session. Please try again."}</Paragraph>
        <Button onPress={() => { setError(""); setRetry(value => value + 1); void session.refetch(); }}>Retry</Button>
        {user && <Button onPress={() => void signOut()}>Sign out</Button>}
      </> : <Spinner aria-label="Loading account" />}
    </YStack>
  </SafeAreaView>;
}

function AccountForm() {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = creating
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message || "Could not sign in.");
      setPassword("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not reach Dodo. Please try again.");
    } finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
    <YStack p="4" gap="4" w="100%" maxW={440} self="center">
      <H2>Dodo</H2>
      <H3>{creating ? "Create account" : "Sign in"}</H3>
      {creating && <Input aria-label="Name" placeholder="Name" value={name} onChangeText={setName} autoComplete="name" readOnly={busy} />}
      <Input aria-label="Email" placeholder="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} readOnly={busy} />
      <Input aria-label="Password" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={creating ? "new-password" : "current-password"} autoCapitalize="none" readOnly={busy} onSubmitEditing={() => void submit()} returnKeyType="go" />
      {creating && <Paragraph size="sm">Use at least 8 characters for your password.</Paragraph>}
      {!!error && <Paragraph theme="red" role="alert">{error}</Paragraph>}
      <Button theme="accent" disabled={busy || !email.trim() || !password || (creating && !name.trim())} onPress={() => void submit()}>{busy ? "Please wait…" : creating ? "Create account" : "Sign in"}</Button>
      <Button variant="outlined" disabled={busy} onPress={() => { setCreating(!creating); setError(""); }}>{creating ? "Already have an account? Sign in" : "Create an account"}</Button>
    </YStack>
  </SafeAreaView>;
}
