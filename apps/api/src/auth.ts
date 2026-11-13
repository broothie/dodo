import { betterAuth, type BetterAuthOptions } from "better-auth";
import { expo } from "@better-auth/expo";
import { emailOTP } from "better-auth/plugins";
import { authCodeEmail, sendAuthEmail } from "./auth-email";

// Keep Better Auth's existing schema; only email codes can sign in.
export const authOptions = {
  appName: "Dodo",
  emailAndPassword: { enabled: false },
  disabledPaths: [
    "/sign-up/email", "/sign-in/email", "/request-password-reset", "/reset-password",
    "/change-password", "/set-password", "/verify-password",
    "/email-otp/request-password-reset", "/forget-password/email-otp", "/email-otp/reset-password",
    "/sign-in/magic-link", "/magic-link/verify",
  ],
  plugins: [expo()],
  session: { cookieCache: { enabled: false } },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
} satisfies BetterAuthOptions;

export function trustedOrigins(baseURL: string, additionalOrigins = "") {
  const origin = new URL(baseURL).origin;
  const local = ["localhost", "127.0.0.1"].includes(new URL(origin).hostname);
  return [
    origin,
    "dodo://",
    ...(!local
      ? additionalOrigins.split(",").map((value) => value.trim()).filter(Boolean).map((value) => new URL(value).origin)
      : []),
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
    plugins: [
      expo(),
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        rateLimit: { window: 60, max: 3 },
        async sendVerificationOTP({ email, otp, type }) {
          if (type === "forget-password") return;
          const purpose = type === "sign-in" ? "sign in to Dodo" : "verify your Dodo email";
          await sendAuthEmail(env, authCodeEmail(email, purpose, otp, env.BETTER_AUTH_URL));
        },
      }),
    ],
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(env.BETTER_AUTH_URL, env.BETTER_AUTH_ADDITIONAL_ORIGINS),
  });
}
