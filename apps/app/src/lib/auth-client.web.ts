import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const apiBase = process.env.EXPO_PUBLIC_API_URL || "";
export const authClient = createAuthClient({
  baseURL: apiBase || undefined,
  plugins: [emailOTPClient()],
});
export async function sessionHeaders(): Promise<Record<string, string>> {
  return {};
}
