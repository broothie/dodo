import { useState } from "react";
import type { InputProps } from "tamagui";
export function useTitleScroll() {
  const [offset, setOffset] = useState(0);
  const inputProps: Pick<InputProps, "onScroll"> = {
    onScroll: (event) => {
      if ("contentOffset" in event.nativeEvent)
        setOffset(event.nativeEvent.contentOffset.x);
    },
  };
  return { offset, inputProps };
}
