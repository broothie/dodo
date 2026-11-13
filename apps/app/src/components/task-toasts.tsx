import { useEffect } from "react";
import { Toast, toast } from "tamagui";
import { authClient } from "../lib/auth-client";

export function TaskToasts() {
  const userId = authClient.useSession().data?.user.id;
  useEffect(() => { toast.dismiss(); }, [userId]);
  return <Toast toasterId={userId ?? "signed-out"} position="bottom-center" duration={8000}>
    <Toast.Viewport offset={{ bottom: 88 }}>
      <Toast.List />
    </Toast.Viewport>
  </Toast>;
}
