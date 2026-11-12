const key = "dodo.workspace.v1";
export async function getWorkspaceToken(): Promise<string> {
  let token = localStorage.getItem(key);
  if (!token) {
    token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");
    localStorage.setItem(key, token);
  }
  return token;
}
