export { LocationSimulator } from "./LocationSimulator";
export type { LocationSimulatorConfig } from "./config";
export { createFakeDevice, type FakeDevice } from "./fakeDevice";
export {
  DEFAULT_SIGNAL_PRESETS,
  SIGNAL_LABELS,
  type SignalPreset,
  type SimulatedSignal,
} from "./signalPresets";
export {
  parseTrack,
  trackToGeoJSON,
  type GpsTrack,
  type RecordedFix,
} from "./gpsTrack";
export {
  useLocationSimulation,
  type LocationSimulation,
  type LocationSimulationState,
} from "./simulationChannel";
