import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import Clock from "lucide-react-native/icons/clock";
import { useState } from "react";
import { Platform } from "react-native";
import { Button } from "tamagui";
export { DateField } from "./calendar-field";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  "aria-label": string;
  disabled?: boolean;
};

export function TimeField({
  value,
  onChangeText,
  disabled,
  "aria-label": label,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hours, minutes] = value.split(":").map(Number);
  const selected = new Date(2000, 0, 15, hours, minutes);
  const picker = (
    <DateTimePicker
      mode="time"
      value={selected}
      disabled={disabled}
      display={Platform.OS === "ios" ? "compact" : "default"}
      presentation="dialog"
      onDismiss={() => setOpen(false)}
      onValueChange={(_, date) => {
        setOpen(false);
        const pad = (number: number) => String(number).padStart(2, "0");
        onChangeText(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
      }}
    />
  );
  if (Platform.OS === "ios") return picker;
  return (
    <>
      <Button
        aria-label={label}
        disabled={disabled}
        icon={Clock}
        onPress={() => setOpen(true)}
      >
        {selected.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}
      </Button>
      {open && picker}
    </>
  );
}
