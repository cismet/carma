/** Lazy diagnostic entry: never import this from the tile manager's hot path. */
export {
  FILL,
  OVERVIEW_COLORS,
} from "../../core/diagnostics/tile-diagnostic-model";
export {
  diagnosticProjection,
  hitTestDiagnosticLabel,
} from "../../core/diagnostics/tile-diagnostic-scene";
export { captureTileDiagnostics } from "./tile-diagnostic-capture";
export {
  buildVolumeOverlayModel,
  projectDiagnosticVolumes,
} from "../../core/diagnostics/tile-diagnostic-volumes";
export {
  summarizeTileDiagnostics,
  updateTileDiagnosticQueue,
} from "./tile-diagnostic-metrics";
export { createTileDiagnosticOverlay } from "./tile-diagnostic-overlay";
export { createTileDiagnosticExtents } from "./tile-diagnostic-extents";
export {
  createTileDiagnosticScene,
  HOVER,
} from "./tile-diagnostic-scene-helpers";
export {
  isLoadedMesh,
  collectFloorLeaves,
  tileWorldBox,
  loadingTilesOf,
  tileId,
  tileError,
  levelsToTarget,
  kindOf,
} from "./tile-diagnostic-state";
export {
  scheduleTileDiagnosticTask,
  yieldTileDiagnosticTask,
} from "./tile-diagnostic-scheduler";

export { createTilePipelineTelemetry } from "./tile-pipeline-telemetry";
