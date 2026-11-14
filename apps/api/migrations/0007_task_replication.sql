ALTER TABLE tasks ADD COLUMN revision TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN sync_sequence INTEGER NOT NULL DEFAULT 0;

-- The sequence advances independently of user-visible task timestamps.
UPDATE tasks SET revision = lower(hex(randomblob(16))), sync_sequence = rowid;
CREATE TABLE task_sync_clock (id INTEGER PRIMARY KEY CHECK(id = 1), value INTEGER NOT NULL);
INSERT INTO task_sync_clock SELECT 1, COALESCE(MAX(sync_sequence), 0) FROM tasks;
CREATE INDEX tasks_owner_sync ON tasks(owner, sync_sequence);

CREATE TRIGGER tasks_sync_insert AFTER INSERT ON tasks BEGIN
  UPDATE task_sync_clock SET value = value + 1 WHERE id = 1;
  UPDATE tasks SET sync_sequence = (SELECT value FROM task_sync_clock WHERE id = 1),
    revision = CASE WHEN NEW.revision = '' THEN lower(hex(randomblob(16))) ELSE NEW.revision END
    WHERE id = NEW.id;
END;

-- Also tracks writes from older clients and legacy workspace imports.
CREATE TRIGGER tasks_sync_update AFTER UPDATE OF
  title, completed_at, due_kind, due_at, time_zone, deleted_at, owner, revision, created_at, updated_at ON tasks
WHEN NEW.title IS NOT OLD.title OR NEW.completed_at IS NOT OLD.completed_at
  OR NEW.due_kind IS NOT OLD.due_kind OR NEW.due_at IS NOT OLD.due_at
  OR NEW.time_zone IS NOT OLD.time_zone OR NEW.deleted_at IS NOT OLD.deleted_at
  OR NEW.owner IS NOT OLD.owner OR NEW.revision IS NOT OLD.revision
  OR NEW.created_at IS NOT OLD.created_at OR NEW.updated_at IS NOT OLD.updated_at
BEGIN
  UPDATE task_sync_clock SET value = value + 1 WHERE id = 1;
  UPDATE tasks SET sync_sequence = (SELECT value FROM task_sync_clock WHERE id = 1),
    revision = CASE WHEN NEW.revision = OLD.revision THEN lower(hex(randomblob(16))) ELSE NEW.revision END
    WHERE id = NEW.id;
END;
