import type { CSSProperties } from "react";

export type VectorPolylineIconProps = {
  fontSize?: number | string;
  className?: string;
  style?: CSSProperties;
};

// Editable 3-segment polyline icon using the same node style as vector-square.
export function VectorPolylineIcon({
  fontSize = "1em",
  className,
  style,
}: VectorPolylineIconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      style={{ display: "block", fontSize, ...style }}
    >
      <path
        d="M2.4 11.8 L6.2 4.8 L10.1 9.5 L13.6 3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
      <circle
        cx="2.4"
        cy="11.8"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="6.2"
        cy="4.8"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="10.1"
        cy="9.5"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="13.6"
        cy="3.8"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
