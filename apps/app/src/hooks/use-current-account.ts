import { authClient } from "../lib/auth-client";
export function useCurrentAccount() {
  const session = authClient.useSession();
  return { session, user: session.data?.user, online: true };
}
