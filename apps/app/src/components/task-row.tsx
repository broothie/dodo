import type { ComponentRef, RefObject } from "react";
import { Button, Checkbox, getVariableValue, Input, useTheme, XStack, YStack } from "tamagui";
import Check from "lucide-react-native/icons/check";
import Trash2 from "lucide-react-native/icons/trash-2";
import type { Task } from "@dodo/shared";
import type { ParsedTaskText } from "@dodo/shared/natural-language";
import { DueChip } from "./due-chip";
import { TaskEditBoundary } from "./task-edit-boundary";
import { TaskTitleInput } from "./task-title-input";

export type TaskRowProps = {
  task: Task;
  inputRef: RefObject<ComponentRef<typeof Input> | null>;
  edit: (ParsedTaskText & { text: string }) | null;
  busy: boolean;
  dueEditorOpen: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChangeTitle: (title: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onFinish: () => void;
  onRemove: (moveFocus?: boolean) => void;
  onToggle: (completed: boolean) => void;
  onEditDue: () => void;
};

function CompletionIcon() {
  const theme = useTheme();
  return <Check size={16} color={getVariableValue(theme.color)} />;
}

export function TaskRow({ task, edit, ...props }: TaskRowProps) {
  return (
    <TaskEditBoundary active={!!edit && !props.dueEditorOpen} onOutside={props.onFinish}>
      <YStack bg="background">
        <XStack items="center" gap="3" pt="1" pb="0">
          <Checkbox
            aria-label={`Complete ${task.title}`}
            checked={task.completedAt !== null}
            disabled={props.busy}
            onCheckedChange={(checked) => props.onToggle(checked === true)}
          >
            <Checkbox.Indicator><CompletionIcon /></Checkbox.Indicator>
          </Checkbox>
          <TaskTitleInput
            inputRef={props.inputRef}
            aria-label={`Task title: ${task.title}`}
            readOnly={props.busy}
            maxLength={300}
            highlights={edit?.matches ?? []}
            completed={task.completedAt !== null}
            value={edit?.text ?? task.title}
            onFocus={props.onFocus}
            onBlur={props.onBlur}
            onChangeText={props.onChangeTitle}
            flex={1}
            minW={0}
            onKeyDown={(event) => { if (event.key === "Escape") props.onCancel(); }}
            onSubmitEditing={props.onSubmit}
            onEmptyBackspace={() => props.onRemove(true)}
            blurOnSubmit={false}
            submitBehavior="submit"
            enterKeyHint="enter"
          />
        </XStack>
        {edit ? (
          <YStack gap="2" pb="2" pl="9">
            <XStack gap="2" flexWrap="wrap">
              <DueChip due={edit.due} label={`Set due date for ${task.title}`} showDate={false} editing disabled={props.busy} onPress={props.onEditDue} />
              <Button size="xs" rounded="full" aria-label={`Delete ${task.title}`} icon={Trash2} disabled={props.busy} onPress={() => props.onRemove()}>
                Delete
              </Button>
            </XStack>
          </YStack>
        ) : task.dueKind === "datetime" ? (
          <XStack pb="2" pl="9">
            <DueChip due={task} label={`Set due date for ${task.title}`} showDate={false} disabled={props.busy} onPress={props.onEditDue} />
          </XStack>
        ) : null}
      </YStack>
    </TaskEditBoundary>
  );
}
