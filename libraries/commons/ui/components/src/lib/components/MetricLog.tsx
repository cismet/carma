import { useEffect, useRef, type CSSProperties } from "react";

import {
  useMetricRecorder,
  type MetricRecorder,
} from "../hooks/useMetricRecorder";

export interface MetricLogProps {
  recorder: MetricRecorder;
  style?: CSSProperties;
  dataTestId?: string;
}

export const formatElapsed = (milliseconds: number): string => {
  const tenths = Math.round(milliseconds / 100);
  const minutes = Math.floor(tenths / 600);
  return `${minutes}:${((tenths % 600) / 10).toFixed(1).padStart(4, "0")}`;
};

/** Scrolling list of the recorder's update log, newest at the bottom, following unless scrolled up. */
export const MetricLog = ({
  recorder,
  style,
  dataTestId = "metric-log",
}: MetricLogProps) => {
  useMetricRecorder(recorder);
  const list = useRef<HTMLDivElement>(null);
  const entries = recorder.entries();
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom < 40) element.scrollTop = element.scrollHeight;
  }, [entries.length]);
  return (
    <div
      ref={list}
      data-test-id={dataTestId}
      style={{
        overflowY: "auto",
        font: "11px/1.35 monospace",
        whiteSpace: "pre-wrap",
        ...style,
      }}
    >
      {entries.map((entry, index) => (
        <div key={`${entry.at}-${index}`}>
          <span style={{ color: "#777" }}>{formatElapsed(entry.at)}</span>{" "}
          {entry.message}
        </div>
      ))}
    </div>
  );
};
