import { animations } from "@tamagui/config/animations-css";
import { defaultConfig } from "@tamagui/config/v6";
import { createTamagui } from "tamagui";

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
});
export default tamaguiConfig;
type AppConfig = typeof tamaguiConfig;
declare module "tamagui" {
  interface TamaguiCustomConfig extends AppConfig {}
}
