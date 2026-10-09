import type { Map as MaplibreMap } from "maplibre-gl";

export type MapLibreLayerDepthRange = readonly [near: number, far: number];

type DepthRangeHost = {
  painter?: {
    context?: {
      depthRange?: { current?: unknown; dirty?: boolean };
    };
  };
};

const isDepthRange = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]);

/**
 * The depth range MapLibre gave the custom layer it is drawing. MapLibre 5's
 * draw_custom.ts sets it through `context.setDepthMode` right before calling
 * `render`, and its state cache holds the value it applied; reading it back
 * with `gl.getParameter(gl.DEPTH_RANGE)` instead waits for the GPU process on
 * every frame (about a tenth of the main thread while the map moves).
 *
 * PRIVATE API, deliberately isolated like `runMapLibreIdleRender`: without
 * that cache, or with the cache marked dirty, it falls back to the GL query.
 */
export const readMapLibreLayerDepthRange = (
  map: MaplibreMap | null | undefined,
  gl: Pick<WebGLRenderingContext, "DEPTH_RANGE" | "getParameter">
): MapLibreLayerDepthRange => {
  const depthRange = (map as DepthRangeHost | null | undefined)?.painter
    ?.context?.depthRange;
  if (depthRange && depthRange.dirty !== true && isDepthRange(depthRange.current)) {
    return [depthRange.current[0], depthRange.current[1]];
  }
  const range = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
  return [range[0], range[1]];
};
