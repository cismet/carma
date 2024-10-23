import { CSSProperties, forwardRef, ReactNode } from "react";

interface ControlButtonStylerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  width?: string;
  height?: string;
  fontSize?: string;
  disabled?: boolean;
}

type Ref = HTMLButtonElement;

const ControlButtonStyler = forwardRef<Ref, ControlButtonStylerProps>(
  (
    { children, width = "34px", height = "34px", fontSize = "18px", disabled, ...props },
    ref,
  ) => {
    const iconPadding = {
      backgroundColor: "#fff",
      border: "2px solid rgba(0, 0, 0, .3)",
      borderRadius: "4px",
      width,
      height,
      textAlign: "center",
      cursor: disabled ? "not-allowed" : "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-evenly",
      fontSize,
      filter: disabled ? "grayscale(100%) brightness(120%)" : "",
      // fontWeight: 700,
    } as CSSProperties;
    return (
      <button {...props} disabled={disabled} style={iconPadding} ref={ref}>
        <div style={{ opacity: disabled ? 0.5 : 1 }}>
          {children}
        </div>
      </button>
    );
  },
);

export default ControlButtonStyler;
