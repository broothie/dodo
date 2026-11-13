import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";

const base = process.env.API_URL ?? "http://localhost:8787";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "This test uses the local mail capture, not real delivery.");
const suffix = crypto.randomUUID();
let ipCounter = 1;
const ipNonce = crypto.randomUUID().slice(0, 4);
const nextIp = () => `2001:db8:${ipNonce}:${ipCounter++}::1`;
const cookie = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
async function auth(path: string, body?: unknown, ip = nextIp(), session = "") {
  return fetch(`${base}/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST", redirect: "manual",
    headers: { "Content-Type": "application/json", Origin: base, "CF-Connecting-IP": ip, Cookie: session },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function mail(email: string) {
  const messages = await (await fetch(`${base}/__dev/mail`)).json();
  const message = messages.filter((item: { to: string }) => item.to === email).at(-1);
  assert.ok(message, "Expected a captured email");
  return message as { text: string; html: string };
}
async function code(email: string, ip = nextIp()) {
  const response = await auth("email-otp/send-verification-otp", { email, type: "sign-in" }, ip);
  assert.equal(response.status, 200, await response.clone().text());
  const message = await mail(email);
  const otp = message.text.match(/\b\d{6}\b/)?.[0];
  assert.ok(otp);
  assert.ok(!(await response.text()).includes(otp), "Code must not be returned by the API");
  return otp;
}
const existingEmail = `passwordless-existing-${suffix}@example.test`;
const initialCode = await code(existingEmail);
const created = await auth("sign-in/email-otp", { email: existingEmail, otp: initialCode });
assert.equal(created.status, 200);
const originalCookie = cookie(created);
const originalUser = (await created.json()).user;
const folder = "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";
let db: DatabaseSync | undefined;
for (const file of readdirSync(folder).filter((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite")) {
  const candidate = new DatabaseSync(`${folder}/${file}`, { timeout: 5000 });
  if (candidate.prepare("SELECT 1 FROM sqlite_master WHERE name='user'").get() && candidate.prepare('SELECT 1 FROM user WHERE id=?').get(originalUser.id)) { db = candidate; break; }
  candidate.close();
}
assert.ok(db);
// Simulate an account from before passwordless-only auth, without reopening
// password registration or changing any real account.
db.prepare('UPDATE user SET emailVerified=0 WHERE id=?').run(originalUser.id);
const now = new Date().toISOString();
db.prepare('INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(crypto.randomUUID(), originalUser.id, "credential", originalUser.id, "disabled-legacy-password-fixture", now, now);
const testEmails = [existingEmail];
const address = (label: string) => { const email = `${label}-${suffix}@example.test`; testEmails.push(email); return email; };
let taskId: string | undefined;
try {
  const task = await fetch(`${base}/api/tasks`, { method: "POST", headers: {Cookie: originalCookie, Origin: base, "Content-Type":"application/json"},body:JSON.stringify({title:"Passwordless ownership fixture"}) });
  assert.equal(task.status, 201);
  taskId = (await task.json()).id;

  const otp = await code(existingEmail);
  const stored = db.prepare('SELECT value FROM verification WHERE identifier LIKE ?').get(`%${existingEmail}%`);
  assert.ok(stored && !String(stored.value).startsWith(otp), "Codes should be hashed in D1");
  const wrong = otp === "000000" ? "111111" : "000000";
  assert.notEqual((await auth("sign-in/email-otp", {email:existingEmail,otp:wrong})).status,200);
  const signedIn = await auth("sign-in/email-otp", {email:existingEmail,otp});
  assert.equal(signedIn.status,200,await signedIn.clone().text());
  const verifiedUser = (await signedIn.json()).user;
  assert.equal(verifiedUser.id,originalUser.id);
  assert.equal(verifiedUser.emailVerified,true);
  const rows = await (await fetch(`${base}/api/tasks`,{headers:{Cookie:cookie(signedIn)}})).json();
  assert.equal(rows[0].id,taskId);
  assert.equal((await fetch(`${base}/api/tasks`,{headers:{Cookie:originalCookie}})).status,401);
  assert.notEqual((await auth("sign-in/email-otp",{email:existingEmail,otp})).status,200);

  const newEmail = address("new-otp");
  const newCode = await code(newEmail);
  assert.equal((await auth("sign-in/email-otp",{email:newEmail,otp:newCode})).status,200);

  const resendEmail = address("resend-otp");
  const firstCode = await code(resendEmail);
  const secondCode = await code(resendEmail);
  assert.notEqual(firstCode,secondCode);
  assert.notEqual((await auth("sign-in/email-otp",{email:resendEmail,otp:firstCode})).status,200);
  assert.equal((await auth("sign-in/email-otp",{email:resendEmail,otp:secondCode})).status,200);

  const lockedEmail = address("locked-otp"), lockedCode = await code(lockedEmail);
  for (let i=0;i<3;i++) assert.notEqual((await auth("sign-in/email-otp",{email:lockedEmail,otp:lockedCode === "000000" ? "111111" : "000000"})).status,200);
  assert.notEqual((await auth("sign-in/email-otp",{email:lockedEmail,otp:lockedCode})).status,200);

  const expiredEmail = address("expired-otp"), expiredCode = await code(expiredEmail);
  db.prepare('UPDATE verification SET expiresAt=1 WHERE identifier LIKE ?').run(`%${expiredEmail}%`);
  assert.notEqual((await auth("sign-in/email-otp",{email:expiredEmail,otp:expiredCode})).status,200);

  const raceEmail = address("race-otp"), raceCode = await code(raceEmail);
  const race = await Promise.all([auth("sign-in/email-otp",{email:raceEmail,otp:raceCode}),auth("sign-in/email-otp",{email:raceEmail,otp:raceCode})]);
  assert.equal(race.filter((response)=>response.status===200).length,1);

  const removedLinkEmail = address("removed-link");
  assert.equal((await auth("sign-in/magic-link", {email:removedLinkEmail})).status,404);
  assert.equal((await auth("magic-link/verify?token=disabled-token")).status,404);
  const captured = await (await fetch(`${base}/__dev/mail`)).json();
  assert.equal(captured.some((message: {to: string}) => message.to === removedLinkEmail),false,"Disabled magic links must not send email");

  const rateIp = nextIp();
  for (let i=0;i<3;i++) assert.equal((await auth("email-otp/send-verification-otp",{email:address(`rate-${i}`),type:"sign-in"},rateIp)).status,200);
  assert.equal((await auth("email-otp/send-verification-otp",{email:address("rate-blocked"),type:"sign-in"},rateIp)).status,429);
  assert.equal((await fetch(`${base}/__dev/mail`,{headers:{Origin:"https://evil.example"}})).status,403);
  console.log("Email-code smoke passed: new/existing accounts, ownership, hashed codes, expiry, resend rotation, attempt limits, atomic single use, disabled magic links, and rate limits.");
} finally {
  if (taskId) db.prepare('DELETE FROM tasks WHERE id=?').run(taskId);
  for (const email of testEmails) {
    db.prepare('DELETE FROM user WHERE email=?').run(email);
    db.prepare('DELETE FROM verification WHERE identifier LIKE ? OR value LIKE ?').run(`%${email}%`,`%${email}%`);
  }
  db.close();
}
