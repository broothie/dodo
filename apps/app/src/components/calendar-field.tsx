import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Calendar } from "react-native-calendars";
import { getVariableValue, useTheme, YStack } from "tamagui";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  disabled?: boolean;
};

export function DateField({ value, onChangeText, disabled }: Props) {
  const theme = useTheme();
  const color = getVariableValue(theme.color);
  const background = getVariableValue(theme.background);
  return (
    <YStack
      pointerEvents={disabled ? "none" : "auto"}
      opacity={disabled ? 0.5 : 1}
    >
      <Calendar
        initialDate={value}
        hideExtraDays
        onDayPress={({ dateString }) => onChangeText(dateString)}
        markedDates={{ [value]: { selected: true } }}
        theme={{
          calendarBackground: background,
          dayTextColor: color,
          monthTextColor: color,
          todayTextColor: color,
          selectedDayBackgroundColor: color,
          selectedDayTextColor: background,
        }}
        renderArrow={(direction) =>
          direction === "left" ? (
            <ChevronLeft size={20} color={color} />
          ) : (
            <ChevronRight size={20} color={color} />
          )
        }
      />
    </YStack>
  );
}
