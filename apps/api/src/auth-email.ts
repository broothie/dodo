import { APIError } from "better-auth/api";

export type AuthEmail = { to: string; subject: string; text: string; html: string };

export function authEmail(to: string, subject: string, text: string): AuthEmail {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return { to, subject, text, html: `<p>${escaped.replaceAll("\n", "<br>")}</p>` };
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
