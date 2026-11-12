import * as SecureStore from "expo-secure-store";
const key = "dodo.workspace.v1";
export function readLegacyWorkspaceToken() { return SecureStore.getItemAsync(key); }
export function clearLegacyWorkspaceToken() { return SecureStore.deleteItemAsync(key); }
