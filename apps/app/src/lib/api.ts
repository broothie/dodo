import { createTaskClient } from "@dodo/shared";
import { sessionHeaders, apiBase } from "./auth-client";
import { readLegacyWorkspaceToken, clearLegacyWorkspaceToken } from "./workspace";
export const api = createTaskClient(apiBase, sessionHeaders);
export async function importBrowserTasks() {
  const token = await readLegacyWorkspaceToken();
  if (!token) return;
  const response = await fetch(`${apiBase}/api/tasks/claim`, {
    method: "POST", credentials: "include",
    headers: { ...(await sessionHeaders()), Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Could not import this browser’s tasks. Please try again.");
  await clearLegacyWorkspaceToken();
}
