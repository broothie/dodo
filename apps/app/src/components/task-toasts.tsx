import { useEffect } from "react";
import { Toast, toast } from "tamagui";
import { useCurrentAccount } from "../hooks/use-current-account";

export function TaskToasts() {
  const userId = useCurrentAccount().user?.id;
  useEffect(() => { toast.dismiss(); }, [userId]);
  return <Toast toasterId={userId ?? "signed-out"} position="bottom-center" duration={8000}>
    <Toast.Viewport offset={{ bottom: 88 }}>
      <Toast.List />
    </Toast.Viewport>
  </Toast>;
}
