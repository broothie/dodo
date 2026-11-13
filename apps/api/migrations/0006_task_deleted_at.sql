ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
CREATE INDEX tasks_owner_active_created
  ON tasks(owner, created_at DESC, id DESC) WHERE deleted_at IS NULL;
