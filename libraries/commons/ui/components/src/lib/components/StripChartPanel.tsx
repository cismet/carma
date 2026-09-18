import { useEffect, useRef, type CSSProperties } from "react";

import {
  createStripChart,
  type StripChart,
  type StripChartRow,
} from "../utils/strip-chart";

export interface StripChartPanelProps {
  rows: readonly StripChartRow[];
  /** Receives the chart once mounted; push columns to it at any frequency. */
  onChart: (chart: StripChart | null) => void;
  rowHeight?: number;
  /** Label refresh interval; the traces themselves draw on every push. */
  labelIntervalMs?: number;
  style?: CSSProperties;
  dataTestId?: string;
}

const labelStyle: CSSProperties = {
  position: "absolute",
  left: 6,
  transform: "translateY(-50%)",
  font: "600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  color: "#0f172a",
  textShadow:
    "0 0 2px rgba(255,255,255,1), 0 0 6px rgba(255,255,255,0.98), 0 0 10px rgba(255,255,255,0.92)",
  pointerEvents: "none",
  whiteSpace: "nowrap",
};

/**
 * Strip chart with a label per row over the canvas; the labels update on an
 * interval, the traces on every push, without React in the loop.
 */
export const StripChartPanel = ({
  rows,
  onChart,
  rowHeight = 18,
  labelIntervalMs = 250,
  style,
  dataTestId = "strip-chart",
}: StripChartPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valueRefs = useRef(new Map<string, HTMLSpanElement>());
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chart = createStripChart({ canvas, rows, rowHeight });
    onChart(chart);
    const resize = () => chart.resize();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    const labels = window.setInterval(() => {
      for (const [id, element] of valueRefs.current)
        element.textContent = chart.formatted(id);
    }, labelIntervalMs);
    return () => {
      window.clearInterval(labels);
      observer?.disconnect();
      chart.destroy();
      onChart(null);
    };
    // Rows are a constant per panel; a new set needs a new panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight, labelIntervalMs]);
  return (
    <div
      data-test-id={dataTestId}
      style={{ position: "relative", width: "100%", ...style }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: rows.length * rowHeight,
        }}
      />
      {rows.map((row, index) => (
        <div
          key={row.id}
          style={{ ...labelStyle, top: (index + 0.5) * rowHeight }}
        >
          <span style={{ color: row.color }}>■</span> {row.label}{" "}
          <span
            data-metric-id={row.id}
            ref={(element) => {
              if (element) valueRefs.current.set(row.id, element);
              else valueRefs.current.delete(row.id);
            }}
          >
            –
          </span>
        </div>
      ))}
    </div>
  );
};
