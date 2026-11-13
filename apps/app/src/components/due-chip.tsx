import Calendar from "lucide-react-native/icons/calendar";
import Clock from "lucide-react-native/icons/clock";
import { Button } from "tamagui";
import { formatDue, type Due } from "@dodo/shared";

type Props = {
  due: Due;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  editing?: boolean;
  showDate?: boolean;
};

export function DueChip({ due, onPress, label, disabled, editing = false, showDate = true }: Props) {
  const text = formatDue(due, new Date(), { showDate });
  if (!text && !editing) return null;
  return (
    <Button
      size="xs"
      rounded="full"
      aria-label={label}
      icon={due.dueKind === "datetime" || (!showDate && due.dueKind === "date") ? Clock : Calendar}
      disabled={disabled}
      onPress={onPress}
    >
      {text || (due.dueKind === "none" ? "Add date" : "Add time")}
    </Button>
  );
}
