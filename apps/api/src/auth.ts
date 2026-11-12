import { betterAuth, type BetterAuthOptions } from "better-auth";
import { expo } from "@better-auth/expo";

// Schema options used to generate 0005_accounts.sql with Better Auth 1.7.22.
export const authOptions = {
  appName: "Dodo",
  emailAndPassword: { enabled: true },
  plugins: [expo()],
  session: { cookieCache: { enabled: false } },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
} satisfies BetterAuthOptions;

export function trustedOrigins(baseURL: string) {
  const origin = new URL(baseURL).origin;
  const local = ["localhost", "127.0.0.1"].includes(new URL(origin).hostname);
  return [
    origin,
    "dodo://",
    ...(local
      ? ["http://localhost:8787", "http://127.0.0.1:8787", "http://localhost:8081", "http://127.0.0.1:8081"]
      : []),
  ];
}

export function createAuth(env: Env) {
  if (
    !env.BETTER_AUTH_URL ||
    !env.BETTER_AUTH_SECRET ||
    env.BETTER_AUTH_SECRET.length < 32
  )
    throw new Error("Configure BETTER_AUTH_URL and BETTER_AUTH_SECRET.");
  return betterAuth({
    ...authOptions,
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(env.BETTER_AUTH_URL),
  });
}
