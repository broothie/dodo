import { useRef, type ComponentRef } from "react";
import { Input, type InputProps } from "tamagui";

export function TaskTitleInput(props: InputProps) {
  const ref = useRef<ComponentRef<typeof Input>>(null);
  return (
    <Input
      {...props}
      ref={ref}
      bg="white"
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
  );
}
