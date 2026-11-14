import { test, expect } from "./fixtures";
import type { SyncTask } from "@dodo/shared/sync";

test("sync is retry-safe, detects concurrent conflicts, and includes deletion and restore checkpoints", async ({ context, account, playwright }) => {
  await account.create({ title: "Sync fixture" });
  const headers = { "X-Dodo-Account": account.id, Origin: "http://localhost:8790" };
  const pull = async (sequence = 0) => {
    const response = await context.request.get(`/api/sync/pull?sequence=${sequence}`, { headers });
    expect(response.ok()).toBeTruthy();
    return response.json() as Promise<{ documents: SyncTask[]; checkpoint: { sequence: number } }>;
  };
  const push = (next: SyncTask, assumed?: SyncTask) => context.request.post("/api/sync/push", { headers,
    data: [{ newDocumentState: next, ...(assumed ? { assumedMasterState: assumed } : {}) }] });
  const initial = await pull();
  const original = initial.documents[0];
  const next = { ...original, id: crypto.randomUUID(), title: "Offline create", revision: crypto.randomUUID() };
  expect(await (await push(next)).json()).toEqual([]);
  const beforeRetry = await pull();
  expect(await (await push(next)).json()).toEqual([]);
  expect((await pull()).checkpoint).toEqual(beforeRetry.checkpoint);
  const outcomes = await Promise.all(["First", "Second"].map(title => push({ ...original, title, revision: crypto.randomUUID() }, original).then(response => response.json())));
  expect(outcomes.filter(result => result.length === 0)).toHaveLength(1);
  expect(outcomes.filter(result => result.length === 1)).toHaveLength(1);
  const beforeDelete = await pull();
  expect((await context.request.delete(`/api/tasks/${original.id}`, { headers })).status()).toBe(204);
  const deleted = await pull(beforeDelete.checkpoint.sequence);
  expect(deleted.documents).toHaveLength(1);
  expect(deleted.documents[0]._deleted).toBe(true);
  expect((await context.request.post(`/api/tasks/${original.id}/restore`, { headers })).ok()).toBeTruthy();
  const restored = await pull(deleted.checkpoint.sequence);
  expect(restored.documents[0]._deleted).toBe(false);
  expect(restored.checkpoint.sequence).toBeGreaterThan(deleted.checkpoint.sequence);
  expect((await context.request.get("/api/sync/pull", { headers: { "X-Dodo-Account": "another-user" } })).status()).toBe(403);
  expect((await context.request.post("/api/sync/push", { headers, data: [{ newDocumentState: { ...next, owner: "other" } }] })).status()).toBe(400);
  expect((await context.request.get("/api/sync/pull?sequence=-1", { headers })).status()).toBe(400);
  expect((await context.request.get("/api/sync/pull?limit=1000", { headers })).status()).toBe(400);
  expect((await context.request.post("/api/sync/push", { headers, data: "x".repeat(140000) })).status()).toBe(413);
  expect((await context.request.get("/api/sync/push", { headers })).status()).toBe(405);
  expect((await context.request.post("/api/sync/push", { headers: { ...headers, Origin: "https://evil.example" }, data: [] })).status()).toBe(403);
  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:8790" });
  try { expect((await anonymous.get("/api/sync/pull", { headers })).status()).toBe(401); }
  finally { await anonymous.dispose(); }
});
