import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export const apiBase = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8787";
export const authClient = createAuthClient({
  baseURL: apiBase,
  plugins: [expoClient({
    scheme: "dodo",
    storagePrefix: "dodo",
    storage: SecureStore,
    disableCache: true,
  })],
});
export async function sessionHeaders(): Promise<Record<string, string>> {
  return { Cookie: await authClient.getCookie() };
}
