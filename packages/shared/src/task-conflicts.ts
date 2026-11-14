import { sameSyncTask, type SyncTask } from "@dodo/shared/sync";

// Merge independent field edits. The server wins same-field conflicts; a
// deletion wins over an edit, so an old offline edit cannot resurrect a task.
export function resolveTaskConflict(master: SyncTask, local: SyncTask, assumed: SyncTask | undefined, revision: string): SyncTask {
  if (!assumed || master._deleted || local._deleted !== assumed._deleted) {
    if (local._deleted && !master._deleted) return { ...master, deletedAt: local.deletedAt, _deleted: true, revision };
    return master;
  }
  const merged = { ...master };
  const groups = [["title"], ["completedAt"], ["dueKind", "dueAt", "timeZone"]] as const;
  for (const group of groups) {
    if (group.every(key => master[key] === assumed[key])) {
      // Preserve due kind/date/zone as one atomic value.
      Object.assign(merged, Object.fromEntries(group.map(key => [key, local[key]])));
    }
  }
  if (sameSyncTask(merged, master)) return master;
  return { ...merged, revision, updatedAt: local.updatedAt };
}
