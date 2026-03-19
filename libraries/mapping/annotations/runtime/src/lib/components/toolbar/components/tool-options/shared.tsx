import type { ReactNode } from "react";
import { pointManualStyle } from "../../shared";

export const renderHelpContent = (lines: readonly string[]): ReactNode => (
  <div style={pointManualStyle}>
    {lines.map((line) => (
      <span key={line}>{line}</span>
    ))}
  </div>
);
