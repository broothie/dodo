const key = "dodo.workspace.v1";
export async function readLegacyWorkspaceToken() { return localStorage.getItem(key); }
export async function clearLegacyWorkspaceToken() { localStorage.removeItem(key); }
