import type { MutableRefObject } from "react";
import { formatTileResidentBytes } from "@carma-mapping/engines/maplibre";
import type { VolumeTileLegend } from "./core/volume-tile-legend";

type Position = { left: number; top: number };
type Drag = Position & { x: number; y: number };

export const VolumeTileLegendView = ({
  legend,
  legendAt,
  legendDrag,
  setLegendAt,
}: {
  legend: VolumeTileLegend;
  legendAt: Position;
  legendDrag: MutableRefObject<Drag | null>;
  setLegendAt: (position: Position) => void;
}) => (
  <details
    className="tile-debug-legend"
    data-test-id="volume-tile-diagnostics-legend"
    style={{
      position: "absolute",
      left: legendAt.left,
      top: legendAt.top,
      maxHeight: "70%",
      overflow: "auto",
      background: "rgb(12 18 32 / 92%)",
      color: "#f4fbff",
      font: "11px/1.5 system-ui, sans-serif",
      padding: "2px 6px",
      borderRadius: 3,
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
    }}
  >
    <summary
      // Drag it out of the way: the panel is small and the cut is the
      // thing being read.
      style={{ cursor: "grab", opacity: 0.85, touchAction: "none" }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const box = event.currentTarget.parentElement as HTMLElement | null;
        if (!box) return;
        legendDrag.current = {
          x: event.clientX,
          y: event.clientY,
          left: box.offsetLeft,
          top: box.offsetTop,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = legendDrag.current;
        if (!drag) return;
        event.preventDefault();
        setLegendAt({
          left: Math.max(0, drag.left + event.clientX - drag.x),
          top: Math.max(0, drag.top + event.clientY - drag.y),
        });
      }}
      onLostPointerCapture={() => {
        legendDrag.current = null;
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      Legende
    </summary>
    <div style={{ opacity: 0.85, marginBottom: 2 }}>
      {`Ring = Median ${Math.round(
        legend.medianMs
      )} ms \u00b7 Flache der Scheibe = Ladezeit dagegen`}
    </div>
    {legend.steps.map((step) => (
      <div
        key={step.label}
        style={{ display: "flex", alignItems: "center", gap: 4 }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: step.color,
            flex: "0 0 auto",
          }}
        />
        <span style={{ flex: "1 1 auto" }}>{step.label}</span>
        <span style={{ opacity: 0.85 }}>
          {`\u00f8 ${Math.round(step.avg)} ms (${Math.round(
            step.min
          )}\u2013${Math.round(step.max)})`}
        </span>
      </div>
    ))}
    {legend.bytes ? (
      <div style={{ opacity: 0.85, marginTop: 2 }}>
        {`1 Kastchen = ${formatTileResidentBytes(
          legend.bytes.unit
        )} \u00b7 residente Cache-Groesse der Kacheln ${formatTileResidentBytes(
          legend.bytes.min
        )}\u2013${formatTileResidentBytes(legend.bytes.max)}`}
      </div>
    ) : null}
  </details>
);
