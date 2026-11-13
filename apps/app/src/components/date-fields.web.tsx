import { useMemo, useState } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { TimeClock } from "@mui/x-date-pickers/TimeClock";
import dayjs from "dayjs";
import {
  Button,
  getVariableValue,
  Paragraph,
  useTheme,
  useThemeName,
  XStack,
  YStack,
} from "tamagui";
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
  const [view, setView] = useState<"hours" | "minutes">("hours");
  const theme = useTheme();
  const mode = useThemeName().startsWith("dark") ? "dark" : "light";
  const color = getVariableValue(theme.color);
  const background = getVariableValue(theme.background);
  const clockTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: color, contrastText: background },
          background: { default: background, paper: background },
          text: { primary: color },
        },
        typography: { fontFamily: "inherit" },
      }),
    [color, background, mode],
  );
  const selected = dayjs(`2000-01-15T${value}:00`);
  const afternoon = selected.hour() >= 12;
  return (
    <YStack flex={1} minW={0} gap="2" role="group" aria-label={label}>
      <XStack items="center" justify="center" gap="2" flexWrap="wrap">
        <Button
          size="sm"
          theme={view === "hours" ? "inverse" : undefined}
          aria-label="Choose hours"
          aria-pressed={view === "hours"}
          disabled={disabled}
          onPress={() => setView("hours")}
        >
          {selected.format("hh")}
        </Button>
        <Paragraph>:</Paragraph>
        <Button
          size="sm"
          theme={view === "minutes" ? "inverse" : undefined}
          aria-label="Choose minutes"
          aria-pressed={view === "minutes"}
          disabled={disabled}
          onPress={() => setView("minutes")}
        >
          {selected.format("mm")}
        </Button>
        <Button
          size="sm"
          theme={!afternoon ? "inverse" : undefined}
          aria-pressed={!afternoon}
          disabled={disabled}
          onPress={() =>
            onChangeText(selected.hour(selected.hour() % 12).format("HH:mm"))
          }
        >
          AM
        </Button>
        <Button
          size="sm"
          theme={afternoon ? "inverse" : undefined}
          aria-pressed={afternoon}
          disabled={disabled}
          onPress={() =>
            onChangeText(
              selected.hour((selected.hour() % 12) + 12).format("HH:mm"),
            )
          }
        >
          PM
        </Button>
      </XStack>
      <ThemeProvider theme={clockTheme}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <TimeClock
            value={selected}
            view={view}
            views={["hours", "minutes"]}
            onViewChange={(next) => {
              if (next !== "seconds") setView(next);
            }}
            onChange={(time) => {
              if (time?.isValid()) onChangeText(time.format("HH:mm"));
            }}
            ampm
            disabled={disabled}
            showViewSwitcher={false}
            sx={{ width: "100%", "& .MuiClock-root": { margin: "8px 0" } }}
          />
        </LocalizationProvider>
      </ThemeProvider>
    </YStack>
  );
}
