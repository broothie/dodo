import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, H2, Paragraph, Spinner, YStack } from "tamagui";
import { authClient } from "../lib/auth-client";
import { importBrowserTasks } from "../lib/api";
import Tasks from "./tasks";
import { AccountForm } from "./account-form";

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
