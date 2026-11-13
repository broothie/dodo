import { useEffect } from "react";
import Head from "expo-router/head";
import { getVariableValue, useTheme } from "tamagui";
import type { ThemeSyncProps } from "./theme-sync";

export function ThemeSync({ scheme }: ThemeSyncProps) {
  const theme = useTheme();
  const background = getVariableValue(theme.background);
  useEffect(() => {
    document.documentElement.style.colorScheme = scheme;
    document.documentElement.style.backgroundColor = background;
    document.body.style.backgroundColor = background;
  }, [scheme, background]);
  return <Head><meta name="theme-color" content={background} /></Head>;
}
