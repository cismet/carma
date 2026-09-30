import type { Tile } from "3d-tiles-renderer/core";
import type {
  TileDiagnosticSummary,
  TileDiagnostics,
} from "@carma-mapping/engines/maplibre";
import { TileReserveCoverageStats } from "./TileReserveCoverageStats";

type Hover = { tile: Tile; parent: Tile | null; siblings: Tile[] } | null;

export const TileLoadingDebugStats = ({
  summary,
  hover,
  tileId,
  tileError,
}: {
  summary: TileDiagnosticSummary | null;
  hover: Hover;
  tileId: TileDiagnostics["tileId"];
  tileError: TileDiagnostics["tileError"];
}) => (
  <div
    data-test-id="mesh-coverage-stats"
    style={{
      display: "flex",
      flexDirection: "column",
      font: "12px monospace",
      color: "#111",
    }}
  >
    {summary && <TileReserveCoverageStats {...summary} />}
    <div style={{ whiteSpace: "pre-wrap", marginBottom: 4 }}>
      {summary
        ? `Extent floor ${summary.floorLoaded}/${summary.floorTotal} loaded · ${
            summary.uncovered
          } without a loaded cut · ${summary.pending} pending · displayed ${
            summary.displayed
          } · resident ${summary.resident} tiles · target ${
            summary.target
          } px (requested ${
            summary.requested
          }, memory ${summary.memoryTarget.toFixed(1)}) · observer coverage ${
            summary.ready ? "ready" : "pending"
          }${summary.full ? " · CACHE FULL" : ""}${
            summary.paused ? " · LOADING PAUSED" : ""
          }\n` +
          (hover
            ? `Hover ${tileId(hover.tile)} depth ${
                hover.tile.internal?.depth ?? "?"
              } error ${
                Number.isFinite(tileError(hover.tile))
                  ? tileError(hover.tile).toFixed(1)
                  : "–"
              } px · parent ${
                hover.parent ? tileId(hover.parent) : "–"
              } · siblings ${hover.siblings.map(tileId).join(", ") || "–"}`
            : "Hover a tile id, an overlay label or a queue row to see its extent.")
        : "Waiting for the tiles runtime…"}
    </div>
  </div>
);
