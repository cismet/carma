// Renderer-only entry point: no React, MapLibre, or application bootstrap.
export {
  buildSharedSceneAccumulator,
  fitRenderTargetSizeToPixelBudget,
} from "../../src/lib/rendering/scene-accumulator";
export type {
  SceneAccumulationLighting,
  SharedSceneAccumulator,
} from "../../src/lib/rendering/scene-accumulator";
export {
  SCENE_ACCUMULATION_FORMATS,
  DEFAULT_SCENE_ACCUMULATION_OPTIONS,
  resolveSceneAccumulationFormat,
} from "../../src/lib/rendering/scene-accumulation-format";
export type {
  SceneAccumulationFormat,
  SceneAccumulationOptions,
} from "../../src/lib/rendering/scene-accumulation-format";
