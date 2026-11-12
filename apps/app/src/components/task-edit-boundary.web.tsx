import { useEffect, useRef, type PropsWithChildren } from "react";
type Props = PropsWithChildren<{ active: boolean; onOutside: () => void }>;
export function OutsideEditProvider({ children }: PropsWithChildren) {
  return children;
}
export function TaskEditBoundary({ active, onOutside, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        ref.current &&
        !ref.current.contains(event.target)
      )
        onOutside();
    };
    // Pointer events cover non-focusable blank space; focus events cover Tab.
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
    };
  }, [active, onOutside]);
  return <div ref={ref}>{children}</div>;
}
