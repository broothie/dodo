import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  type PropsWithChildren,
  type ComponentRef,
  type RefObject,
} from "react";
import { View } from "react-native";
type Entry = {
  ref: RefObject<ComponentRef<typeof View> | null>;
  onOutside: () => void;
};
const Registry = createContext<(id: string, entry: Entry) => () => void>(
  () => () => {},
);
export function OutsideEditProvider({ children }: PropsWithChildren) {
  const entries = useRef(new Map<string, Entry>());
  const register = useCallback((id: string, entry: Entry) => {
    entries.current.set(id, entry);
    return () => {
      entries.current.delete(id);
    };
  }, []);
  return (
    <Registry.Provider value={register}>
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={(event) => {
          const { pageX, pageY } = event.nativeEvent;
          for (const { ref, onOutside } of entries.current.values()) {
            ref.current?.measure((_x, _y, width, height, left, top) => {
              if (
                pageX < left ||
                pageX > left + width ||
                pageY < top ||
                pageY > top + height
              )
                onOutside();
            });
          }
          return false;
        }}
      >
        {children}
      </View>
    </Registry.Provider>
  );
}
export function TaskEditBoundary({
  active,
  onOutside,
  children,
}: PropsWithChildren<{ active: boolean; onOutside: () => void }>) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const id = useId();
  const register = useContext(Registry);
  useEffect(() => {
    if (active) return register(id, { ref, onOutside });
  }, [active, id, onOutside, register]);
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}
