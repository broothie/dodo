export function isEmptyBackspace({
  key, text, repeat = false, isComposing = false, keyCode,
  readOnly = false, disabled = false,
}: {
  key: string;
  text: string;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  readOnly?: boolean;
  disabled?: boolean;
}): boolean {
  return key === "Backspace" && !text.trim() && !repeat && !isComposing &&
    keyCode !== 229 && !readOnly && !disabled;
}
