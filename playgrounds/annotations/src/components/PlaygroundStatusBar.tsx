import type { ReactNode } from "react";

import type { PlaygroundRuntime } from "../playground.types";

type PlaygroundStatusBarProps = {
  runtimeVersion: PlaygroundRuntime;
  onRuntimeVersionChange: (runtimeVersion: PlaygroundRuntime) => void;
  label?: ReactNode;
  values?: readonly ReactNode[];
};

const barStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1500,
  padding: 0,
  pointerEvents: "none",
} as const;

const shellStyle = {
  width: "100%",
  minHeight: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "2px 14px",
  boxSizing: "border-box",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  background: "rgba(255, 255, 255, 0.44)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
  color: "#4b5563",
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 11,
  lineHeight: 1.05,
  pointerEvents: "auto",
} as const;

const labelStyle = {
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#6b7280",
  whiteSpace: "nowrap",
} as const;

const toggleButtonStyle = (active: boolean) => ({
  border: "none",
  padding: 0,
  background: "transparent",
  color: active ? "#0f172a" : "#2563eb",
  cursor: active ? "default" : "pointer",
  font: "inherit",
  fontWeight: active ? 700 : 600,
  textDecoration: active ? "none" : "underline",
});

export const PlaygroundStatusBar = ({
  runtimeVersion,
  onRuntimeVersionChange,
  label,
  values = [],
}: PlaygroundStatusBarProps) => (
  <div style={barStyle}>
    <div style={shellStyle} role="status" aria-live="polite">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
          overflowX: "auto",
          scrollbarWidth: "none",
          whiteSpace: "nowrap",
        }}
      >
        {label ? <span style={labelStyle}>{label}</span> : null}
        {values.map((value, index) => (
          <span
            key={`playground-status-value-${index}`}
            style={{ fontWeight: 500, color: "#374151" }}
          >
            {value}
          </span>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
          color: "#6b7280",
        }}
      >
        <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>
          runtime
        </span>
        <button
          type="button"
          style={toggleButtonStyle(runtimeVersion === "v1")}
          onClick={() => onRuntimeVersionChange("v1")}
          aria-current={runtimeVersion === "v1" ? "page" : undefined}
          disabled={runtimeVersion === "v1"}
        >
          v1
        </button>
        <span>•</span>
        <button
          type="button"
          style={toggleButtonStyle(runtimeVersion === "v2")}
          onClick={() => onRuntimeVersionChange("v2")}
          aria-current={runtimeVersion === "v2" ? "page" : undefined}
          disabled={runtimeVersion === "v2"}
        >
          v2
        </button>
      </div>
    </div>
  </div>
);
