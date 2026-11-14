import { Paragraph } from "tamagui";

export function CountChip({ count, small = false }: { count: number; small?: boolean }) {
  return (
    <Paragraph
      bg="color-2"
      rounded="full"
      px={small ? "1.5" : "2"}
      py={small ? "0.5" : "1"}
      minW={small ? 20 : 28}
      text="center"
      fontSize={small ? "xs" : "sm"}
      lineHeight={small ? "xs" : "sm"}
    >
      {count}
    </Paragraph>
  );
}
