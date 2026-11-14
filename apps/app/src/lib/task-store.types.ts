import type { Task, TaskInput, TaskPatch } from "@dodo/shared";

export type SyncStatus = { online: boolean; active: boolean; error: string };
export type TaskStore = {
  list: () => Promise<Task[]>;
  create: (input: TaskInput) => Promise<Task>;
  update: (id: string, patch: TaskPatch) => Promise<Task>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<Task>;
  subscribe: (listener: (tasks: Task[]) => void) => () => void;
  subscribeStatus: (listener: (status: SyncStatus) => void) => () => void;
  resync: () => void;
  release: () => void;
};
