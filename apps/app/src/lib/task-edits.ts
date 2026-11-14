import type { Task, TaskPatch } from "@dodo/shared";
import type { ParsedTaskText } from "@dodo/shared/natural-language";

type TaskEditPlan =
  | { kind: "delete" }
  | { kind: "invalid"; message: string }
  | { kind: "unchanged" }
  | { kind: "update"; patch: TaskPatch };

// Keep the decision to save/delete separate from network and focus effects.
export function planTaskEdit(task: Task, text: string, parsed: ParsedTaskText, deleteEmpty = false): TaskEditPlan {
  if (deleteEmpty && !text.trim()) return { kind: "delete" };
  if (parsed.error || !parsed.title)
    return { kind: "invalid", message: parsed.error || "Add a task title as well as a deadline." };
  if (parsed.title === task.title && !parsed.matches.length) return { kind: "unchanged" };
  return {
    kind: "update",
    patch: { title: parsed.title, ...(parsed.matches.length ? parsed.due : {}) },
  };
}
