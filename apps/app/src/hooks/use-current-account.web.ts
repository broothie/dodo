import { useEffect, useState, useSyncExternalStore } from "react";
import { authClient } from "../lib/auth-client";
import { clearRememberedAccount, readRememberedAccount, rememberAccount, subscribeRememberedAccount } from "../lib/account-cache";
import type { AccountUser } from "../components/auth-gate";

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener); window.addEventListener("offline", listener);
  return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
}
export function useCurrentAccount() {
  const session = authClient.useSession();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [remembered, setRemembered] = useState<AccountUser>();
  useEffect(() => {
    const read = () => setRemembered(readRememberedAccount());
    read();
    return subscribeRememberedAccount(read);
  }, []);
  useEffect(() => {
    if (session.data?.user) rememberAccount(session.data.user);
    else if (online && !session.isPending && !session.error) clearRememberedAccount();
  }, [session.data, session.isPending, session.error, online]);
  // This selects local data only. The Worker still authenticates every sync.
  return { session, user: session.data?.user ?? (!online ? remembered : undefined), online };
}
