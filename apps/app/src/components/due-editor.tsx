import { useState } from "react";
import Clock from "lucide-react-native/icons/clock";
import X from "lucide-react-native/icons/x";
import { Button, Label, Paragraph, XStack, YStack } from "tamagui";
import { dueFromLocal, localParts, noDue, type Due } from "@dodo/shared";
import { DateField, TimeField } from "./date-fields";

type Props = {
  due: Due;
  busy?: boolean;
  onSave: (due: Due) => Promise<void>;
  onCancel: () => void;
};
export function DueEditor({ due, busy, onSave, onCancel }: Props) {
  const [zone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [initial] = useState(() =>
    localParts(due.dueKind === "datetime" ? { ...due, timeZone: zone } : due),
  );
  const [date, setDate] = useState(
    () => initial.date || currentParts(initial.timeZone).date,
  );
  const [time, setTime] = useState(initial.time);
  const [error, setError] = useState("");
  function currentParts(timeZone: string) {
    return localParts({
      dueKind: "datetime",
      dueAt: new Date().toISOString(),
      timeZone,
    });
  }
  async function save(clear = false) {
    try {
      const unchanged =
        date === initial.date &&
        time === initial.time &&
        zone === initial.timeZone;
      const saved = clear
        ? noDue
        : unchanged && due.dueKind === "datetime"
          ? { ...due, timeZone: zone }
          : unchanged
            ? due
            : dueFromLocal(date, time, zone);
      await onSave(saved);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save due date.",
      );
    }
  }
  return (
    <YStack gap="2" py="2">
      <YStack gap="2">
        <DateField value={date} onChangeText={setDate} disabled={busy} />
      </YStack>
      {time === "" ? (
        <Button
          size="sm"
          rounded="full"
          self="flex-start"
          icon={Clock}
          disabled={busy}
          onPress={() => setTime(currentParts(zone).time)}
        >
          Add time
        </Button>
      ) : (
        <YStack gap="2">
          <Label>Time</Label>
          <XStack gap="2" items="flex-start">
            <TimeField
              aria-label="Due time"
              value={time}
              onChangeText={setTime}
              disabled={busy}
            />
            <Button
              size="sm"
              rounded="full"
              aria-label="Remove time"
              icon={X}
              disabled={busy}
              onPress={() => setTime("")}
            />
          </XStack>
        </YStack>
      )}
      {!!error && (
        <Paragraph theme="red" role="alert">
          {error}
        </Paragraph>
      )}
      <XStack gap="2" flexWrap="wrap" justify="flex-end" pt="2">
        <Button disabled={busy} onPress={onCancel}>
          Cancel
        </Button>
        <Button theme="red" disabled={busy} onPress={() => void save(true)}>
          Clear
        </Button>
        <Button theme="green" disabled={busy} onPress={() => void save()}>
          Save
        </Button>
      </XStack>
    </YStack>
  );
}
