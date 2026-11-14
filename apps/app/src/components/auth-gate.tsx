import { useEffect, useState, type ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, getVariableValue, Paragraph, Spinner, useTheme, YStack } from "tamagui";
import { authClient } from "../lib/auth-client";
import { importBrowserTasks } from "../lib/api";
import Tasks from "./tasks";
import { AccountForm } from "./account-form";
import { Brand } from "./brand";
import { useCurrentAccount } from "../hooks/use-current-account";
import { clearRememberedAccount } from "../lib/account-cache";

export type AccountUser = typeof authClient.$Infer.Session.user;

export function AuthGate({ children }: { children?: (user: AccountUser) => ReactNode }) {
  const theme = useTheme();
  const { session, user, online } = useCurrentAccount();
  const [hasResolvedSession, setHasResolvedSession] = useState(false);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const userId = user?.id;
  const sessionResolved = !session.isPending && !session.error;
  if (sessionResolved && !hasResolvedSession) setHasResolvedSession(true);
  useEffect(() => {
    let active = true;
    if (userId) (online ? importBrowserTasks() : Promise.resolve()).then(() => {
      if (active) { setReadyFor(userId); setError(""); }
    }, (error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [userId, retry, online]);
  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Could not sign out.");
      clearRememberedAccount();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign out.");
    } finally { setSigningOut(false); }
  }
  if (user && readyFor === user.id && !signingOut && !error)
    return children ? children(user) : <Tasks key={user.id} userId={user.id} />;
  // Anonymous revalidation sets isPending again on focus or reconnect. Keep
  // the form mounted so its email, entered code, and resend timer survive.
  if (!user && (hasResolvedSession || sessionResolved))
    return <AccountForm />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: getVariableValue(theme.background) }}>
    <YStack p="4" gap="3" maxW={440} w="100%" self="center">
      <Brand />
      {error || session.error ? <>
        <Paragraph role="alert">{error || "Could not check your session. Please try again."}</Paragraph>
        <Button onPress={() => { setError(""); setRetry(value => value + 1); void session.refetch(); }}>Retry</Button>
        {user && <Button onPress={() => void signOut()}>Sign out</Button>}
      </> : <Spinner aria-label="Loading account" />}
    </YStack>
  </SafeAreaView>;
}
