import { Vector3 } from "three";
import {
  createMeshLocalProjection,
  createMeshMercatorLut,
  getMeshReprojectionCameraFit,
  MESH_PROJECTION_METHOD,
  MESH_PROJECTION_SAMPLING,
  MESH_REPROJECTION_METHODS,
  sampleMeshMercatorLut,
  type MeshMercatorLutOptions,
  type MeshReprojectionMode,
} from "./mesh-mercator-lut";

export type MeshReprojectionComparison = {
  mode: MeshReprojectionMode;
  maximumErrorMeters: number;
  maximumHorizontalErrorMeters: number;
  maximumVerticalErrorMeters: number;
  preparationMilliseconds: number;
  evaluationMilliseconds: number;
  lookupBytes: number;
  sampleCount: number;
};

/** Sampled root-scale position errors; not GPU timing or a certified supremum.
 * Compare camera neighbourhood and full domain separately for local fits.
 */
export const compareMeshReprojection = async (
  mode: MeshReprojectionMode,
  options: MeshMercatorLutOptions,
  cameraLngLat: readonly [number, number],
  points: readonly Vector3[],
  yieldControl?: () => Promise<void>
): Promise<MeshReprojectionComparison> => {
  const method = MESH_REPROJECTION_METHODS[mode];
  const started = performance.now();
  const projectionOptions = {
    ...options,
    method: method.method ?? MESH_PROJECTION_METHOD.ELLIPSOID,
    sampling: method.sampling,
  };
  const lut = method.method
    ? await createMeshMercatorLut(projectionOptions, yieldControl)
    : null;
  const direct = createMeshLocalProjection(projectionOptions);
  const reference = createMeshLocalProjection({
    ...options,
    method: MESH_PROJECTION_METHOD.ELLIPSOID,
  });
  const matrix = getMeshReprojectionCameraFit(mode, options, cameraLngLat);
  const preparationMilliseconds = performance.now() - started;
  const expected = points.map((point) => reference(point.x, point.y, point.z));
  const result = new Vector3();
  let maximumErrorMeters = 0,
    maximumHorizontalErrorMeters = 0,
    maximumVerticalErrorMeters = 0;
  const evaluateStarted = performance.now();
  points.forEach((point, index) => {
    if (!lut) result.copy(point);
    else if (
      method.sampling === MESH_PROJECTION_SAMPLING.EXACT ||
      point.y < 0 ||
      point.y > 1000
    )
      direct(point.x, point.y, point.z, result);
    else sampleMeshMercatorLut(lut, point, result);
    result.applyMatrix4(matrix).sub(expected[index]);
    maximumErrorMeters = Math.max(maximumErrorMeters, result.length());
    maximumHorizontalErrorMeters = Math.max(
      maximumHorizontalErrorMeters,
      Math.hypot(result.x, result.z)
    );
    maximumVerticalErrorMeters = Math.max(
      maximumVerticalErrorMeters,
      Math.abs(result.y)
    );
  });
  return {
    mode,
    maximumErrorMeters,
    maximumHorizontalErrorMeters,
    maximumVerticalErrorMeters,
    preparationMilliseconds,
    evaluationMilliseconds: performance.now() - evaluateStarted,
    lookupBytes: lut
      ? lut.baseDelta.byteLength + lut.heightDerivativeDelta.byteLength
      : 0,
    sampleCount: points.length,
  };
};
