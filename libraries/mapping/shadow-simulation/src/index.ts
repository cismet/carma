export {
  clampShadowSimulationSelectionToDaylight,
  clampSelectionToDaylight,
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  getDaylightWindow,
  getDaysInYear,
  getSolarPosition,
  getSolarSelectionForInstant,
} from "./lib/core/solar-position";
export type {
  SolarLocation,
  SolarPosition,
  SolarSelection,
} from "./lib/core/solar-position";
export {
  DEFAULT_SHADOW_QUALITY,
  DEFAULT_SHADOW_SURFACE_COLOR,
} from "./lib/core/shadow-types";
export type { ShadowQualityMultiplier } from "./lib/core/shadow-types";
export {
  buildShadowSimulationScene,
  solarPositionToSceneDirection,
} from "./lib/runtime/shadow-scene";
export type {
  ShadowBuildingAppearance,
  ShadowSceneOptions,
  ShadowSimulationScene,
  ShadowTerrainOptions,
} from "./lib/runtime/shadow-scene";
export { ShadowProjectionDebugView } from "./lib/ui/ShadowProjectionDebugView";
export { SolarDayTimeControl } from "./lib/ui/SolarDayTimeControl";
export { formatShadowSelection } from "./lib/ui/format-shadow-selection";
export {
  ShadowSimulationHeaderControls,
  ShadowSimulationSettings,
  ShadowSimulationView,
} from "./lib/ui/ShadowSimulationView";
export type {
  ShadowAnimationMode,
  ShadowAnimationSpeed,
  ShadowControlStyle,
  ShadowSimulationConfig,
  ShadowSimulationState,
  ShadowSimulationStateAction,
  ShadowSimulationStateSetter,
} from "./lib/ui/ShadowSimulationView";

import "./lib/ui/shadow-simulation.css";
