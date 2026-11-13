import {
  featureFilter,
  type FilterSpecification,
} from "@maplibre/maplibre-gl-style-spec";

/** Class ids a point can carry: `_CLASSIFICATION` is one byte. */
export const POINTCLOUD_CLASS_COUNT = 256;

/**
 * Which classes a filter expression keeps, as one byte per class id (1 shown,
 * 0 hidden), or null when it keeps them all.
 *
 * Each class is evaluated as a feature whose only property is its id under
 * `property`, so the expressions the filter buttons build for features work
 * unchanged. No expression, or one MapLibre cannot parse, keeps every class:
 * a broken filter should not make the cloud disappear.
 */
export const buildPointCloudClassMask = (
  expression: unknown,
  property: string
): Uint8Array | null => {
  if (expression === null || expression === undefined) {
    return null;
  }
  let filter: ReturnType<typeof featureFilter>["filter"];
  try {
    filter = featureFilter(expression as FilterSpecification).filter;
  } catch (error) {
    console.warn("[POINTCLOUD] class filter ignored, not a filter", {
      expression,
      error,
    });
    return null;
  }
  const mask = new Uint8Array(POINTCLOUD_CLASS_COUNT);
  const globals = { zoom: 0 };
  let hidden = 0;
  for (let classId = 0; classId < POINTCLOUD_CLASS_COUNT; classId++) {
    const feature = { type: 1, properties: { [property]: classId } };
    let shown = true;
    try {
      shown = filter(globals, feature as never);
    } catch {
      shown = true;
    }
    mask[classId] = shown ? 1 : 0;
    hidden += shown ? 0 : 1;
  }
  return hidden === 0 ? null : mask;
};
