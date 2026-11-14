import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { noDue } from "@dodo/shared";
import { parseSyncTask, parseSyncWrites, type SyncTask } from "@dodo/shared/sync";
import { resolveTaskConflict } from "@dodo/shared/task-conflicts";

const original: SyncTask = { ...noDue, id: "11111111-1111-1111-1111-111111111111", title: "Original", completedAt: null, deletedAt: null,
  createdAt: "2026-11-13T18:00:00.000Z", updatedAt: "2026-11-13T18:00:00.000Z", revision: "a".repeat(32), _deleted: false };

test("sync validates complete documents, batch limits, ownership fields and deletion consistency", () => {
  assert.deepEqual(parseSyncTask(original), original);
  for (const value of [{ ...original, owner: "user:other" }, { ...original, _deleted: true }, { ...original, deletedAt: "invalid" }, { ...original, id: "invalid" }])
    assert.throws(() => parseSyncTask(value));
  assert.throws(() => parseSyncWrites([]));
  assert.throws(() => parseSyncWrites(Array(21).fill({ newDocumentState: original })));
  assert.throws(() => parseSyncWrites([{ newDocumentState: original }, { newDocumentState: original }]));
  assert.throws(() => parseSyncWrites([{ newDocumentState: original, assumedMasterState: original }]));
});

test("replication merges separate fields, keeps deadline fields together and lets the server win overlapping edits", () => {
  const master = { ...original, title: "Server title", revision: "b".repeat(32) };
  const local = { ...original, completedAt: original.createdAt, revision: "c".repeat(32) };
  assert.deepEqual(resolveTaskConflict(master, local, original, "d".repeat(32)), { ...master, completedAt: original.createdAt, revision: "d".repeat(32) });
  assert.deepEqual(resolveTaskConflict(master, { ...local, title: "Local title", completedAt: null }, original, "d".repeat(32)), master);
  const serverDue: SyncTask = { ...master, dueKind: "date", dueAt: "2026-12-14", timeZone: null };
  const localDue: SyncTask = { ...local, dueKind: "datetime", dueAt: original.createdAt, timeZone: "UTC" };
  const merged = resolveTaskConflict(serverDue, localDue, original, "d".repeat(32));
  assert.equal(merged.dueKind, "date"); assert.equal(merged.timeZone, null);
});

test("deletions win conflicts; stale offline edits and stale restores cannot resurrect a task", () => {
  const deleted = { ...original, _deleted: true, deletedAt: original.createdAt, revision: "b".repeat(32) };
  assert.deepEqual(resolveTaskConflict(deleted, { ...original, title: "Stale edit" }, original, "d".repeat(32)), deleted);
  assert.deepEqual(resolveTaskConflict(deleted, original, deleted, "d".repeat(32)), deleted);
  assert.equal(resolveTaskConflict(original, deleted, original, "d".repeat(32))._deleted, true);
});

test("D1 migration tracks old CRUD writes, delete, restore and owner imports independently of task timestamps", () => {
  const db = new DatabaseSync(":memory:");
  const folder = new URL("../apps/api/migrations/", import.meta.url);
  try {
    for (const name of readdirSync(folder).filter(name => name.endsWith(".sql") && name < "0007_task_replication.sql").sort()) db.exec(readFileSync(new URL(name, folder), "utf8"));
    db.prepare("INSERT INTO tasks (id, owner, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(original.id, "old-owner", original.title, original.createdAt, original.updatedAt);
    db.exec(readFileSync(new URL("0007_task_replication.sql", folder), "utf8"));
    const row = () => db.prepare("SELECT * FROM tasks WHERE id=?").get(original.id)!;
    let previous = row();
    assert.ok(Number(previous.sync_sequence) > 0); assert.ok(previous.revision);
    for (const sql of ["UPDATE tasks SET title='Changed'", "UPDATE tasks SET deleted_at='2026-11-13T18:00:00Z'", "UPDATE tasks SET deleted_at=NULL", "UPDATE tasks SET owner='user:claimed'"]) {
      db.exec(sql);
      const next = row();
      assert.ok(Number(next.sync_sequence) > Number(previous.sync_sequence));
      assert.notEqual(next.revision, previous.revision);
      assert.equal(next.updated_at, original.updatedAt);
      previous = next;
    }
    db.exec("UPDATE tasks SET deleted_at=NULL");
    assert.equal(row().sync_sequence, previous.sync_sequence, "No-op retries do not move the checkpoint");
    db.exec("UPDATE tasks SET updated_at='2026-11-14T18:00:00Z'");
    assert.ok(Number(row().sync_sequence) > Number(previous.sync_sequence), "Timestamp-only REST updates also replicate");
  } finally { db.close(); }
});
