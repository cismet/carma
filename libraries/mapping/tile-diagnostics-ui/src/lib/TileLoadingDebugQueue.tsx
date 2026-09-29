import { Button } from "antd";
import type { Tile } from "3d-tiles-renderer/core";
import type {
  TileDiagnosticQueueRow,
  TileDiagnosticSummary,
} from "@carma-mapping/engines/maplibre";

export const TileLoadingDebugQueue = ({
  queue,
  summary,
  hoverTile,
  onClear,
  onHover,
}: {
  queue: readonly TileDiagnosticQueueRow[];
  summary: TileDiagnosticSummary | null;
  hoverTile: Tile | null;
  onClear: () => void;
  onHover: (tile: Tile | null) => void;
}) => {
  const activeRows = queue.filter(
    (row) => row.state !== "cancelled" && row.state !== "failed"
  );
  return (
    <div
      data-test-id="mesh-coverage-queue"
      style={{ font: "12px/1.5 monospace", color: "#111" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontWeight: 600,
          padding: "2px 0",
        }}
      >
        <span>
          Scheduled tiles: {activeRows.length} active,{" "}
          {queue.length - activeRows.length} settled · target{" "}
          {summary?.target ?? "–"} px
        </span>
        <span style={{ flex: 1 }} />
        <Button
          onClick={() => {
            onClear();
          }}
        >
          clear
        </Button>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#555" }}>
            <th>tile</th>
            <th>depth</th>
            <th>state</th>
            <th style={{ textAlign: "right" }}>error px</th>
            <th
              style={{ textAlign: "right" }}
              title="Estimate assuming error halves per LOD"
            >
              estimated levels
            </th>
            <th style={{ textAlign: "right" }}>since</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((row, index) => (
            <tr
              key={index}
              data-tile-id={row.id}
              data-state={row.state}
              onMouseEnter={() => onHover(row.tile)}
              onMouseLeave={() => onHover(null)}
              style={{
                cursor: "default",
                color:
                  row.state === "cancelled"
                    ? "#888"
                    : row.state === "failed"
                    ? "#b00"
                    : "#111",
                background:
                  row.tile === hoverTile ? "rgba(255,212,0,0.35)" : undefined,
              }}
            >
              <td>{row.id}</td>
              <td>{row.depth}</td>
              <td>{row.state}</td>
              <td style={{ textAlign: "right" }}>
                {Number.isFinite(row.error) ? row.error.toFixed(1) : "–"}
              </td>
              <td style={{ textAlign: "right" }}>{row.levels}</td>
              <td style={{ textAlign: "right" }}>
                {(row.since / 1000).toFixed(1)} s
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
