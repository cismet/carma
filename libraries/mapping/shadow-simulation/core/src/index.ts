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
export type {
  ShadowDateState,
  ShadowSimulationConfig,
  ShadowSimulationState,
} from "../../src/lib/contracts/shadow-simulation";

export {
  applyShadowHashSelection,
  resolveShadowHashSelection,
  shadowStateMatchesHashSelection,
  createShadowStartupState,
} from "../../src/lib/core/shadow-selection-state";
