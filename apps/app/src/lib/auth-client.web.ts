import { createAuthClient } from "better-auth/react";

export const apiBase = process.env.EXPO_PUBLIC_API_URL || "";
export const authClient = createAuthClient({
  baseURL: apiBase || undefined,
});
export async function sessionHeaders(): Promise<Record<string, string>> {
  return {};
}
