import { useRef, type ComponentRef } from "react";
import { Input, Text, XStack, YStack, type InputProps } from "tamagui";
import type { TextRange } from "@dodo/shared/natural-language";
import { useTitleScroll } from "./title-scroll";

type Props = InputProps & { highlights?: TextRange[]; completed?: boolean };

export function TaskTitleInput({
  highlights = [],
  completed,
  flex,
  minW,
  ...props
}: Props) {
  const ref = useRef<ComponentRef<typeof Input>>(null);
  const scroll = useTitleScroll();
  const value = String(props.value ?? "");
  const decorated = highlights.length > 0;
  const pieces = [];
  let position = 0;
  for (const range of highlights) {
    pieces.push(value.slice(position, range.start));
    pieces.push(
      <Text
        key={range.start}
        textDecorationLine={completed ? "underline line-through" : "underline"}
      >
        {value.slice(range.start, range.end)}
      </Text>,
    );
    position = range.end;
  }
  pieces.push(value.slice(position));
  return (
    <YStack flex={flex} minW={minW} position="relative">
      <Input
        {...props}
        {...scroll.inputProps}
        ref={ref}
        bg="white"
        color={decorated ? "transparent" : "color"}
        caretColor="color"
        cursorColor="color"
        px={0}
        rounded="0 hover:0 focus:0 focus-visible:0"
        borderWidth={0}
        borderBottomWidth={1}
        borderColor="transparent hover:transparent focus:transparent focus-visible:transparent"
        borderBottomColor="transparent focus:border-color-focus focus-visible:border-color-focus"
        outlineWidth="0 focus:0 focus-visible:0"
        outlineStyle="none focus:none focus-visible:none"
        boxShadow="none focus:none focus-visible:none"
        underlineColorAndroid="transparent"
        style={[
          props.style,
          { textDecorationLine: completed ? "line-through" : "none" },
        ]}
        onSubmitEditing={
          props.onSubmitEditing
            ? (event) => {
                props.onSubmitEditing?.(event);
                if (props.blurOnSubmit !== false) ref.current?.blur();
              }
            : undefined
        }
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.key === "Escape") ref.current?.blur();
        }}
      />
      {decorated && (
        <YStack
          position="absolute"
          t={0}
          b={0}
          l={0}
          r={0}
          overflow="hidden"
          pointerEvents="none"
          aria-hidden
        >
          <XStack position="absolute" t={8} l={0} x={-scroll.offset}>
            <Text
              fontFamily="body"
              fontSize="sm"
              lineHeight="sm"
              whiteSpace="pre"
              numberOfLines={1}
              color="color"
              textDecorationLine={completed ? "line-through" : "none"}
            >
              {pieces}
            </Text>
          </XStack>
        </YStack>
      )}
    </YStack>
  );
}
