// The same Three.js implementation used by the Geoportal shadow scene.
// This entry point intentionally does not import the MapLibre host adapter.
export { ShadowController } from "../../src/lib/runtime/shadow-controller";
export { TiledShadowRenderer } from "../../src/lib/runtime/tiled-shadow-renderer";
export type {
  TiledShadowLighting,
  TiledShadowStats,
} from "../../src/lib/runtime/tiled-shadow-renderer";
export type { ShadowReceiverCell } from "../../src/lib/core/shadow-page-plan";
export { createTiledShadowDemo } from "../../src/lib/demo/tiled-shadow-demo";
export type {
  TiledShadowDemoOptions,
  TiledShadowDemoStatus,
} from "../../src/lib/demo/tiled-shadow-demo";
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
