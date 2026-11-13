import { Image } from "react-native";
import { H2, XStack } from "tamagui";

export function Logo({ size = 40, decorative = false }: { size?: number; decorative?: boolean }) {
  return <Image
    source={require("../../assets/wordmark-icon.png")}
    style={{ width: size, height: size, borderRadius: 8 }}
    resizeMode="contain"
    accessible={!decorative}
    accessibilityLabel={decorative ? undefined : "Dodo logo"}
  />;
}

export function Brand() {
  return <XStack items="center" gap="2">
    <Logo decorative />
    <H2>Dodo</H2>
  </XStack>;
}
