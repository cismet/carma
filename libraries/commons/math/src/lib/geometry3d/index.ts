/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// CARMA adopts three.js vectors/rays as native geometry interaction types.

export { VECTOR3_NUMERIC_EPSILON } from "./constants";
export { getClosestLineParamToRay } from "./get-closest-line-param-to-ray";
export { intersectRayWithPlane } from "./plane-intersections";
export { clipConvexPolygonByPlanes3d } from "./clip-convex-polygon";
export { createPlaneBasisFromNormal } from "./plane-basis";
