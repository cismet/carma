import { CSSProperties, forwardRef, ReactNode } from "react";
import { DEFAULT_CONTROL_STYLE_OPTIONS } from "./control-styles";

interface ControlButtonStylerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  width?: string;
  height?: string;
  fontSize?: string;
  disabled?: boolean;
  dataTestId?: string;
  useDisabledStyle?: boolean;
}

type Ref = HTMLButtonElement;
const { button } = DEFAULT_CONTROL_STYLE_OPTIONS;

const ControlButtonStyler = forwardRef<Ref, ControlButtonStylerProps>(
  (
    {
      children,
      width,
      height,
      fontSize,
      disabled,
      dataTestId = "",
      useDisabledStyle,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled === true;
    const buttonState = isDisabled ? button.disabled : button.enabled;
    const useVisualFilter =
      isDisabled && (useDisabledStyle ?? buttonState.useVisualFilter);
    const buttonStyle = {
      ...button.root,
      width: width ?? button.root.width,
      height: height ?? button.root.height,
      cursor: buttonState.cursor,
      fontSize: fontSize ?? button.root.fontSize,
      filter: useVisualFilter
        ? buttonState.visualFilter
        : button.enabled.visualFilter,
    } as CSSProperties;

    return (
      <button
        data-test-id={dataTestId}
        {...props}
        disabled={disabled}
        style={buttonStyle}
        ref={ref}
      >
        <div
          style={
            {
              ...button.content,
              opacity: buttonState.contentOpacity,
            } as CSSProperties
          }
        >
          {children}
        </div>
      </button>
    );
  }
);

export default ControlButtonStyler;
