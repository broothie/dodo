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
async function link(email: string) {
  const response = await auth("sign-in/magic-link", { email });
  assert.equal(response.status, 200, await response.clone().text());
  const message = await mail(email);
  const url = new URL(message.text.match(/http[^\s]+/)![0]);
  const token = url.searchParams.get("token")!;
  assert.ok(token);
  assert.equal(url.pathname, "/auth/verify");
  assert.equal(url.searchParams.get("email"), email);
  assert.ok(!(await response.text()).includes(token));
  return { url, token };
}
async function verify(token: string, ip = nextIp(), extra: Record<string, string> = {}) {
  return fetch(`${base}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`, {
    redirect: "manual", headers: { Origin: base, "X-Dodo-Magic-Link": "1", "CF-Connecting-IP": ip, ...extra },
  });
}
const existingEmail = `passwordless-existing-${suffix}@example.test`;
const password = crypto.randomUUID();
const created = await auth("sign-up/email", { name: "Passwordless smoke", email: existingEmail, password });
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

  const magicEmail = address("magic"), magic = await link(magicEmail);
  const magicRecord = db.prepare('SELECT identifier FROM verification WHERE value LIKE ?').get(`%${magicEmail}%`);
  assert.ok(magicRecord && !String(magicRecord.identifier).includes(magic.token), "Link tokens should be hashed in D1");
  // Following the emailed page and the raw endpoint cannot consume the token.
  assert.equal((await fetch(magic.url)).status,200);
  assert.equal((await fetch(`${base}/api/auth/magic-link/verify?token=${magic.token}`)).status,400);
  assert.equal((await verify(magic.token,nextIp(),{Origin:"https://evil.example"})).status,403);
  const linked = await verify(magic.token);
  assert.equal(linked.status,200,await linked.clone().text());
  assert.equal((await linked.json()).user.email,magicEmail);
  assert.ok(cookie(linked));
  assert.equal((await verify(magic.token)).status,400);

  const expiredMagicEmail = address("expired-magic"), expiredMagic = await link(expiredMagicEmail);
  db.prepare("UPDATE verification SET expiresAt=1 WHERE value LIKE ?").run(`%${expiredMagicEmail}%`);
  assert.equal((await verify(expiredMagic.token)).status,400);

  const raceMagicEmail = address("race-magic"), raceMagic = await link(raceMagicEmail);
  const magicRace = await Promise.all([verify(raceMagic.token),verify(raceMagic.token)]);
  assert.deepEqual(magicRace.map((response)=>response.status).sort(),[200,400]);

  const rateIp = nextIp();
  for (let i=0;i<3;i++) assert.equal((await auth("email-otp/send-verification-otp",{email:address(`rate-${i}`),type:"sign-in"},rateIp)).status,200);
  assert.equal((await auth("email-otp/send-verification-otp",{email:address("rate-blocked"),type:"sign-in"},rateIp)).status,429);
  assert.equal((await fetch(`${base}/__dev/mail`,{headers:{Origin:"https://evil.example"}})).status,403);
  console.log("Passwordless smoke passed: new/existing accounts, ownership, hashed codes, expiry, resend rotation, attempt limits, atomic single use, scanner protection, CSRF, and rate limits.");
} finally {
  if (taskId) db.prepare('DELETE FROM tasks WHERE id=?').run(taskId);
  for (const email of testEmails) {
    db.prepare('DELETE FROM user WHERE email=?').run(email);
    db.prepare('DELETE FROM verification WHERE identifier LIKE ? OR value LIKE ?').run(`%${email}%`,`%${email}%`);
  }
  db.close();
}
