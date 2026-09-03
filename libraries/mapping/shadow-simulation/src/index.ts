export { clampShadowSimulationSelectionToDaylight } from "./lib/core/solar-position";
export { formatShadowSelection } from "./lib/ui/format-shadow-selection";
export {
  ShadowSimulationHeaderControlsView,
  ShadowSimulationView,
} from "./lib/ui/ShadowSimulationView";
export type {
  ShadowSimulationConfig,
  ShadowSimulationState,
} from "./lib/ui/ShadowSimulationView";
export type { MeshErrorTargetPixels } from "./lib/core/shadow-types";
export { DEFAULT_SHADOW_SURFACE_MODE } from "./lib/runtime/shadow-scene";
export type { ShadowSurfaceMode } from "./lib/runtime/shadow-scene";

import "./lib/ui/shadow-simulation.css";
