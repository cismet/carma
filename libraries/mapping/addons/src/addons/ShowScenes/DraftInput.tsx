import { useState, type ComponentProps } from "react";

import { Input, Slider, type SliderSingleProps } from "antd";

/**
 * The panel reaches the screen through `Control`, which hands its content to
 * the layout one render late. A field bound straight to the draft is set back
 * to the previous value after every key, and fast typing loses letters. These
 * fields keep what is typed in their own state while they have the focus, and
 * show the draft's value again once they lose it.
 */
const useTypedText = (value: string, onValue: (value: string) => void) => {
  const [typed, setTyped] = useState<string | null>(null);
  return {
    value: typed ?? value,
    onFocus: () => setTyped(value),
    onChange: (event: { target: { value: string } }) => {
      setTyped(event.target.value);
      onValue(event.target.value);
    },
    onBlur: () => setTyped(null),
  };
};

type Bound = "value" | "onChange" | "onFocus" | "onBlur";
type TextProps = { value: string; onValue: (value: string) => void };

export const DraftInput = ({
  value,
  onValue,
  ...rest
}: Omit<ComponentProps<typeof Input>, Bound> & TextProps) => {
  const field = useTypedText(value, onValue);
  return <Input {...rest} {...field} />;
};

export const DraftTextArea = ({
  value,
  onValue,
  ...rest
}: Omit<ComponentProps<typeof Input.TextArea>, Bound> & TextProps) => {
  const field = useTypedText(value, onValue);
  return <Input.TextArea {...rest} {...field} />;
};

/**
 * A slider that commits when it is let go. Bound straight to the draft it
 * would jump back under the thumb while it is dragged, for the same reason
 * the fields above keep what is typed.
 */
export const DraftSlider = ({
  value,
  onValue,
  ...rest
}: Pick<
  SliderSingleProps,
  "min" | "max" | "step" | "tooltip" | "className" | "disabled"
> & { value: number; onValue: (value: number) => void }) => {
  const [dragged, setDragged] = useState<number | null>(null);
  return (
    <Slider
      {...rest}
      value={dragged ?? value}
      onChange={(next: number) => setDragged(next)}
      onChangeComplete={(next: number) => {
        setDragged(null);
        onValue(next);
      }}
    />
  );
};
