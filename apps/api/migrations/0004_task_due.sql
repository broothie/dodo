ALTER TABLE tasks ADD COLUMN due_kind TEXT NOT NULL DEFAULT 'none' CHECK(due_kind IN ('none', 'date', 'datetime'));
ALTER TABLE tasks ADD COLUMN time_zone TEXT;
ALTER TABLE tasks ADD COLUMN due_at TEXT CHECK(
  (due_kind = 'none' AND due_at IS NULL AND time_zone IS NULL) OR
  (due_kind = 'date' AND due_at IS NOT NULL AND length(due_at) = 10 AND time_zone IS NULL) OR
  (due_kind = 'datetime' AND due_at IS NOT NULL AND length(due_at) > 10 AND time_zone IS NOT NULL)
);
CREATE INDEX tasks_owner_due ON tasks(owner, due_kind, due_at);
