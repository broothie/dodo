import { useEffect, type MouseEvent } from "react";
import { Button, Toast, XStack, toast } from "tamagui";
import { useCurrentAccount } from "../hooks/use-current-account";

export function TaskToasts() {
  const userId = useCurrentAccount().user?.id;
  useEffect(() => { toast.dismiss(); }, [userId]);
  return <Toast toasterId={userId ?? "signed-out"} position="bottom-center" duration={8000}>
    <Toast.Viewport offset={{ bottom: 88 }}>
      <Toast.List renderItem={({ toast: item, index, handleClose }) => (
        <Toast.Item toast={item} index={index} borderWidth={0} self="center" maxW="100%">
          <XStack items="center" gap="2">
            <Toast.Title>{typeof item.title === "function" ? item.title() : item.title}</Toast.Title>
            {item.action && (
              <Button size="sm" onPress={event => {
                item.action?.onClick?.(event as unknown as MouseEvent);
                if (!event.defaultPrevented) handleClose();
              }}>
                {item.action.label}
              </Button>
            )}
          </XStack>
        </Toast.Item>
      )} />
    </Toast.Viewport>
  </Toast>;
}
