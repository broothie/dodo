import { parseSyncWrites, sameSyncTask, type SyncTask } from "@dodo/shared/sync";
import { taskColumns, taskFromRow, type TaskRow } from "./task-record";

type SyncRow = TaskRow & { revision: string; sync_sequence: number };
const columns = `${taskColumns}, revision, sync_sequence`;
const document = (row: SyncRow): SyncTask => ({ ...taskFromRow(row), revision: row.revision, _deleted: row.deleted_at !== null });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function taskSync(request: Request, db: D1Database, owner: string) {
  const url = new URL(request.url);
  if (url.pathname === "/api/sync/pull") {
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
    const sequence = Number(url.searchParams.get("sequence") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    if (!Number.isSafeInteger(sequence) || sequence < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
      return json({ error: "Invalid sync checkpoint or limit." }, 400);
    // The primary is used for both directions; a read replica must not lag a push.
    const rows = await db.prepare(`SELECT ${columns} FROM tasks WHERE owner = ? AND sync_sequence > ? ORDER BY sync_sequence LIMIT ?`).bind(owner, sequence, limit).all<SyncRow>();
    return json({ documents: rows.results.map(document), checkpoint: { sequence: rows.results.at(-1)?.sync_sequence ?? sequence } });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let writes;
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) { await reader.cancel(); return json({ error: "Request is too large." }, 413); }
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    writes = parseSyncWrites(JSON.parse(new TextDecoder().decode(data)));
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid sync writes." }, 400); }

  const conflicts: SyncTask[] = [];
  for (const { newDocumentState: next, assumedMasterState: assumed } of writes) {
    // Each write is one atomic insert or compare-and-swap UPDATE.
    const result = assumed
      ? await db.prepare(`UPDATE tasks SET title = ?, completed_at = ?, deleted_at = ?, due_kind = ?, due_at = ?,
          time_zone = ?, updated_at = ?, revision = ? WHERE id = ? AND owner = ? AND revision = ? AND created_at = ? RETURNING id`)
        .bind(next.title, next.completedAt, next.deletedAt, next.dueKind, next.dueAt, next.timeZone, next.updatedAt,
          next.revision, next.id, owner, assumed.revision, next.createdAt).first()
      : await db.prepare(`INSERT INTO tasks
          (id, owner, title, completed_at, deleted_at, due_kind, due_at, time_zone, created_at, updated_at, revision)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING id`)
        .bind(next.id, owner, next.title, next.completedAt, next.deletedAt, next.dueKind, next.dueAt, next.timeZone,
          next.createdAt, next.updatedAt, next.revision).first();
    if (result) continue;
    const current = await db.prepare(`SELECT ${columns} FROM tasks WHERE id = ? AND owner = ?`).bind(next.id, owner).first<SyncRow>();
    if (!current) return json({ error: "Task identity unavailable." }, 409);
    // Retrying a write whose response was lost is already a success.
    const master = document(current);
    if (!sameSyncTask(master, next)) conflicts.push(master);
  }
  return json(conflicts);
}
