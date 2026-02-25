import type { CSSProperties } from "react";

export type VectorTrapezoidIconProps = {
  fontSize?: number | string;
  className?: string;
  style?: CSSProperties;
};

// Editable "vector-square" style variant for roof modeling (trapezoid shape).
export function VectorTrapezoidIcon({
  fontSize = "1em",
  className,
  style,
}: VectorTrapezoidIconProps) {
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
        d="M6 5 L10 5 L14 10 L2 10 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle
        cx="6"
        cy="5"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="10"
        cy="5"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="2"
        cy="10"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="14.0"
        cy="10"
        r="0.9"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
