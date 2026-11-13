import { useRef, type ComponentRef, type RefObject } from "react";
import { Platform } from "react-native";
import { Input, Text, XStack, YStack, type InputProps } from "tamagui";
import type { TextRange } from "@dodo/shared/natural-language";
import { useTitleScroll } from "./title-scroll";
import { isEmptyBackspace } from "../lib/task-keyboard";

type Props = InputProps & {
  highlights?: TextRange[];
  completed?: boolean;
  inputRef?: RefObject<ComponentRef<typeof Input> | null>;
  onEmptyBackspace?: () => void;
};

export function TaskTitleInput({
  highlights = [],
  completed,
  inputRef,
  onEmptyBackspace,
  flex,
  minW,
  ...props
}: Props) {
  const localRef = useRef<ComponentRef<typeof Input>>(null);
  const ref = inputRef ?? localRef;
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
        textDecorationColor="brand-500"
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
        fontSize="lg"
        lineHeight="lg"
        bg="background"
        color={decorated ? "transparent" : "color"}
        caretColor="color"
        cursorColor="color"
        px={0}
        rounded="0 hover:0 focus:0 focus-visible:0"
        borderWidth={0}
        borderColor="transparent hover:transparent focus:transparent focus-visible:transparent"
        outlineWidth="0 focus:0 focus-visible:0"
        outlineStyle="none focus:none focus-visible:none"
        boxShadow="none focus:none focus-visible:none"
        underlineColorAndroid="transparent"
        style={[
          props.style,
          { textDecorationLine: completed ? "line-through" : "none" },
        ]}
        onSubmitEditing={
          Platform.OS !== "web" && props.onSubmitEditing
            ? (event) => {
                props.onSubmitEditing?.(event);
                if (props.blurOnSubmit !== false) ref.current?.blur();
              }
            : undefined
        }
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (Platform.OS === "web" && onEmptyBackspace && !event.defaultPrevented && isEmptyBackspace({
            key: event.key, text: event.currentTarget.value,
            isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode,
            readOnly: props.readOnly, disabled: props.disabled,
          })) {
            event.preventDefault();
            // Suppress repeats' default action too, including beforeinput.
            if (!event.repeat) onEmptyBackspace();
            return;
          }
          if (Platform.OS === "web" && event.key === "Enter" && props.onSubmitEditing && !event.defaultPrevented) {
            // Enter can confirm an IME candidate without submitting the task.
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            event.preventDefault();
            if (event.repeat || props.readOnly || props.disabled) return;
            props.onSubmitEditing({ nativeEvent: { text: event.currentTarget.value } });
            if (props.blurOnSubmit !== false) ref.current?.blur();
          }
          if (event.key === "Escape") ref.current?.blur();
        }}
        onBeforeInput={(event) => {
          props.onBeforeInput?.(event);
          const native = event.nativeEvent as InputEvent;
          if (Platform.OS === "web" && onEmptyBackspace && !event.defaultPrevented &&
            native.inputType === "deleteContentBackward" && isEmptyBackspace({
              key: "Backspace", text: event.currentTarget.value, isComposing: native.isComposing,
              readOnly: props.readOnly, disabled: props.disabled,
            })) {
            event.preventDefault();
            onEmptyBackspace();
          }
        }}
        onKeyPress={(event) => {
          props.onKeyPress?.(event);
          if (Platform.OS !== "web" && onEmptyBackspace && isEmptyBackspace({
            key: event.nativeEvent.key, text: value, readOnly: props.readOnly, disabled: props.disabled,
          })) onEmptyBackspace();
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
              fontSize="lg"
              lineHeight="lg"
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
