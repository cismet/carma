import React from "react";
import { createPlugin, useInputContext, LevaInputProps } from "leva/plugin";

// Type definitions
type ButtonRowSettings = Record<string, never>; // No settings needed
type ButtonRowValue = Record<string, () => void>;
type ButtonRowInput = ButtonRowValue;

type ButtonRowProps = LevaInputProps<
  ButtonRowValue,
  ButtonRowSettings,
  ButtonRowValue
>;

// Component that renders the horizontal button row
function HorizontalButtonRowComponent() {
  const props = useInputContext<ButtonRowProps>();
  const { value } = props;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Object.keys(value).length}, 1fr)`,
        gap: "4px",
        width: "100%",
        padding: "0",
      }}
    >
      {Object.entries(value).map(([label, onClick]) => (
        <button
          key={label}
          onClick={onClick}
          style={{
            padding: "8px 4px",
            fontSize: "12px",
            fontWeight: 500,
            backgroundColor: "rgb(37, 99, 235)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            minHeight: "32px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgb(29, 78, 216)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgb(37, 99, 235)";
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Plugin configuration
const normalize = (input: ButtonRowInput) => {
  return {
    value: input,
    settings: {},
  };
};

const sanitize = (value: ButtonRowValue): ButtonRowValue => {
  // Ensure all values are functions
  const sanitized: ButtonRowValue = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "function") {
      sanitized[key] = val;
    }
  }
  return sanitized;
};

const format = (value: ButtonRowValue): ButtonRowValue => {
  return value;
};

// Create and export the plugin
export const horizontalButtonRow = createPlugin({
  normalize,
  sanitize,
  format,
  component: HorizontalButtonRowComponent,
});
