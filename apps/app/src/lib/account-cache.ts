import type { AccountUser } from "../components/auth-gate";
export function clearRememberedAccount() {}
export function readRememberedAccount(): AccountUser | undefined { return; }
export function rememberAccount(_user: AccountUser) {}
export function subscribeRememberedAccount(_listener: () => void) { return () => {}; }
