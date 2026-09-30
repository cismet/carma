import { useEffect, useState } from "react";
import type { TileDiagnosticLegendEntry } from "@carma-mapping/engines/maplibre";

/** Symbols are samples of the primitives the overview worker actually drew. */
const LegendSymbol = ({
  primitives,
}: Pick<TileDiagnosticLegendEntry, "primitives">) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    {Array.from({ length: primitives.length / 16 }, (_, index) => {
      const offset = index * 16;
      const [x, y, rx, ry, kind, stroke, count, progress] = primitives.slice(
        offset,
        offset + 8
      );
      const color = (start: number) => {
        const [r, g, b, a] = primitives.slice(
          offset + start,
          offset + start + 4
        );
        // Small swatches keep the emitted hue readable even for faded ancestors.
        const alpha = start === 8 && a > 0 ? Math.max(0.8, a) : a;
        return `rgba(${r * 255},${g * 255},${b * 255},${alpha})`;
      };
      const style = { stroke: color(8), strokeWidth: stroke, fill: color(12) };
      if (kind === 3)
        return <line key={index} x1={x} y1={y} x2={rx} y2={ry} {...style} />;
      if (kind === 5) {
        const length = Math.max(Math.hypot(rx - x, ry - y), Number.EPSILON);
        const nx = -(ry - y) / length,
          ny = (rx - x) / length;
        return (
          <polygon
            key={index}
            points={`${x + (nx * count) / 2},${y + (ny * count) / 2} ${
              rx + (nx * progress) / 2
            },${ry + (ny * progress) / 2} ${rx - (nx * progress) / 2},${
              ry - (ny * progress) / 2
            } ${x - (nx * count) / 2},${y - (ny * count) / 2}`}
            fill={color(8)}
          />
        );
      }
      if (kind === 4)
        return (
          <ellipse key={index} cx={x} cy={y} rx={rx} ry={ry} fill={color(8)} />
        );
      if (kind === 7)
        return (
          <polygon
            key={index}
            points={`${x + count * rx},${y + progress * ry} ${
              x - count * rx * 0.5 - progress * rx * 0.75
            },${y - progress * ry * 0.5 + count * ry * 0.75} ${
              x - count * rx * 0.5 + progress * rx * 0.75
            },${y - progress * ry * 0.5 - count * ry * 0.75}`}
            fill={color(8)}
          />
        );
      if (kind === 6) {
        const start = count * 2 * Math.PI - Math.PI / 2;
        const end = progress * 2 * Math.PI - Math.PI / 2;
        return progress - count >= 1 ? (
          <ellipse key={index} cx={x} cy={y} rx={rx} ry={ry} fill={color(8)} />
        ) : (
          <path
            key={index}
            d={`M${x},${y}L${x + rx * Math.cos(start)},${
              y + ry * Math.sin(start)
            }A${rx},${ry} 0 ${Number(progress - count > 0.5)},1 ${
              x + rx * Math.cos(end)
            },${y + ry * Math.sin(end)}Z`}
            fill={color(8)}
          />
        );
      }
      return (
        <g key={index}>
          {Array.from(
            { length: kind === 0 ? 1 : Math.min(2, Math.ceil(count)) },
            (_, contour) => {
              const factor = 1 - contour / 2;
              return kind === 1 ? (
                <ellipse
                  key={contour}
                  cx={x}
                  cy={y}
                  rx={rx * factor}
                  ry={ry * factor}
                  {...style}
                />
              ) : (
                <rect
                  key={contour}
                  x={x - rx * factor}
                  y={y - ry * factor}
                  width={rx * factor * 2}
                  height={ry * factor * 2}
                  {...style}
                />
              );
            }
          )}
        </g>
      );
    })}
  </svg>
);

export const TileLoadingDebugLegend = ({
  subscribeLegend,
}: {
  subscribeLegend: (
    listener: (entries: readonly TileDiagnosticLegendEntry[]) => void
  ) => () => void;
}) => {
  const [entries, setEntries] = useState<readonly TileDiagnosticLegendEntry[]>(
    []
  );
  useEffect(() => subscribeLegend(setEntries), [subscribeLegend]);
  if (!entries.length) return null;
  return (
    <div
      data-test-id="mesh-coverage-legend"
      style={{
        font: "10px/1.25 system-ui",
        color: "#e6edf3",
        background: "rgb(38 46 56 / 94%)",
        padding: "3px 4px",
        boxSizing: "border-box",
        width: "max-content",
        maxWidth: "min(240px, 100%)",
        display: "grid",
        gridTemplateColumns: "12px minmax(0, 1fr)",
        gap: "2px 4px",
        overflowWrap: "anywhere",
      }}
    >
      {entries.map(({ id, label, primitives }) => (
        <div key={id} data-legend-id={id} style={{ display: "contents" }}>
          <LegendSymbol primitives={primitives} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
};
