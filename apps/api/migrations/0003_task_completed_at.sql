ALTER TABLE tasks ADD COLUMN completed_at TEXT;
-- Historical completion times were not stored. Preserve completion status using
-- the last update as the best available approximation for existing done tasks.
UPDATE tasks SET completed_at = updated_at WHERE completed = 1;
ALTER TABLE tasks DROP COLUMN completed;
