// Startup-safe entry: no React views, Three scene or shader dependencies.
export {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "../../src/lib/core/create-shadow-simulation-state";
export {
  clampShadowSimulationSelectionToDaylight,
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  DEFAULT_SHADOW_SIMULATION_TIME_ZONE,
} from "../../src/lib/core/solar-position";
export { formatShadowSelection } from "../../src/lib/ui/format-shadow-selection";
export { getSolarPosition } from "../../src/lib/core/solar-position";
export { advanceShadowAnimationFrame } from "../../src/lib/core/shadow-animation";
export { fitShadowMap } from "../../src/lib/core/fit-shadow-map";
export {
  getSunDiscSampleOffset,
  SUN_ANGULAR_RADIUS_RAD,
} from "../../src/lib/core/sun-disc-sampling";
export { shadowRasterOffset } from "../../src/lib/core/shadow-raster-offset";
export type {
  ShadowDateState,
  ShadowSimulationConfig,
  ShadowSimulationState,
} from "../../src/lib/contracts/shadow-simulation";

export {
  applyShadowHashSelection,
  resolveShadowHashSelection,
  shadowStateMatchesHashSelection,
} from "../../src/lib/core/shadow-selection-state";
