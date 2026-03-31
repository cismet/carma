export type ControlButtonStyleRecord = Record<
  string,
  string | number | undefined
>;

export const readControlButtonStyle = ({
  width = "34px",
  height = "34px",
  fontSize = "18px",
  disabled = false,
  useDisabledStyle = true,
  cursor,
}: {
  width?: string;
  height?: string;
  fontSize?: string;
  disabled?: boolean;
  useDisabledStyle?: boolean;
  cursor?: string;
} = {}): ControlButtonStyleRecord => ({
  backgroundColor: "#fff",
  border: "2px solid rgba(0, 0, 0, .3)",
  borderRadius: "4px",
  width,
  height,
  textAlign: "center",
  cursor: disabled ? "not-allowed" : cursor ?? "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "space-evenly",
  fontSize,
  filter:
    disabled && useDisabledStyle ? "grayscale(100%) brightness(120%)" : "",
});

export const readControlButtonContentStyle = ({
  disabled = false,
}: {
  disabled?: boolean;
} = {}): ControlButtonStyleRecord => ({
  opacity: disabled ? 0.5 : 1,
  height: "auto",
  display: "flex",
  alignItems: "center",
});
