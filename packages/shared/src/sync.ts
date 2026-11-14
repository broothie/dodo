import { parseTaskInput, type Task } from "@dodo/shared";

export type SyncTask = Task & { revision: string; _deleted: boolean };
export type SyncCheckpoint = { sequence: number };
export type SyncWrite = { newDocumentState: SyncTask; assumedMasterState?: SyncTask };
export const syncTaskKeys = ["id", "title", "completedAt", "deletedAt", "dueKind", "dueAt", "timeZone", "createdAt", "updatedAt", "revision", "_deleted"] as const;

export function sameSyncTask(a: SyncTask, b: SyncTask) {
  return syncTaskKeys.every(key => a[key] === b[key]);
}

export function parseSyncTask(value: unknown): SyncTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid sync task.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== syncTaskKeys.length || Object.keys(body).some(key => !syncTaskKeys.includes(key as typeof syncTaskKeys[number])))
    throw new Error("Invalid sync task fields.");
  if (typeof body.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.id)) throw new Error("Invalid task ID.");
  if (typeof body.revision !== "string" || !/^[a-f0-9-]{16,64}$/.test(body.revision)) throw new Error("Invalid task revision.");
  parseTaskInput({ title: body.title, completedAt: body.completedAt, dueKind: body.dueKind, dueAt: body.dueAt, timeZone: body.timeZone });
  if (typeof body.title !== "string" || body.title !== body.title.trim()) throw new Error("Invalid task title.");
  for (const key of ["createdAt", "updatedAt", "deletedAt"] as const) {
    if (key === "deletedAt" && body[key] === null) continue;
    parseTaskInput({ completedAt: body[key] }, true);
    if (typeof body[key] !== "string") throw new Error("Invalid task timestamp.");
  }
  if (typeof body._deleted !== "boolean" || body._deleted !== (body.deletedAt !== null)) throw new Error("Invalid deletion state.");
  return body as SyncTask;
}

export function parseSyncWrites(value: unknown): SyncWrite[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new Error("Send between 1 and 20 sync writes.");
  const ids = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== "object" || Object.keys(row).some(key => !["newDocumentState", "assumedMasterState"].includes(key))) throw new Error("Invalid sync write.");
    const next = parseSyncTask(row.newDocumentState);
    const assumed = row.assumedMasterState === undefined ? undefined : parseSyncTask(row.assumedMasterState);
    if (ids.has(next.id) || (assumed && (assumed.id !== next.id || assumed.createdAt !== next.createdAt || assumed.revision === next.revision))) throw new Error("Invalid sync write identity.");
    ids.add(next.id);
    return { newDocumentState: next, assumedMasterState: assumed };
  });
}
