import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const base = process.env.API_URL ?? "http://localhost:8787";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "This test uses local email capture, not real delivery.");
const suffix = crypto.randomUUID();
let ipCounter = 1;
const ipNonce = crypto.randomUUID().slice(0, 4);
async function authRequest(path: string, body: unknown, cookie = "") {
  return fetch(`${base}/api/auth/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie, "CF-Connecting-IP": `2001:db8:${ipNonce}:${ipCounter++}::1` },
    body: JSON.stringify(body),
  });
}
async function signIn(email: string) {
  const sent = await authRequest("email-otp/send-verification-otp", { email, type: "sign-in" });
  assert.equal(sent.status, 200, await sent.clone().text());
  const messages = await (await fetch(`${base}/__dev/mail`)).json();
  const otp = messages.filter((message: { to: string }) => message.to === email).at(-1)?.text.match(/\b\d{6}\b/)?.[0];
  assert.ok(otp, "Expected an email code in local capture");
  const response = await authRequest("sign-in/email-otp", { email, otp });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.ok(cookie);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/i);
  return { email, cookie, id: (await response.json()).user.id };
}
const account = await signIn(`smoke-owner-${suffix}@example.test`);
const other = await signIn(`smoke-stranger-${suffix}@example.test`);
const owner = account.cookie, stranger = other.cookie;
async function request(path = "", method = "GET", body?: unknown, key = owner) {
  return fetch(`${base}/api/tasks${path}`, {
    method,
    headers: {
      Cookie: key,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
assert.equal((await fetch(`${base}/api/tasks`)).status, 401);
assert.equal((await request("", "POST", { title: "  " })).status, 400);
assert.equal(
  (await request("", "POST", { title: "x".repeat(5000) })).status,
  413,
);
const response = await request("", "POST", {
  title: "Integration test",
});
assert.equal(response.status, 201);
const task = await response.json();
try {
  assert.equal(task.title, "Integration test");
  assert.equal("priority" in task, false);
  assert.equal("completed" in task, false);
  assert.equal(task.completedAt, null);
  assert.equal(task.deletedAt, null);
  assert.equal(task.dueKind, "none");
  assert.equal(task.dueAt, null);
  const dateDue = await (
    await request(`/${task.id}`, "PATCH", {
      dueKind: "date",
      dueAt: "2026-12-14",
    })
  ).json();
  assert.equal(dateDue.dueAt, "2026-12-14");
  assert.equal(dateDue.timeZone, null);
  const renamedDue = await (
    await request(`/${task.id}`, "PATCH", { title: "Due test" })
  ).json();
  assert.equal(renamedDue.dueAt, "2026-12-14");
  const timedDue = await (
    await request(`/${task.id}`, "PATCH", {
      dueKind: "datetime",
      dueAt: "2026-12-14T00:00:00+09:00",
      timeZone: "Asia/Tokyo",
    })
  ).json();
  assert.equal(timedDue.dueAt, "2026-12-13T15:00:00.000Z");
  assert.equal(timedDue.dueKind, "datetime");
  assert.equal(
    (await request(`/${task.id}`, "PATCH", { dueAt: "2026-12-15" })).status,
    400,
  );
  const clearedDue = await (
    await request(`/${task.id}`, "PATCH", { dueKind: "none", dueAt: null })
  ).json();
  assert.equal(clearedDue.dueAt, null);
  assert.equal(clearedDue.timeZone, null);
  assert.equal(clearedDue.dueKind, "none");
  assert.equal(
    (await request(`/${task.id}`, "PATCH", { priority: "high" })).status,
    400,
  );
  assert.deepEqual(
    await (await request("", "GET", undefined, stranger)).json(),
    [],
  );
  assert.equal(
    (
      await request(
        `/${task.id}`,
        "PATCH",
        { completedAt: "2026-11-11T18:00:00.000Z" },
        stranger,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(`/${task.id}`, "DELETE", undefined, stranger)).status,
    404,
  );
  const updated = await (
    await request(`/${task.id}`, "PATCH", {
      completedAt: "2026-11-11T10:00:00-08:00",
      title: "Updated",
    })
  ).json();
  assert.equal(updated.completedAt, "2026-11-11T18:00:00.000Z");
  assert.equal(updated.title, "Updated");
  const rows = await (await request()).json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].completedAt, updated.completedAt);
  const renamed = await (
    await request(`/${task.id}`, "PATCH", { title: "Renamed" })
  ).json();
  assert.equal(renamed.completedAt, updated.completedAt);
  for (const body of [
    { completed: true },
    { completedAt: false },
    { completedAt: "invalid" },
  ]) {
    assert.equal((await request(`/${task.id}`, "PATCH", body)).status, 400);
  }
  const reopened = await (
    await request(`/${task.id}`, "PATCH", { completedAt: null })
  ).json();
  assert.equal(reopened.completedAt, null);
  assert.equal((await (await request()).json())[0].completedAt, null);
  assert.equal((await request(`/${task.id}`, "PATCH", {})).status, 400);
  assert.equal((await request("", "PUT")).status, 405);
  const undoFixture = await (await request(`/${task.id}`, "PATCH", {
    title: "Undo preserves everything",
    completedAt: "2026-11-13T18:00:00.000Z",
    dueKind: "datetime", dueAt: "2026-12-14T00:00:00+09:00", timeZone: "Asia/Tokyo",
  })).json();
  assert.equal((await request(`/${task.id}`, "DELETE")).status, 204);
  assert.equal((await request(`/${task.id}`, "DELETE")).status, 204, "Delete retries are idempotent");
  assert.deepEqual(await (await request()).json(), [], "Deleted tasks stay out of normal lists");
  assert.equal((await request(`/${task.id}`, "PATCH", { title: "Must not edit deleted task" })).status, 404);
  assert.equal((await request(`/${task.id}/restore`, "POST", undefined, stranger)).status, 404);
  assert.equal((await fetch(`${base}/api/tasks/${task.id}/restore`, { method: "POST", headers: { Origin: base } })).status, 401);
  assert.equal((await request(`/${task.id}/restore`, "GET")).status, 405);
  assert.equal((await request(`/${crypto.randomUUID()}/restore`, "POST")).status, 404);
  assert.equal((await fetch(`${base}/api/tasks/${task.id}/restore`, {
    method: "POST", headers: { Cookie: owner, Origin: "https://evil.example" },
  })).status, 403);
  assert.deepEqual(await (await request()).json(), []);
  assert.deepEqual(await (await request(`/${task.id}/restore`, "POST")).json(), undoFixture);
  assert.deepEqual(await (await request(`/${task.id}/restore`, "POST")).json(), undoFixture, "Restore retries preserve metadata");
  assert.deepEqual(await (await request()).json(), [undoFixture]);
} finally {
  assert.equal((await request(`/${task.id}`, "DELETE")).status, 204);
}
assert.deepEqual(await (await request()).json(), []);
assert.equal((await request(`/${task.id}`, "DELETE")).status, 204);
assert.equal((await fetch(`${base}/api/missing`)).status, 404);
if (process.env.CHECK_PWA === "1") {
  assert.equal((await fetch(`${base}/manifest.json`)).status, 200);
  assert.equal((await fetch(`${base}/sw.js`)).status, 200);
}
console.log(
  "API smoke passed: CRUD, validation, account isolation, soft deletion, and exact restore.",
);

const preflight = await fetch(`${base}/api/tasks`, {
  method: "OPTIONS",
  headers: {
    Origin: "http://localhost:8081",
    "Access-Control-Request-Headers": "authorization,content-type",
  },
});
assert.equal(preflight.status, new URL(base).hostname === "localhost" || new URL(base).hostname === "127.0.0.1" ? 204 : 401);
assert.equal(
  preflight.headers.get("Access-Control-Allow-Origin"),
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname) ? "http://localhost:8081" : null,
);
const untrusted = await fetch(`${base}/api/tasks`, {
  method: "OPTIONS",
  headers: { Origin: "https://untrusted.example" },
});
assert.equal(untrusted.headers.get("Access-Control-Allow-Origin"), null);
console.log("Development CORS allowlist passed.");

for (const path of ["sign-in/email", "sign-up/email", "set-password", "change-password", "verify-password", "request-password-reset", "reset-password", "email-otp/request-password-reset", "forget-password/email-otp", "email-otp/reset-password"]) {
  const disabled = await authRequest(path, { email: account.email, name: "Ignored", password: "disabled-password-fixture", newPassword: "disabled-password-fixture" }, owner);
  assert.equal(disabled.status, 404, `${path} must be disabled`);
}
const capturedForOwner = async () => (await (await fetch(`${base}/__dev/mail`)).json()).filter((message: { to: string }) => message.to === account.email).length;
const beforePasswordReset = await capturedForOwner();
assert.equal((await authRequest("email-otp/send-verification-otp", { email: account.email, type: "forget-password" })).status, 200);
assert.equal(await capturedForOwner(), beforePasswordReset, "Password-reset requests must not send email");
const secondCookie = (await signIn(account.email)).cookie;
assert.deepEqual(await (await request("", "GET", undefined, secondCookie)).json(), []);
const forbidden = await fetch(`${base}/api/tasks`, {method:"POST", headers: {Cookie:owner, Origin:"https://evil.example", "Content-Type":"application/json"},body:JSON.stringify({title:"CSRF"})});
assert.equal(forbidden.status,403);
assert.equal((await fetch(`${base}/api/tasks`, {headers:{Authorization:`Bearer ${"a".repeat(64)}`}})).status,401);
// Seed only a disposable legacy fixture in the local D1 database. Remote smoke
// runs do not inspect or modify local state.
if (["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  const folder = "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const databases = readdirSync(folder).filter(file => file.endsWith(".sqlite") && file !== "metadata.sqlite");
  let db: DatabaseSync | undefined;
  for (const file of databases) {
    const candidate = new DatabaseSync(`${folder}/${file}`, { timeout: 5000 });
    if (candidate.prepare("SELECT 1 FROM sqlite_master WHERE name = 'session'").get() && candidate.prepare("SELECT 1 FROM session WHERE token = ?").get(
      // Session cookies are signed; the DB token is the portion before the dot.
      decodeURIComponent(owner.split("=")[1].split(";")[0]).split(".")[0],
    )) { db = candidate; break; }
    candidate.close();
  }
  assert.ok(db, "Could not locate the local session database");
  const credential = db.prepare("SELECT password FROM account JOIN user ON user.id = account.userId WHERE user.email = ?").get(account.email);
  assert.equal(credential, undefined, "Passwordless registration must not create a password credential");
  assert.ok(Number(db.prepare('SELECT count(*) AS count FROM rateLimit').get()?.count) > 0);
  const legacyToken = (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");
  const hash = createHash("sha256").update(legacyToken).digest("hex");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO tasks (id, owner, title, due_kind, created_at, updated_at) VALUES (?, ?, ?, 'none', ?, ?)").run(id, hash, "Legacy import fixture", now, now);
  const claim = (cookie: string, token = legacyToken) => fetch(`${base}/api/tasks/claim`, { method:"POST",headers:{Cookie:cookie,Origin:base,Authorization:`Bearer ${token}`} });
  try {
    assert.equal((await fetch(`${base}/api/tasks/claim`, {method:"POST",headers:{Authorization:`Bearer ${legacyToken}`,Origin:base}})).status,401);
    assert.equal((await claim(owner)).status,200);
    assert.equal((await claim(owner)).status,200);
    assert.equal((await claim(stranger)).status,409);
    const imported = await (await request("", "GET", undefined, secondCookie)).json();
    assert.equal(imported.length,1);
    assert.equal(imported[0].id,id);
    assert.deepEqual(await (await request("", "GET", undefined, stranger)).json(),[]);
    const raceToken = (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");
    const race = await Promise.all([claim(owner,raceToken),claim(stranger,raceToken)]);
    assert.deepEqual(race.map(response => response.status).sort(),[200,409]);
    const strangerToken = decodeURIComponent(stranger.split("=")[1].split(";")[0]).split(".")[0];
    db.prepare('UPDATE session SET expiresAt = 1 WHERE token = ?').run(strangerToken);
    assert.equal((await request("", "GET", undefined, stranger)).status, 401);
    console.log("Legacy import passed: authenticated, idempotent, isolated, and single-winner under concurrent claims.");
  } finally {
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    db.close();
  }
}
assert.equal((await authRequest("sign-out", {}, owner)).status,200);
assert.equal((await request("", "GET")).status,401);
assert.equal((await request("", "GET", undefined, secondCookie)).status,200);
assert.equal((await authRequest("sign-out", {}, secondCookie)).status,200);
assert.equal((await authRequest("sign-out", {}, stranger)).status,200);
console.log("Auth smoke passed: password rejection, multi-device sign-in, CSRF protection, no bearer bypass, and session revocation.");

// IDs only: deployment verification can remove its disposable accounts through
// D1 without writing session cookies or passwords to a file.
if (process.env.SMOKE_REPORT)
  writeFileSync(process.env.SMOKE_REPORT, JSON.stringify({ userIds: [account.id, other.id] }));
