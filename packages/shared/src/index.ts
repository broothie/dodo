import { parseDue, type Due, type DueKind } from "@dodo/shared/scheduling";
export * from "@dodo/shared/scheduling";

export type Task = Due & {
  id: string;
  title: string;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TaskInput = { title: string } & Partial<Due>;
export type TaskPatch = Partial<Pick<Task, "title" | "completedAt">> & {
  dueKind?: DueKind;
  dueAt?: string | null;
  timeZone?: string | null;
};

export function parseTaskInput(value: unknown, partial = false): TaskPatch {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a task object.");
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        !["title", "completedAt", "dueKind", "dueAt", "timeZone"].includes(key),
    )
  )
    throw new Error("Unknown task field.");
  const result: TaskPatch = {};
  if (!partial || "title" in body) {
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.trim().length > 300
    )
      throw new Error("Use a title between 1 and 300 characters.");
    result.title = body.title.trim();
  }
  if ("completedAt" in body) {
    if (body.completedAt === null) {
      result.completedAt = null;
    } else {
      // Require an explicit timezone; normalize valid ISO instants to UTC.
      if (
        typeof body.completedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
          body.completedAt,
        ) ||
        !Number.isFinite(Date.parse(body.completedAt)) ||
        new Date(`${body.completedAt.slice(0, 10)}T00:00:00.000Z`)
          .toISOString()
          .slice(0, 10) !== body.completedAt.slice(0, 10)
      ) {
        throw new Error(
          "CompletedAt must be an ISO timestamp with a timezone, or null.",
        );
      }
      result.completedAt = new Date(body.completedAt).toISOString();
    }
  }
  if (["dueKind", "dueAt", "timeZone"].some((key) => key in body)) {
    const due: Record<string, unknown> = {};
    for (const key of ["dueKind", "dueAt", "timeZone"])
      if (key in body) due[key] = body[key];
    Object.assign(result, parseDue(due));
  }
  if (partial && !Object.keys(result).length)
    throw new Error("Include a task field to update.");
  return result;
}

export function createTaskClient(
  baseUrl: string,
  getHeaders: () => Promise<Record<string, string>>,
) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}/api/tasks${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(await getHeaders()),
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        body.error || "Could not reach your tasks. Please try again.",
      );
    }
    return response.status === 204
      ? (undefined as T)
      : (response.json() as Promise<T>);
  }
  return {
    list: () => request<Task[]>(""),
    create: (input: TaskInput) =>
      request<Task>("", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, patch: TaskPatch) =>
      request<Task>(`/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    remove: (id: string) => request<void>(`/${id}`, { method: "DELETE" }),
    restore: (id: string) => request<Task>(`/${id}/restore`, { method: "POST" }),
  };
}
