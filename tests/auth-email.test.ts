import test from "node:test";
import assert from "node:assert/strict";
import { authCodeEmail, sendAuthEmail } from "../apps/api/src/auth-email.ts";

test("verification emails keep the complete code in plain text and a safe HTML code block", () => {
  const message = authCodeEmail("fixture@example.test", "sign in to Dodo <unsafe>&", "012345");
  assert.match(message.subject, /verification code/i);
  assert.match(message.text, /\n\n012345\n\n/);
  assert.match(message.html, /<code\b[^>]*>012345<\/code>/);
  assert.match(message.html, /src="https:\/\/dodotasks\.xyz\/logo-v1\.png"/);
  const preview = authCodeEmail("fixture@example.test", "sign in", "012345", "https://preview.example.test");
  assert.match(preview.html, /src="https:\/\/preview\.example\.test\/logo-v1\.png"/);
  assert.match(message.html, /&lt;unsafe&gt;&amp;/);
  assert.match(message.text, /expires in 5 minutes/);
  const unsafeCode = authCodeEmail("fixture@example.test", "sign in", "</code><script>bad</script>");
  assert.ok(!unsafeCode.html.includes("<script>"));
});

test("auth mail uses Resend in production, restricts local capture, and reports delivery failure safely", async () => {
  const originalFetch = globalThis.fetch;
  const message = authCodeEmail("fixture@example.test", "sign in to Dodo", "123456");
  const config = {
    BETTER_AUTH_URL: "https://dodotasks.xyz",
    AUTH_EMAIL_DEV_URL: "http://localhost:8787/__dev/mail",
    AUTH_EMAIL_FROM: "Dodo <login@dodotasks.xyz>",
    RESEND_API_KEY: "re_disposable_test_fixture",
  } as Parameters<typeof sendAuthEmail>[0];
  const calls: { url: string; init?: RequestInit }[] = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({url:String(url),init});
      return Response.json({id:"fixture"});
    };
    await sendAuthEmail(config,message);
    assert.equal(calls[0].url,"https://api.resend.com/emails");
    const local = {...config,BETTER_AUTH_URL:"http://localhost:8787"} as typeof config;
    await sendAuthEmail(local,message);
    assert.equal(calls[1].url,"http://localhost:8787/__dev/mail");
    assert.equal(new Headers(calls[1].init?.headers).has("Authorization"),false);
    await assert.rejects(sendAuthEmail({...local,AUTH_EMAIL_DEV_URL:"https://evil.example"} as typeof config,message),/loopback/);
    assert.equal(calls.length,2);
    globalThis.fetch = async () => new Response("private provider details",{status:502});
    await assert.rejects(sendAuthEmail(config,message),error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("private provider details"));
      return true;
    });
  } finally { globalThis.fetch = originalFetch; }
});
