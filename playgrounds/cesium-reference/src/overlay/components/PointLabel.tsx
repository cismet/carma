import React from "react";

interface PointLabelProps {
  text: string;
  selected?: boolean;
  fontSize?: number;
}

// Stable style objects created outside render to prevent recalculation
const baseStyles: React.CSSProperties = {
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  color: "white",
  fontSize: "12px",
  padding: "4px 6px",
  borderRadius: "3px",
  fontFamily: "Arial, sans-serif",
  fontWeight: "bold",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
};

const selectedStyles: React.CSSProperties = {
  backgroundColor: "rgba(24, 144, 255, 0.9)",
  border: "2px solid #1890ff",
};

// Memoized PointLabel component to prevent unnecessary rerenders
export const PointLabel: React.FC<PointLabelProps> = React.memo(
  ({ text, selected = false, fontSize = 12 }) => (
    <div
      style={{
        ...baseStyles,
        ...(selected ? selectedStyles : {}),
        fontSize,
      }}
    >
      {text}
    </div>
  )
);

export default PointLabel;