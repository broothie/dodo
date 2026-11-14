import { createRef, useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { Input, toast } from "tamagui";
import { noDue, type Due, type Task, type TaskPatch } from "@dodo/shared";
import { parseTaskText, preserveLiteralRanges, type TextRange } from "@dodo/shared/natural-language";
import { openTaskStore } from "../lib/task-store";
import type { TaskStore, SyncStatus } from "../lib/task-store.types";
import { groupTasksByDate, insertTaskAfter, reconcileTaskOrder } from "../lib/task-sections";
import { planTaskEdit } from "../lib/task-edits";
import type { TaskComposerProps } from "../components/task-composer";
import type { TaskRowProps } from "../components/task-row";

// Owns task persistence, drafts, and keyboard focus; rendering stays in components.
export function useTaskController(userId: string) {
  const storeRef = useRef<TaskStore | null>(null);
  const api = {
    create: (input: Parameters<TaskStore["create"]>[0]) => storeRef.current!.create(input),
    update: (id: string, patch: TaskPatch) => storeRef.current!.update(id, patch),
    remove: (id: string) => storeRef.current!.remove(id),
    restore: (id: string) => storeRef.current!.restore(id),
  };
  const mutationQueue = useRef(Promise.resolve());
  const savingTitles = useRef(new Set<string>());
  const removingTasks = useRef(new Set<string>());
  const restoringTasks = useRef(new Set<string>());
  const taskInputs = useRef(new Map<string, RefObject<ComponentRef<typeof Input> | null>>());
  const focusedTask = useRef<string | null>(null);
  const newTaskInput = useRef<ComponentRef<typeof Input>>(null);
  const creatingTask = useRef(false);
  const newTaskFocused = useRef(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [newLiteralRanges, setNewLiteralRanges] = useState<TextRange[]>([]);
  const [adding, setAdding] = useState(false);
  const [newAfter, setNewAfter] = useState<string | null>(null);
  const [newDue, setNewDue] = useState<Due>(noDue);
  const [newReference, setNewReference] = useState(() => new Date());
  const [editReference, setEditReference] = useState(() => new Date());
  const [dueEditor, setDueEditor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLiteralRanges, setEditLiteralRanges] = useState<TextRange[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ online: true, active: false, error: "" });
  const editingTask = tasks.find((task) => task.id === editing);
  const newParsed = useMemo(
    () => parseTaskText(title, { due: newDue, now: newReference, literalRanges: newLiteralRanges }),
    [title, newDue, newReference, newLiteralRanges],
  );
  const editParsed = useMemo(
    () =>
      parseTaskText(editTitle, {
        due: editingTask ?? noDue,
        now: editReference,
        literalRanges: editLiteralRanges,
      }),
    [editTitle, editingTask, editReference, editLiteralRanges],
  );
  const visibleError =
    error || (adding ? newParsed.error : "") || (editing ? editParsed.error : "");
  const load = async () => {
    try {
      const store = storeRef.current;
      if (!store) return;
      const tasks = await store.list();
      setTasks(list => reconcileTaskOrder(list, tasks));
      store.resync();
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not open local tasks.");
    } finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    let dispose = () => {};
    openTaskStore(userId).then(async store => {
      if (!active) { store.release(); return; }
      storeRef.current = store;
      const stopTasks = store.subscribe(incoming => {
        if (active) setTasks(list => reconcileTaskOrder(list, incoming));
      });
      const stopStatus = store.subscribeStatus(status => { if (active) setSyncStatus(status); });
      dispose = () => { stopTasks(); stopStatus(); store.release(); };
      const incoming = await store.list();
      if (active) { setTasks(list => reconcileTaskOrder(list, incoming)); setLoading(false); }
    }).catch(error => {
      if (active) { setError(error instanceof Error ? error.message : "Could not open local tasks."); setLoading(false); }
    });
    return () => { active = false; dispose(); };
  }, [userId]);
  function mutate(
    action: () => Promise<void>,
    propagateError = false,
  ): Promise<void> {
    const pending = mutationQueue.current.then(async () => {
      setBusy(true);
      setError("");
      try {
        await action();
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        );
        if (propagateError) throw error;
      } finally {
        setBusy(false);
      }
    });
    mutationQueue.current = pending.catch(() => {});
    return pending;
  }
  async function update(task: Task, patch: TaskPatch) {
    let result: Task | undefined;
    await mutate(async () => {
      const saved = await api.update(task.id, patch);
      result = saved;
      setTasks((list) =>
        list.map((task) => (task.id === saved.id ? saved : task)),
      );
      setEditing((current) => (current === task.id ? null : current));
    });
    return result;
  }
  function taskInputRef(id: string) {
    let ref = taskInputs.current.get(id);
    if (!ref) {
      ref = createRef<ComponentRef<typeof Input>>();
      taskInputs.current.set(id, ref);
    }
    return ref;
  }
  async function removeTask(task: Task, moveFocus = false) {
    if (removingTasks.current.has(task.id) || savingTitles.current.has(task.id)) return;
    removingTasks.current.add(task.id);
    const visible = groupTasksByDate(tasks).flatMap(section => section.data);
    const index = visible.findIndex(item => item.id === task.id);
    const neighbour = visible[index - 1] ?? visible[index + 1];
    const previousId = tasks[tasks.findIndex(item => item.id === task.id) - 1]?.id ?? null;
    try {
      await mutate(async () => {
        await api.remove(task.id);
        setTasks(list => list.filter(item => item.id !== task.id));
        setEditing(current => current === task.id ? null : current);
        setDueEditor(current => current === task.id ? null : current);
        setNewAfter(current => current === task.id ? null : current);
        taskInputs.current.delete(task.id);
        if (moveFocus && focusedTask.current === task.id && neighbour) {
          focusedTask.current = null;
          taskInputs.current.get(neighbour.id)?.current?.focus();
        }
        toast("Task deleted", {
          toasterId: userId,
          duration: 8000,
          action: { label: "Undo", onClick: () => void restoreTask(task, previousId) },
        });
      });
    } finally { removingTasks.current.delete(task.id); }
  }
  async function restoreTask(task: Task, previousId: string | null) {
    if (restoringTasks.current.has(task.id)) return;
    restoringTasks.current.add(task.id);
    try {
      const restored = await api.restore(task.id);
      setTasks(list => insertTaskAfter(list, restored, previousId));
      toast.success("Task restored", { toasterId: userId });
    } catch {
      toast.error("Could not restore task", {
        toasterId: userId,
        duration: 8000,
        action: { label: "Retry", onClick: () => void restoreTask(task, previousId) },
      });
    } finally { restoringTasks.current.delete(task.id); }
  }
  async function finishEditing(task: Task, deleteEmpty = false) {
    if (editing !== task.id || savingTitles.current.has(task.id) || removingTasks.current.has(task.id)) return null;
    const plan = planTaskEdit(task, editTitle, editParsed, deleteEmpty);
    if (plan.kind === "delete") { await removeTask(task); return null; }
    if (plan.kind === "invalid") { setError(plan.message); return null; }
    if (plan.kind === "unchanged") {
      setEditing(current => current === task.id ? null : current);
      return task;
    }
    savingTitles.current.add(task.id);
    try {
      return await update(task, plan.patch);
    } finally {
      savingTitles.current.delete(task.id);
    }
  }
  async function submitExisting(task: Task) {
    const saved = await finishEditing(task);
    if (!saved) return;
    setTitle("");
    setNewLiteralRanges([]);
    setNewDue(saved);
    setNewReference(new Date());
    setNewAfter(saved.id);
    setDueEditor(null);
    setAdding(true);
  }
  async function saveDue(task: Task, due: Due) {
    const extractedTitle =
      editing === task.id && editParsed.matches.length
        ? editParsed.title
        : null;
    await mutate(async () => {
      const saved = await api.update(task.id, {
        dueKind: due.dueKind,
        dueAt: due.dueAt,
        timeZone: due.timeZone,
      });
      setTasks((list) =>
        list.map((task) => (task.id === saved.id ? saved : task)),
      );
      setDueEditor((current) => (current === task.id ? null : current));
      if (extractedTitle !== null) {
        setEditTitle(extractedTitle);
        setEditLiteralRanges([{ start: 0, end: extractedTitle.length }]);
      }
    }, true);
  }
  async function addTask() {
    if (creatingTask.current || busy || loading || !storeRef.current || !title.trim()) return;
    if (newParsed.error || !newParsed.title) {
      setError(newParsed.error || "Add a task title as well as a deadline.");
      return;
    }
    const draft = newParsed;
    creatingTask.current = true;
    try {
      await mutate(async () => {
        const saved = await api.create({ title: draft.title, ...draft.due });
        setTasks((list) => insertTaskAfter(list, saved, newAfter));
        setTitle("");
        setNewLiteralRanges([]);
        setNewDue(newAfter ? saved : noDue);
        if (newAfter) setNewAfter(saved.id);
        setNewReference(new Date());
        setAdding(newTaskFocused.current);
        setDueEditor(null);
        if (newTaskFocused.current) newTaskInput.current?.focus();
      });
    } finally { creatingTask.current = false; }
  }
  function beginEditing(task: Task) {
    setError("");
    setEditing(task.id);
    setEditTitle(task.title);
    setEditLiteralRanges([{ start: 0, end: task.title.length }]);
    setEditReference(new Date());
    setDueEditor(null);
  }
  function cancelEditing() {
    setError("");
    setEditing(null);
    setDueEditor(null);
  }
  function beginAdding() {
    setError("");
    if (!title) {
      setNewReference(new Date());
      setNewDue(noDue);
      setNewAfter(null);
    }
    setAdding(true);
  }
  function closeAdding() {
    newTaskFocused.current = false;
    setAdding(false);
  }
  const dueTask = tasks.find(task => task.id === dueEditor);
  const dueDialog = dueEditor === "new" ? {
    key: "new",
    due: newParsed.due,
    busy,
    onClose: () => setDueEditor(null),
    onSave: async (due: Due) => {
      if (newParsed.matches.length) {
        setTitle(newParsed.title);
        setNewLiteralRanges([{ start: 0, end: newParsed.title.length }]);
      }
      setNewDue(due);
      setDueEditor(null);
    },
  } : dueTask ? {
    key: dueTask.id,
    due: editing === dueTask.id ? editParsed.due : dueTask,
    busy,
    onClose: () => setDueEditor(null),
    onSave: (due: Due) => saveDue(dueTask, due),
  } : null;

  const composer: TaskComposerProps = {
    inputRef: newTaskInput,
    title, parsed: newParsed, busy, dueEditorOpen: dueEditor === "new",
    onFocus: () => { newTaskFocused.current = true; },
    onBlur: () => { newTaskFocused.current = false; },
    onChangeTitle: text => {
      setNewLiteralRanges(ranges => preserveLiteralRanges(title, text, ranges));
      setTitle(text);
      setError("");
    },
    onSubmit: () => void addTask(),
    onClose: closeAdding,
    onEmptyBackspace: () => {
      closeAdding();
      if (newAfter) taskInputs.current.get(newAfter)?.current?.focus();
    },
    onEditDue: () => setDueEditor(dueEditor === "new" ? null : "new"),
  };

  function row(task: Task): TaskRowProps {
    return {
      task, inputRef: taskInputRef(task.id),
      edit: editing === task.id ? { ...editParsed, text: editTitle } : null,
      busy, dueEditorOpen: dueEditor === task.id,
      onFocus: () => {
        focusedTask.current = task.id;
        if (editing !== task.id) beginEditing(task);
      },
      onBlur: () => { if (focusedTask.current === task.id) focusedTask.current = null; },
      onChangeTitle: text => {
        if (editing !== task.id) {
          beginEditing(task);
          setEditLiteralRanges(preserveLiteralRanges(task.title, text, [{ start: 0, end: task.title.length }]));
        } else {
          setEditLiteralRanges(ranges => preserveLiteralRanges(editTitle, text, ranges));
        }
        setEditTitle(text);
        setError("");
      },
      onCancel: cancelEditing,
      onSubmit: () => void submitExisting(task),
      onFinish: () => void finishEditing(task, true),
      onRemove: moveFocus => void removeTask(task, moveFocus),
      onToggle: checked => void update(task, { completedAt: checked ? new Date().toISOString() : null }),
      onEditDue: () => setDueEditor(editing === task.id && dueEditor === task.id ? null : task.id),
    };
  }

  return {
    tasks, loading, busy, syncStatus, visibleError, adding, composer, dueDialog, row,
    sections: groupTasksByDate(tasks),
    composerAnchor: tasks.some(task => task.id === newAfter) ? newAfter : null,
    beginAdding,
    reload: () => { setLoading(true); void load(); },
  };
}

