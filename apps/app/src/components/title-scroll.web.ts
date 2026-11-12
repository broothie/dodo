import { useState } from "react";
import type { InputProps } from "tamagui";
export function useTitleScroll() {
  const [offset, setOffset] = useState(0);
  const inputProps: Pick<InputProps, "onScrollCapture"> = {
    onScrollCapture: (event) => setOffset(event.currentTarget.scrollLeft),
  };
  return { offset, inputProps };
}
