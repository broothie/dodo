import assert from "node:assert/strict";
const base = process.env.API_URL ?? "http://localhost:8787";
const token = () =>
  (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");
const owner = token(),
  stranger = token();
async function request(path = "", method = "GET", body?: unknown, key = owner) {
  return fetch(`${base}/api/tasks${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
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
} finally {
  assert.equal((await request(`/${task.id}`, "DELETE")).status, 204);
}
assert.deepEqual(await (await request()).json(), []);
assert.equal((await request(`/${task.id}`, "DELETE")).status, 404);
assert.equal((await fetch(`${base}/api/missing`)).status, 404);
if (process.env.CHECK_PWA === "1") {
  assert.equal((await fetch(`${base}/manifest.json`)).status, 200);
  assert.equal((await fetch(`${base}/sw.js`)).status, 200);
}
console.log(
  "API smoke passed: CRUD, validation, workspace isolation, and deletion.",
);

const preflight = await fetch(`${base}/api/tasks`, {
  method: "OPTIONS",
  headers: {
    Origin: "http://localhost:8081",
    "Access-Control-Request-Headers": "authorization,content-type",
  },
});
assert.equal(preflight.status, 204);
assert.equal(
  preflight.headers.get("Access-Control-Allow-Origin"),
  "http://localhost:8081",
);
const untrusted = await fetch(`${base}/api/tasks`, {
  method: "OPTIONS",
  headers: { Origin: "https://untrusted.example" },
});
assert.equal(untrusted.headers.get("Access-Control-Allow-Origin"), null);
console.log("Development CORS allowlist passed.");
