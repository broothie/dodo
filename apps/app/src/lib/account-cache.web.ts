import type { AccountUser } from "../components/auth-gate";

const key = "dodo.offline-account.v1";
const event = "dodo-account-changed";
export function readRememberedAccount(): AccountUser | undefined {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!data || typeof data.id !== "string" || typeof data.email !== "string" || typeof data.name !== "string" || typeof data.emailVerified !== "boolean") return;
    const createdAt = new Date(data.createdAt), updatedAt = new Date(data.updatedAt);
    if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(updatedAt.getTime())) return;
    return { id: data.id, email: data.email, name: data.name, emailVerified: data.emailVerified,
      image: typeof data.image === "string" ? data.image : null, createdAt, updatedAt };
  } catch { return; }
}
export function rememberAccount(user: AccountUser) {
  try {
    const value = JSON.stringify(user);
    if (localStorage.getItem(key) === value) return;
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event(event));
  } catch { /* Online sign-in still works if browser storage is unavailable. */ }
}
export function clearRememberedAccount() {
  try { localStorage.removeItem(key); window.dispatchEvent(new Event(event)); } catch {}
}
export function subscribeRememberedAccount(listener: () => void) {
  const changed = (e: StorageEvent) => { if (e.key === key || e.key === null) listener(); };
  window.addEventListener(event, listener);
  window.addEventListener("storage", changed);
  return () => { window.removeEventListener(event, listener); window.removeEventListener("storage", changed); };
}
