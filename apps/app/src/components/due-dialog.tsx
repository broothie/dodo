import { Dialog, ScrollView, VisuallyHidden } from "tamagui";
import type { Due } from "@dodo/shared";
import { DueEditor } from "./due-editor";
type Props = {
  due: Due;
  busy: boolean;
  onSave: (due: Due) => Promise<void>;
  onClose: () => void;
};
export function DueDialog({ due, busy, onSave, onClose }: Props) {
  return (
    <Dialog
      modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          opacity={0.6}
          onPress={() => {
            if (!busy) onClose();
          }}
        />
        <Dialog.Content w="90%" maxW={480} maxH="90%" gap="3">
          <Dialog.Title asChild>
            <VisuallyHidden>Due date</VisuallyHidden>
          </Dialog.Title>
          <Dialog.Description asChild>
            <VisuallyHidden>
              Choose a date and optionally a time.
            </VisuallyHidden>
          </Dialog.Description>
          <ScrollView keyboardShouldPersistTaps="handled">
            <DueEditor
              due={due}
              busy={busy}
              onSave={onSave}
              onCancel={() => {
                if (!busy) onClose();
              }}
            />
          </ScrollView>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
