import { APIError } from "better-auth/api";

export type AuthEmail = { to: string; subject: string; text: string; html: string };

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function authCodeEmail(to: string, purpose: string, code: string, baseUrl = "https://dodotasks.xyz"): AuthEmail {
  const introduction = `Your verification code to ${purpose} is:`;
  const footer = "This code expires in 5 minutes. If you didn’t request it, ignore this email.";
  const logoUrl = escapeHtml(new URL("/logo-v1.png", baseUrl).href);
  return {
    to,
    subject: "Your Dodo verification code",
    text: `${introduction}\n\n${code}\n\n${footer}`,
    html: `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td><img src="${logoUrl}" width="40" height="40" alt="" style="display: block; border-radius: 8px;" /></td><td style="padding-left: 8px; font: bold 24px sans-serif;">Dodo</td></tr></table><p>${escapeHtml(introduction)}</p><p><code style="font-family: monospace; font-size: 24px; font-weight: 700;">${escapeHtml(code)}</code></p><p>${footer}</p>`,
  };
}

export async function sendAuthEmail(env: Env, message: AuthEmail) {
  const local = ["localhost", "127.0.0.1"].includes(new URL(env.BETTER_AUTH_URL).hostname);
  let endpoint = "https://api.resend.com/emails";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (local && env.AUTH_EMAIL_DEV_URL) {
    const sink = new URL(env.AUTH_EMAIL_DEV_URL);
    if (!["localhost", "127.0.0.1"].includes(sink.hostname)) throw new Error("Local mail capture must use loopback.");
    endpoint = sink.href;
  } else {
    if (!env.RESEND_API_KEY?.startsWith("re_"))
      throw new APIError("SERVICE_UNAVAILABLE", { message: "Email sign-in is not configured." });
    headers.Authorization = `Bearer ${env.RESEND_API_KEY}`;
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST", headers,
      body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, ...message }),
      signal: AbortSignal.timeout(10000),
    });
    // Never log provider bodies: they can contain addresses or message content.
    if (!response.ok) throw new Error(`Email provider status ${response.status}`);
    await response.body?.cancel();
  } catch {
    throw new APIError("SERVICE_UNAVAILABLE", { message: "We couldn’t send the email. Please try again." });
  }
}
