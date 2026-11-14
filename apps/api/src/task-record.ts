import { parseDue, type Task } from "@dodo/shared";

export type TaskRow = {
  id: string; title: string; completed_at: string | null; deleted_at: string | null;
  due_kind: string; due_at: string | null; time_zone: string | null;
  created_at: string; updated_at: string;
};
export const taskColumns = "id, title, completed_at, deleted_at, due_kind, due_at, time_zone, created_at, updated_at";
export function taskFromRow(row: TaskRow): Task {
  return {
    ...parseDue({ dueKind: row.due_kind, dueAt: row.due_at, timeZone: row.time_zone }),
    id: row.id, title: row.title, completedAt: row.completed_at, deletedAt: row.deleted_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
