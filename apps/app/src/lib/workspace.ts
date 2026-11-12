import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
const key = "dodo.workspace.v1";
let pending: Promise<string> | undefined;
export function getWorkspaceToken(): Promise<string> {
  return (pending ??= (async () => {
    const saved = await SecureStore.getItemAsync(key);
    if (saved) return saved;
    const token = (Crypto.randomUUID() + Crypto.randomUUID()).replaceAll(
      "-",
      "",
    );
    await SecureStore.setItemAsync(key, token);
    return token;
  })().catch((error) => {
    pending = undefined;
    throw error;
  }));
}
