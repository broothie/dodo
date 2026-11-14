import type { RxJsonSchema } from "rxdb/plugins/core";
import type { SyncTask } from "@dodo/shared/sync";

const nullable = { type: ["string", "null"] as ("string" | "null")[] };
export const taskSchema: RxJsonSchema<SyncTask> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    title: { type: "string", maxLength: 300 },
    completedAt: nullable,
    deletedAt: nullable,
    dueKind: { type: "string", enum: ["none", "date", "datetime"] },
    dueAt: nullable,
    timeZone: nullable,
    createdAt: { type: "string", maxLength: 40 },
    updatedAt: { type: "string", maxLength: 40 },
    revision: { type: "string", maxLength: 64 },
    _deleted: { type: "boolean" },
  },
  required: ["id", "title", "completedAt", "deletedAt", "dueKind", "dueAt", "timeZone", "createdAt", "updatedAt", "revision"],
};
