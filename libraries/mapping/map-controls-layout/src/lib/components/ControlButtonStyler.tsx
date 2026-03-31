import { CSSProperties, forwardRef, ReactNode } from "react";
import {
  readControlButtonContentStyle,
  readControlButtonStyle,
} from "./control-button-styles";

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

const ControlButtonStyler = forwardRef<Ref, ControlButtonStylerProps>(
  (
    {
      children,
      width = "34px",
      height = "34px",
      fontSize = "18px",
      disabled,
      dataTestId = "",
      useDisabledStyle = true,
      ...props
    },
    ref
  ) => {
    const iconPadding = readControlButtonStyle({
      width,
      height,
      fontSize,
      disabled,
      useDisabledStyle,
    }) as CSSProperties;

    return (
      <button
        data-test-id={dataTestId}
        {...props}
        disabled={disabled}
        style={iconPadding}
        ref={ref}
      >
        <div
          style={readControlButtonContentStyle({ disabled }) as CSSProperties}
        >
          {children}
        </div>
      </button>
    );
  }
);

export default ControlButtonStyler;
