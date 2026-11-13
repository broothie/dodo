import * as SecureStore from "expo-secure-store";

const key = "dodo.appearance";
export function readAppearance() { return SecureStore.getItemAsync(key); }
export function writeAppearance(value: string) { return SecureStore.setItemAsync(key, value); }
