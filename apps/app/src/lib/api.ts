import { createTaskClient } from "@dodo/shared";
import { getWorkspaceToken } from "./workspace";
export const api = createTaskClient(
  process.env.EXPO_PUBLIC_API_URL ?? "",
  getWorkspaceToken,
);
