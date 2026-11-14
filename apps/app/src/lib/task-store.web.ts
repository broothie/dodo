import { addRxPlugin, createRxDatabase, type RxCollection } from "rxdb/plugins/core";
import { RxDBLeaderElectionPlugin } from "rxdb/plugins/leader-election";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { wrappedValidateAjvStorage } from "rxdb/plugins/validate-ajv";
import { replicateRxCollection } from "rxdb/plugins/replication";
import { noDue, parseDue, parseTaskInput, type Task } from "@dodo/shared";
import { sameSyncTask, syncTaskKeys, type SyncTask, type SyncCheckpoint } from "@dodo/shared/sync";
import { resolveTaskConflict } from "@dodo/shared/task-conflicts";
import { apiBase, sessionHeaders } from "./auth-client";
import { taskSchema } from "./task-schema";
import { readRememberedAccount, subscribeRememberedAccount } from "./account-cache";
import type { TaskStore, SyncStatus } from "./task-store.types";

addRxPlugin(RxDBLeaderElectionPlugin);
const stores = new Map<string, Promise<Awaited<ReturnType<typeof createStore>>>>();
const wire = (value: SyncTask): SyncTask => Object.fromEntries(syncTaskKeys.map(key => [key, value[key]])) as SyncTask;
function task(value: SyncTask): Task {
  const { revision: _revision, _deleted, ...data } = wire(value);
  return data;
}

async function createStore(userId: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${location.origin}:${userId}`));
  const suffix = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  const db = await createRxDatabase<{ tasks: RxCollection<SyncTask> }>({
    name: `dodo-tasks-v1-${suffix}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageDexie() }),
    multiInstance: true,
    closeDuplicates: true,
  });
  await db.addCollections({ tasks: {
    schema: taskSchema,
    conflictHandler: {
      isEqual: sameSyncTask,
      resolve: async input => resolveTaskConflict(input.realMasterState, input.newDocumentState, input.assumedMasterState, crypto.randomUUID()),
    },
  } });
  const collection = db.tasks;
  const query = collection.find();
  const statusListeners = new Set<(status: SyncStatus) => void>();
  let status: SyncStatus = { online: navigator.onLine, active: false, error: "" };
  const setStatus = (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch };
    for (const listener of statusListeners) listener(status);
  };
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${apiBase}/api/sync/${path}`, {
      ...init, credentials: "include", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", "X-Dodo-Account": userId, ...(await sessionHeaders()) },
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Sign in to sync your saved changes." : "Sync paused. Your changes are saved on this device.");
    setStatus({ error: "" });
    return response.json();
  }
  const replication = replicateRxCollection<SyncTask, SyncCheckpoint>({
    collection, replicationIdentifier: `dodo-tasks-v1:${userId}`, live: true,
    retryTime: 5000, waitForLeadership: true, autoStart: false, toggleOnDocumentVisible: false,
    pull: {
      batchSize: 100,
      handler: (checkpoint, limit) => request(`pull?sequence=${checkpoint?.sequence ?? 0}&limit=${limit}`),
    },
    push: {
      batchSize: 20,
      handler: rows => request("push", { method: "POST", body: JSON.stringify(rows.map(row => ({
        newDocumentState: wire(row.newDocumentState),
        ...(row.assumedMasterState ? { assumedMasterState: wire(row.assumedMasterState) } : {}),
      }))) }),
    },
  });
  replication.active$.subscribe(active => setStatus({ active }));
  replication.error$.subscribe(() => setStatus({ error: "Sync paused. Your changes are saved on this device." }));
  let enabled = true;
  const resync = () => { if (enabled && navigator.onLine) replication.reSync(); };
  const connectivity = () => { setStatus({ online: navigator.onLine }); resync(); };
  const visibility = () => { if (document.visibilityState === "visible") resync(); };
  // The signed-in account owns this store, not the task screen. Keep syncing
  // while Settings is open; close on sign-out/switch so a dormant tab cannot
  // retain leadership and block another tab's writes.
  void db.waitForLeadership().then(() => { if (enabled) return replication.start(); }).catch(() => {
    setStatus({ error: "Sync paused. Your changes are saved on this device." });
  });
  const timer = setInterval(resync, 10000);
  window.addEventListener("online", connectivity);
  window.addEventListener("offline", connectivity);
  document.addEventListener("visibilitychange", visibility);
  const stopAccount = subscribeRememberedAccount(() => {
    if (readRememberedAccount()?.id === userId || !enabled) return;
    enabled = false;
    stores.delete(userId);
    clearInterval(timer);
    window.removeEventListener("online", connectivity);
    window.removeEventListener("offline", connectivity);
    document.removeEventListener("visibilitychange", visibility);
    stopAccount();
    void replication.cancel().then(() => db.close()).catch(() => {});
  });
  const local: Omit<TaskStore, "release"> = {
    async list() { return (await query.exec()).map(doc => task(doc.toJSON(true))); },
    async create(input) {
      const parsed = parseTaskInput(input);
      const now = new Date().toISOString();
      const data: SyncTask = { ...noDue, ...parsed, id: crypto.randomUUID(), title: parsed.title!, completedAt: null, deletedAt: null,
        createdAt: now, updatedAt: now, revision: crypto.randomUUID(), _deleted: false } as SyncTask;
      return task((await collection.insert(data)).toJSON(true));
    },
    async update(id, patch) {
      const parsed = parseTaskInput(patch, true);
      const doc = await collection.findOne(id).exec();
      if (!doc) throw new Error("Task not found.");
      const saved = await doc.incrementalModify(data => ({ ...data, ...parsed,
        ...parseDue(parsed.dueKind !== undefined ? { dueKind: parsed.dueKind, dueAt: parsed.dueAt, timeZone: parsed.timeZone } :
          { dueKind: data.dueKind, dueAt: data.dueAt, timeZone: data.timeZone }),
        updatedAt: new Date().toISOString(), revision: crypto.randomUUID() }));
      return task(saved.toJSON(true));
    },
    async remove(id) {
      const doc = await collection.findOne(id).exec();
      if (!doc) return;
      await doc.incrementalModify(data => ({ ...data, deletedAt: new Date().toISOString(), _deleted: true, revision: crypto.randomUUID() }));
    },
    async restore(id) {
      const [deleted] = await collection.storageInstance.findDocumentsById([id], true);
      if (!deleted) throw new Error("Task not found.");
      const saved = await collection.incrementalUpsert({ ...wire(deleted), deletedAt: null, _deleted: false, revision: crypto.randomUUID() });
      return task(saved.toJSON(true));
    },
    subscribe(listener) {
      const subscription = query.$.subscribe(docs => listener(docs.map(doc => task(doc.toJSON(true)))));
      return () => subscription.unsubscribe();
    },
    subscribeStatus(listener) { statusListeners.add(listener); listener(status); return () => { statusListeners.delete(listener); }; },
    resync,
  };
  return { local };
}

export async function openTaskStore(userId: string): Promise<TaskStore> {
  let promise = stores.get(userId);
  if (!promise) {
    promise = createStore(userId);
    stores.set(userId, promise);
    void promise.catch(() => stores.delete(userId));
  }
  const store = await promise;
  return { ...store.local, release: () => {} };
}
