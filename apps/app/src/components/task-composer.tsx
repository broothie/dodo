import type { ComponentRef, RefObject } from "react";
import { Checkbox, Input, XStack, YStack } from "tamagui";
import type { ParsedTaskText } from "@dodo/shared/natural-language";
import { DueChip } from "./due-chip";
import { TaskEditBoundary } from "./task-edit-boundary";
import { TaskTitleInput } from "./task-title-input";

export type TaskComposerProps = {
  inputRef: RefObject<ComponentRef<typeof Input> | null>;
  title: string;
  parsed: ParsedTaskText;
  busy: boolean;
  dueEditorOpen: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChangeTitle: (title: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onEmptyBackspace: () => void;
  onEditDue: () => void;
};

export function TaskComposer(props: TaskComposerProps) {
  return (
    <TaskEditBoundary active={!props.dueEditorOpen} onOutside={props.onClose}>
      <YStack bg="background">
        <XStack items="center" gap="3" pt="1" pb="0">
          <Checkbox disabled aria-hidden />
          <TaskTitleInput
            inputRef={props.inputRef}
            aria-label="New task"
            placeholder="New task"
            autoFocus
            autoFocusNative
            readOnly={props.busy}
            highlights={props.parsed.matches}
            onFocus={props.onFocus}
            onBlur={props.onBlur}
            maxLength={300}
            value={props.title}
            onChangeText={props.onChangeTitle}
            onSubmitEditing={props.onSubmit}
            onEmptyBackspace={props.onEmptyBackspace}
            onKeyDown={(event) => { if (event.key === "Escape") props.onClose(); }}
            enterKeyHint="enter"
            returnKeyType="default"
            submitBehavior="submit"
            blurOnSubmit={false}
            flex={1}
            minW={0}
          />
        </XStack>
        <XStack pb="2" pl="9">
          <DueChip due={props.parsed.due} label="Set new task due date" editing disabled={props.busy} onPress={props.onEditDue} />
        </XStack>
      </YStack>
    </TaskEditBoundary>
  );
}
