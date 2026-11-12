import { betterAuth, type BetterAuthOptions } from "better-auth";
import { expo } from "@better-auth/expo";
import { emailOTP, magicLink } from "better-auth/plugins";
import { authEmail, sendAuthEmail } from "./auth-email";

// Schema options used to generate 0005_accounts.sql with Better Auth 1.7.22.
export const authOptions = {
  appName: "Dodo",
  emailAndPassword: { enabled: true },
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
          const purpose = type === "sign-in" ? "sign in to Dodo" : type === "forget-password" ? "reset your Dodo password" : "verify your Dodo email";
          await sendAuthEmail(env, authEmail(email, "Your Dodo code", `Your code to ${purpose} is:\n\n${otp}\n\nThis code expires in 5 minutes. If you didn’t request it, ignore this email.`));
        },
      }),
      magicLink({
        expiresIn: 300,
        storeToken: "hashed",
        rateLimit: { window: 60, max: 3 },
        async sendMagicLink({ email, token }) {
          const link = new URL("/auth/verify", env.BETTER_AUTH_URL);
          link.searchParams.set("token", token);
          link.searchParams.set("email", email);
          await sendAuthEmail(env, authEmail(email, "Sign in to Dodo", `Open this link to sign in as ${email}:\n\n${link}\n\nConfirm sign-in on the page that opens. This link expires in 5 minutes and can be used once. If you didn’t request it, ignore this email.`));
        },
      }),
    ],
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(env.BETTER_AUTH_URL, env.BETTER_AUTH_ADDITIONAL_ORIGINS),
  });
}
