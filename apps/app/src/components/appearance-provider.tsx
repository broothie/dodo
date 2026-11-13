import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useColorScheme } from "react-native";
import { TamaguiProvider } from "tamagui";
import { tamaguiConfig } from "../../tamagui.config";
import { readAppearance, writeAppearance } from "../lib/appearance-storage";
import { ThemeSync } from "./theme-sync";

export type AppearancePreference = "device" | "light" | "dark";
const AppearanceContext = createContext<{
  preference: AppearancePreference;
  scheme: "light" | "dark";
  setPreference: (value: AppearancePreference) => void;
  ready: boolean;
  error: string;
} | null>(null);

export function AppearanceProvider({ children }: PropsWithChildren) {
  const deviceScheme = useColorScheme();
  const [preference, updatePreference] = useState<AppearancePreference>("device");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    readAppearance().then(value => {
      if (active && (value === "light" || value === "dark" || value === "device")) updatePreference(value);
    }).catch(() => {
      // Storage may be unavailable; keep following the device for this session.
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  function setPreference(value: AppearancePreference) {
    updatePreference(value);
    setError("");
    // Keep rapid changes in order on native's asynchronous storage.
    writes.current = writes.current.then(() => writeAppearance(value)).catch(() => {
      setError("Could not save your appearance preference on this device.");
    });
  }
  const scheme = preference === "device" ? deviceScheme ?? "light" : preference;
  return (
    <AppearanceContext.Provider value={{ preference, scheme, setPreference, ready, error }}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={scheme}>
        <ThemeSync preference={preference} scheme={scheme} />
        {children}
      </TamaguiProvider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const appearance = useContext(AppearanceContext);
  if (!appearance) throw new Error("useAppearance requires AppearanceProvider");
  return appearance;
}
