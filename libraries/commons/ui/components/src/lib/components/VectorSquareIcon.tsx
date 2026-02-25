import type { CSSProperties } from "react";

export type VectorSquareIconProps = {
  fontSize?: number | string;
  className?: string;
  style?: CSSProperties;
};

// Editable clone of the "vector-square" symbol for local UI customization.
export function VectorSquareIcon({
  fontSize = "1em",
  className,
  style,
}: VectorSquareIconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      style={{ display: "block", fontSize, ...style }}
    >
      <rect
        x="3.2"
        y="3.2"
        width="9.6"
        height="9.6"
        rx="0.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle
        cx="3.2"
        cy="3.2"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="12.8"
        cy="3.2"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="3.2"
        cy="12.8"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="12.8"
        cy="12.8"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
