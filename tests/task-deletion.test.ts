import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("deletedAt migration preserves existing tasks and adds an active-task index", () => {
  const database = new DatabaseSync(":memory:");
  const migrations = new URL("../apps/api/migrations/", import.meta.url);
  try {
    for (const name of readdirSync(migrations).filter(name => name.endsWith(".sql") && name < "0006_task_deleted_at.sql").sort())
      database.exec(readFileSync(new URL(name, migrations), "utf8"));
    database.prepare(`INSERT INTO tasks (id, owner, title, completed_at, due_kind, due_at, time_zone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run("fixture", "user:fixture", "Keep my metadata",
      "2026-11-13T12:00:00Z", "datetime", "2026-12-13T15:00:00Z", "Asia/Tokyo",
      "2026-11-01T12:00:00Z", "2026-11-13T12:00:00Z");
    const before = database.prepare("SELECT * FROM tasks WHERE id = ?").get("fixture");
    database.exec(readFileSync(new URL("0006_task_deleted_at.sql", migrations), "utf8"));
    const { deleted_at, ...after } = database.prepare("SELECT * FROM tasks WHERE id = ?").get("fixture")!;
    assert.equal(deleted_at, null);
    assert.deepEqual(after, { ...before });
    const index = database.prepare("PRAGMA index_list(tasks)").all().find(index => index.name === "tasks_owner_active_created");
    assert.equal(index?.partial, 1);
  } finally { database.close(); }
});
