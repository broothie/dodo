import { formatDue, type Task } from "@dodo/shared";

export type TaskSection = { key: string; title: string; data: Task[] };

function calendarDate(task: Task): string | null {
  if (task.dueKind === "none") return null;
  if (task.dueKind === "date") return task.dueAt;
  // Match date chips: timed deadlines use the viewer's local calendar day.
  const date = new Date(task.dueAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function newestFirst(a: Task, b: Task): number {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

export function insertTaskAfter(tasks: readonly Task[], task: Task, afterId: string | null): Task[] {
  const index = afterId ? tasks.findIndex(item => item.id === afterId) : -1;
  if (index < 0) return [task, ...tasks];
  return [...tasks.slice(0, index + 1), task, ...tasks.slice(index + 1)];
}

export function groupTasksByDate(tasks: readonly Task[], now = new Date()): TaskSection[] {
  const dates = new Map<string, Task[]>();
  const undated: Task[] = [];
  const completed: Task[] = [];
  for (const task of tasks) {
    if (task.completedAt !== null) { completed.push(task); continue; }
    const day = calendarDate(task);
    if (!day) { undated.push(task); continue; }
    const group = dates.get(day) ?? [];
    group.push(task);
    dates.set(day, group);
  }
  const sections: TaskSection[] = [...dates.keys()].sort().map(day => ({
    key: day,
    title: formatDue({ dueKind: "date", dueAt: day, timeZone: null }, now),
    data: dates.get(day)!.sort((a, b) => {
      // All-day tasks precede timed tasks, which run from earliest to latest.
      if (a.dueKind !== b.dueKind) return a.dueKind === "date" ? -1 : 1;
      if (a.dueKind === "datetime" && b.dueKind === "datetime")
        return Date.parse(a.dueAt) - Date.parse(b.dueAt);
      // Keep list order within a deadline so inline insertion stays below its anchor.
      return 0;
    }),
  }));
  if (undated.length) sections.push({ key: "undated", title: "No date", data: undated });
  if (completed.length) sections.push({ key: "completed", title: "Completed", data: completed.sort((a, b) =>
    Date.parse(b.completedAt!) - Date.parse(a.completedAt!) || newestFirst(a, b)) });
  return sections;
}
