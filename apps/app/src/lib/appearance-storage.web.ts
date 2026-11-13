const key = "dodo.appearance";
export async function readAppearance() { return localStorage.getItem(key); }
export async function writeAppearance(value: string) { localStorage.setItem(key, value); }
