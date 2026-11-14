import { test as base, expect, type BrowserContext } from "@playwright/test";
import type { Task, TaskInput } from "@dodo/shared";

const origin = "http://localhost:8790";

export async function emailCode(context: BrowserContext, email: string) {
  const response = await context.request.get("/__dev/mail");
  const messages: { to: string; text: string }[] = await response.json();
  const code = messages.findLast(message => message.to === email)?.text.match(/\b\d{6}\b/)?.[0];
  expect(code, "Local email capture should contain a sign-in code").toBeTruthy();
  return code!;
}

export const test = base.extend<{
  email: string;
  account: { create: (input: TaskInput) => Promise<Task>; list: () => Promise<Task[]> };
}>({
  email: async ({ context }, use) => {
    // Avoid coupling independent tests through the real auth rate limiter.
    await context.setExtraHTTPHeaders({ "CF-Connecting-IP": `2001:db8:${crypto.randomUUID().slice(0, 4)}::1` });
    await use(`browser-${crypto.randomUUID()}@example.test`);
  },
  account: async ({ context, email }, use) => {
    const sent = await context.request.post("/api/auth/email-otp/send-verification-otp", {
      headers: { Origin: origin }, data: { email, type: "sign-in" },
    });
    expect(sent.ok()).toBeTruthy();
    const signedIn = await context.request.post("/api/auth/sign-in/email-otp", {
      headers: { Origin: origin }, data: { email, otp: await emailCode(context, email) },
    });
    expect(signedIn.ok()).toBeTruthy();
    await use({
      async create(input) {
        const response = await context.request.post("/api/tasks", { headers: { Origin: origin }, data: input });
        expect(response.status()).toBe(201);
        return response.json();
      },
      async list() {
        const response = await context.request.get("/api/tasks");
        expect(response.ok()).toBeTruthy();
        return response.json();
      },
    });
  },
});

export { expect };
