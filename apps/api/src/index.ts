import { createAuth, trustedOrigins } from "./auth";
import { parseTaskInput, parseDue, type Task } from "@dodo/shared";

type Row = {
  id: string;
  title: string;
  completed_at: string | null;
  due_kind: string;
  due_at: string | null;
  time_zone: string | null;
  created_at: string;
  updated_at: string;
};
const columns =
  "id, title, completed_at, due_kind, due_at, time_zone, created_at, updated_at";
function task(row: Row): Task {
  return {
    ...parseDue({
      dueKind: row.due_kind,
      dueAt: row.due_at,
      timeZone: row.time_zone,
    }),
    id: row.id,
    title: row.title,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const app = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      // Custom task routes use cookies too, so enforce origins on mutations.
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const origin = request.headers.get("Origin");
        if (
          (origin && !trustedOrigins(env.BETTER_AUTH_URL, env.BETTER_AUTH_ADDITIONAL_ORIGINS).includes(origin)) ||
          request.headers.get("Sec-Fetch-Site") === "cross-site"
        )
          return json({ error: "Untrusted request origin." }, 403);
      }
      const auth = createAuth(env);
      if (url.pathname.startsWith("/api/auth/")) {
        let authRequest: Request = request;
        // Auth accepts more fields than tasks, but still bound streamed bodies.
        if (request.body) {
          const reader = request.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 16384) {
              await reader.cancel();
              return json({ error: "Request is too large." }, 413);
            }
            chunks.push(value);
          }
          const data = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
          }
          authRequest = new Request(request, { body: data });
        }
        const response = await auth.handler(authRequest);
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      if (
        url.pathname !== "/api/tasks" &&
        url.pathname !== "/api/tasks/claim" &&
        !/^\/api\/tasks\/[a-f0-9-]{36}$/.test(url.pathname)
      )
        return json({ error: "Not found." }, 404);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return json({ error: "Sign in to access your tasks." }, 401);
      const owner = `user:${session.user.id}`;
      if (url.pathname === "/api/tasks/claim") {
        if (request.method !== "POST")
          return json({ error: "Method not allowed." }, 405);
        const token = request.headers
          .get("Authorization")
          ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
        if (!token) return json({ error: "Invalid legacy workspace key." }, 400);
        const digest = await crypto.subtle.digest(
          "SHA-256", new TextEncoder().encode(token),
        );
        const hash = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        // D1 batch is atomic: a legacy key can only ever belong to one account.
        await env.DB.batch([
          env.DB.prepare("INSERT INTO workspace_claims (owner_hash, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(hash, session.user.id),
          env.DB.prepare("UPDATE tasks SET owner = ? WHERE owner = ? AND EXISTS (SELECT 1 FROM workspace_claims WHERE owner_hash = ? AND user_id = ?)").bind(owner, hash, hash, session.user.id),
        ]);
        const claim = await env.DB.prepare("SELECT user_id FROM workspace_claims WHERE owner_hash = ?").bind(hash).first<{user_id: string}>();
        return claim?.user_id === session.user.id
          ? json({ imported: true })
          : json({ error: "These browser tasks were already claimed by another account." }, 409);
      }
      const id = url.pathname.split("/")[3];
      if (request.method === "GET" && !id) {
        const rows = await env.DB.prepare(
          `SELECT ${columns} FROM tasks WHERE owner = ? ORDER BY created_at DESC, id DESC`,
        )
          .bind(owner)
          .all<Row>();
        return json(rows.results.map(task));
      }
      if (request.method === "DELETE" && id) {
        const result = await env.DB.prepare(
          "DELETE FROM tasks WHERE id = ? AND owner = ?",
        )
          .bind(id, owner)
          .run();
        return result.meta.changes
          ? new Response(null, { status: 204 })
          : json({ error: "Task not found." }, 404);
      }
      if (
        (request.method === "POST" && !id) ||
        (request.method === "PATCH" && id)
      ) {
        // Bound streamed bodies too; Content-Length alone is not trustworthy.
        const reader = request.body?.getReader();
        let size = 0;
        const chunks: Uint8Array[] = [];
        if (reader)
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 4096) {
              await reader.cancel();
              return json({ error: "Request is too large." }, 413);
            }
            chunks.push(value);
          }
        let input;
        try {
          const data = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
          }
          input = parseTaskInput(
            JSON.parse(new TextDecoder().decode(data)),
            !!id,
          );
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Invalid task." },
            400,
          );
        }
        const now = new Date().toISOString();
        if (!id) {
          const row = await env.DB.prepare(
            `INSERT INTO tasks (id, owner, title, completed_at, due_kind, due_at, time_zone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${columns}`,
          )
            .bind(
              crypto.randomUUID(),
              owner,
              input.title!,
              input.completedAt ?? null,
              input.dueKind ?? "none",
              input.dueAt ?? null,
              input.timeZone ?? null,
              now,
              now,
            )
            .first<Row>();
          return json(task(row!), 201);
        }
        const row = await env.DB.prepare(
          `UPDATE tasks SET title = COALESCE(?, title), completed_at = CASE WHEN ? THEN ? ELSE completed_at END, due_kind = CASE WHEN ? THEN ? ELSE due_kind END, due_at = CASE WHEN ? THEN ? ELSE due_at END, time_zone = CASE WHEN ? THEN ? ELSE time_zone END, updated_at = ? WHERE id = ? AND owner = ? RETURNING ${columns}`,
        )
          .bind(
            input.title ?? null,
            Number(input.completedAt !== undefined),
            input.completedAt ?? null,
            Number(input.dueKind !== undefined),
            input.dueKind ?? null,
            Number(input.dueKind !== undefined),
            input.dueAt ?? null,
            Number(input.dueKind !== undefined),
            input.timeZone ?? null,
            now,
            id,
            owner,
          )
          .first<Row>();
        return row ? json(task(row)) : json({ error: "Task not found." }, 404);
      }
      return json({ error: "Method not allowed." }, 405);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "task_request_failed",
          method: request.method,
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
      return json(
        { error: "Your tasks could not be saved. Please try again." },
        500,
      );
    }
  },
} satisfies ExportedHandler<Env>;

// Metro uses a separate origin. Permit its default origin only when this Worker
// itself is running on localhost; deployed APIs remain same-origin.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const local = ["localhost", "127.0.0.1"].includes(new URL(env.BETTER_AUTH_URL).hostname);
    const allow =
      local &&
      origin &&
      ["http://localhost:8081", "http://127.0.0.1:8081"].includes(origin) &&
      url.pathname.startsWith("/api/");
    if (!allow) return app.fetch(request, env);
    const response =
      request.method === "OPTIONS"
        ? new Response(null, { status: 204 })
        : await app.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Dodo-Magic-Link");
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Env>;
