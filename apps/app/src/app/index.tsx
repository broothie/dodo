import Calendar from "lucide-react-native/icons/calendar";
import { DueDialog } from "../components/due-dialog";
import { TaskTitleInput } from "../components/task-title-input";
import {
  OutsideEditProvider,
  TaskEditBoundary,
} from "../components/task-edit-boundary";
import {
  Button,
  Checkbox,
  H2,
  H3,
  Paragraph,
  Spinner,
  XStack,
  YStack,
  useTheme,
  getVariableValue,
} from "tamagui";
import Check from "lucide-react-native/icons/check";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useEffect, useRef, useState } from "react";
import { FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Head from "expo-router/head";
import {
  noDue,
  formatDue,
  type Due,
  type Task,
  type TaskPatch,
} from "@dodo/shared";
import { api } from "../lib/api";

function CompletionIcon() {
  const theme = useTheme();
  return <Check size={16} color={getVariableValue(theme.color)} />;
}

export default function Tasks() {
  const mutationQueue = useRef(Promise.resolve());
  const savingTitles = useRef(new Set<string>());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [newDue, setNewDue] = useState<Due>(noDue);
  const [dueEditor, setDueEditor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const load = async () => {
    try {
      setTasks(await api.list());
      setError("");
      setOffline(false);
    } catch {
      setOffline(true);
      setError(
        "We couldn’t load your tasks. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    api.list().then(
      (list) => {
        if (active) {
          setTasks(list);
          setLoading(false);
        }
      },
      () => {
        if (active) {
          setOffline(true);
          setError(
            "We couldn’t load your tasks. Check your connection and try again.",
          );
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);
  function mutate(
    action: () => Promise<void>,
    propagateError = false,
  ): Promise<void> {
    const pending = mutationQueue.current.then(async () => {
      setBusy(true);
      setError("");
      try {
        await action();
        setOffline(false);
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
    await mutate(async () => {
      const saved = await api.update(task.id, patch);
      setTasks((list) =>
        list.map((task) => (task.id === saved.id ? saved : task)),
      );
      setEditing((current) => (current === task.id ? null : current));
      setDeleting((current) => (current === task.id ? null : current));
    });
  }
  async function finishEditing(task: Task) {
    if (editing !== task.id || savingTitles.current.has(task.id)) return;
    if (!editTitle.trim()) {
      setError("Task title cannot be empty.");
      return;
    }
    if (editTitle.trim() === task.title) {
      setEditing((current) => (current === task.id ? null : current));
      setDeleting((current) => (current === task.id ? null : current));
      return;
    }
    savingTitles.current.add(task.id);
    try {
      await update(task, { title: editTitle });
    } finally {
      savingTitles.current.delete(task.id);
    }
  }
  async function saveDue(task: Task, due: Due) {
    await mutate(async () => {
      const saved = await api.update(task.id, due);
      setTasks((list) =>
        list.map((task) => (task.id === saved.id ? saved : task)),
      );
      setDueEditor((current) => (current === task.id ? null : current));
    }, true);
  }
  async function addTask() {
    if (busy || loading || offline || !title.trim()) return;
    await mutate(async () => {
      const saved = await api.create({ title, ...newDue });
      setTasks((list) => [saved, ...list]);
      setTitle("");
      setNewDue(noDue);
      setAdding(false);
      setDueEditor(null);
    });
  }
  function beginEditing(task: Task) {
    setError("");
    setEditing(task.id);
    setEditTitle(task.title);
    setDueEditor(null);
    setDeleting(null);
  }
  function cancelEditing() {
    setError("");
    setEditing(null);
    setDueEditor(null);
    setDeleting(null);
  }
  const visible = [...tasks].sort(
    (a, b) => Number(a.completedAt !== null) - Number(b.completedAt !== null),
  );
  return (
    <OutsideEditProvider>
      <YStack flex={1} bg="white">
        <SafeAreaView style={{ flex: 1 }}>
          <Head>
            <title>Dodo</title>
          </Head>
          <YStack flex={1} w="100%" maxW={900} self="center" p="4" gap="4">
            <H2>Dodo</H2>
            <H3>Tasks</H3>
            {!!error && (
              <YStack
                theme="red"
                bg="background"
                p="3"
                rounded="md"
                gap="3"
                role="alert"
              >
                <Paragraph>{error}</Paragraph>
                <Button
                  icon={RotateCw}
                  onPress={() => {
                    setLoading(true);
                    void load();
                  }}
                >
                  Retry
                </Button>
              </YStack>
            )}
            <Paragraph>{`${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}</Paragraph>
            <TaskEditBoundary
              active={adding && dueEditor !== "new"}
              onOutside={() => setAdding(false)}
            >
              <YStack bg="white">
                <XStack items="center" gap="3" py="3">
                  <Checkbox disabled aria-hidden={true} />
                  <TaskTitleInput
                    aria-label="New task"
                    placeholder="New task"
                    onFocus={() => setAdding(true)}
                    maxLength={300}
                    value={title}
                    onChangeText={(text) => {
                      setTitle(text);
                      setAdding(true);
                    }}
                    onSubmitEditing={() => void addTask()}
                    returnKeyType="done"
                    blurOnSubmit={false}
                    flex={1}
                    minW={0}
                  />
                </XStack>
                {adding && (
                  <XStack pb="3">
                    <Button
                      size="sm"
                      rounded="full"
                      aria-label="Set new task due date"
                      icon={Calendar}
                      onPress={() =>
                        setDueEditor(dueEditor === "new" ? null : "new")
                      }
                    >
                      {newDue.dueKind === "none"
                        ? "Add date"
                        : formatDue(newDue)}
                    </Button>
                  </XStack>
                )}
              </YStack>
            </TaskEditBoundary>
            {loading ? (
              <Spinner aria-label="Loading tasks" />
            ) : (
              <FlatList
                data={visible}
                keyExtractor={(task) => task.id}
                ListEmptyComponent={
                  <YStack py="6">
                    <Paragraph>
                      {offline ? "Tasks unavailable offline" : "No tasks"}
                    </Paragraph>
                  </YStack>
                }
                renderItem={({ item }) => (
                  <TaskEditBoundary
                    active={editing === item.id && dueEditor !== item.id}
                    onOutside={() => void finishEditing(item)}
                  >
                    <YStack bg="white">
                      <XStack items="center" gap="3" py="3">
                        <Checkbox
                          aria-label={`Complete ${item.title}`}
                          checked={item.completedAt !== null}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            void update(item, {
                              completedAt:
                                checked === true
                                  ? new Date().toISOString()
                                  : null,
                            })
                          }
                        >
                          <Checkbox.Indicator>
                            <CompletionIcon />
                          </Checkbox.Indicator>
                        </Checkbox>
                        <TaskTitleInput
                          aria-label={`Task title: ${item.title}`}
                          readOnly={busy}
                          maxLength={300}
                          value={editing === item.id ? editTitle : item.title}
                          onFocus={() => {
                            if (editing !== item.id) beginEditing(item);
                          }}
                          onChangeText={(text) => {
                            if (editing !== item.id) beginEditing(item);
                            setEditTitle(text);
                          }}
                          flex={1}
                          minW={0}
                          style={{
                            textDecorationLine:
                              item.completedAt !== null
                                ? "line-through"
                                : "none",
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") cancelEditing();
                          }}
                          onSubmitEditing={() => {
                            void finishEditing(item);
                          }}
                        />
                      </XStack>
                      {editing === item.id && (
                        <YStack gap="3" pb="3" pl="9">
                          <XStack gap="2" flexWrap="wrap">
                            <Button
                              size="sm"
                              rounded="full"
                              aria-label={`Set due date for ${item.title}`}
                              icon={Calendar}
                              disabled={busy}
                              onPress={() => {
                                setDueEditor(
                                  dueEditor === item.id ? null : item.id,
                                );
                                setDeleting(null);
                              }}
                            >
                              {item.dueKind === "none"
                                ? "Add date"
                                : formatDue(item)}
                            </Button>
                            <Button
                              size="sm"
                              rounded="full"
                              aria-label={`Delete ${item.title}`}
                              icon={Trash2}
                              disabled={busy}
                              onPress={() => {
                                setDeleting(
                                  deleting === item.id ? null : item.id,
                                );
                                setDueEditor(null);
                              }}
                            >
                              Delete
                            </Button>
                          </XStack>
                        </YStack>
                      )}
                      {editing !== item.id && item.dueKind !== "none" && (
                        <XStack pb="3" pl="9">
                          <Button
                            size="sm"
                            rounded="full"
                            aria-label={`Set due date for ${item.title}`}
                            icon={Calendar}
                            disabled={busy}
                            onPress={() => setDueEditor(item.id)}
                          >
                            {formatDue(item)}
                          </Button>
                        </XStack>
                      )}

                      {editing === item.id && deleting === item.id && (
                        <YStack gap="3" pb="3">
                          <Paragraph>Delete this task?</Paragraph>
                          <XStack gap="2">
                            <Button
                              theme="red"
                              icon={Trash2}
                              disabled={busy}
                              onPress={() =>
                                void mutate(async () => {
                                  await api.remove(item.id);
                                  setTasks((list) =>
                                    list.filter((task) => task.id !== item.id),
                                  );
                                  setDeleting(null);
                                  setEditing(null);
                                  setDueEditor(null);
                                })
                              }
                            >
                              Delete
                            </Button>
                            <Button onPress={() => setDeleting(null)}>
                              Keep it
                            </Button>
                          </XStack>
                        </YStack>
                      )}
                    </YStack>
                  </TaskEditBoundary>
                )}
              />
            )}
          </YStack>
        </SafeAreaView>
        {dueEditor === "new" && (
          <DueDialog
            due={newDue}
            busy={busy}
            onClose={() => setDueEditor(null)}
            onSave={async (due) => {
              setNewDue(due);
              setDueEditor(null);
            }}
          />
        )}
        {tasks
          .filter((task) => task.id === dueEditor)
          .map((task) => (
            <DueDialog
              key={task.id}
              due={task}
              busy={busy}
              onClose={() => setDueEditor(null)}
              onSave={(due) => saveDue(task, due)}
            />
          ))}
      </YStack>
    </OutsideEditProvider>
  );
}
