import { useEffect, useRef, useState } from "react";
import { Spinner, YStack } from "tamagui";

export function SyncActivity({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (visible) {
      shownAt.current ??= Date.now();
      if (!active) {
        timer = setTimeout(() => {
          shownAt.current = null;
          setVisible(false);
        }, Math.max(0, 600 - (Date.now() - shownAt.current)));
      }
    } else if (active) {
      timer = setTimeout(() => setVisible(true), 300);
    }
    return () => clearTimeout(timer);
  }, [active, visible]);

  return (
    <YStack w={20} h={20} shrink={0} items="center" justify="center">
      {visible && <Spinner size="small" color="color" aria-label="Syncing tasks" />}
    </YStack>
  );
}
