import {
  TILE_PRESENTATION_MODE,
  formatTileResidentBytes,
  type TileDiagnosticSummary,
} from "@carma-mapping/engines/maplibre";

type Props = Pick<
  TileDiagnosticSummary,
  | "baseCoverage"
  | "seamCoverage"
  | "closureCoverage"
  | "waitingForBase"
  | "presentationMode"
  | "floorResidentTiles"
  | "floorResidentBytes"
  | "baseResidentTiles"
  | "baseResidentBytes"
>;

const percentage = (ratio: number | null) =>
  ratio === null
    ? "total unknown"
    : `${(Math.floor(1000 * ratio) / 10).toFixed(1)}%`;

/** Count coverage of known hierarchy regions, never framebuffer area. */
export const TileReserveCoverageStats = ({
  baseCoverage: base,
  seamCoverage: seam,
  closureCoverage: closure,
  waitingForBase,
  presentationMode,
  floorResidentTiles,
  floorResidentBytes,
  baseResidentTiles,
  baseResidentBytes,
}: Props) => (
  <div style={{ marginBottom: 6 }}>
    <div>
      Mode:{" "}
      {presentationMode === TILE_PRESENTATION_MODE.EXCLUSIVE_SHADOW
        ? "Exclusive shadow"
        : "Exclusive mesh"}
    </div>
    <div data-test-id="mesh-base-resolution-coverage">
      Whole-base geometry: {base.covered}/{base.known} known regions covered ·{" "}
      {percentage(base.ratio)} · {base.resident} resident / {base.renderable}{" "}
      renderable floor roots · {base.demanded} in current demand
    </div>
    <div data-test-id="mesh-pan-reserve-coverage">
      {presentationMode === TILE_PRESENTATION_MODE.EXCLUSIVE_SHADOW
        ? "Exclusive pan reserve"
        : "Base pan reserve"}
      : {closure.covered}/{closure.known} regions · {percentage(closure.ratio)}{" "}
      ·{" "}
      <strong>
        {waitingForBase
          ? "WAITING FOR BASE"
          : closure.ready
          ? "ready"
          : "inactive"}
      </strong>
    </div>
    <div data-test-id="mesh-base-residency">
      Resident floor: {floorResidentTiles} payloads ·{" "}
      {formatTileResidentBytes(floorResidentBytes)}; floor + coarser ancestors:{" "}
      {baseResidentTiles} payloads ·{" "}
      {formatTileResidentBytes(baseResidentBytes)}
    </div>
    <div data-test-id="mesh-seam-coverage">
      Transition seam: {seam.renderable}/{seam.known} known payloads renderable
      · {seam.resident} resident · {seam.demanded} in current demand ·
      whole-ring total not certified
    </div>
    <div style={{ opacity: 0.7 }}>
      Region counts, not area. Finer complete cuts can cover a base region.
      Observer readiness and empty queues do not prove the pan reserve.
    </div>
  </div>
);
