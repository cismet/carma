// The same Three.js implementation used by the Geoportal shadow scene.
// This entry point intentionally does not import the MapLibre host adapter.
export { ShadowController } from "../../src/lib/runtime/shadow-controller";
export { SHADOW_SUN_DISC_SAMPLES } from "../../src/lib/core/shadow-types";
export type {
  ShadowUpdate,
  ShadowSnapshot,
} from "../../src/lib/runtime/shadow-controller";
export { createSunShadowDemo } from "../../src/lib/demo/sun-shadow-demo";
export type {
  SunShadowDemo,
  SunShadowDemoOptions,
  SunShadowDemoStatus,
} from "../../src/lib/demo/sun-shadow-demo";
