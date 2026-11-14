// Native remains on the existing online API until a durable native RxStorage
// is selected. The PWA uses task-store.web.ts; no paid/trial storage is bundled.
import { api } from "./api";
import type { TaskStore } from "./task-store.types";
export async function openTaskStore(_userId: string): Promise<TaskStore> {
  return {
    ...api,
    subscribe: () => () => {},
    subscribeStatus: listener => { listener({ online: true, active: false, error: "" }); return () => {}; },
    resync: () => {},
    release: () => {},
  };
}
