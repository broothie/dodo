CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX tasks_owner_created ON tasks(owner, created_at DESC);
