import { Matrix3, Matrix4, Vector3 } from "three";
import { degToRad, radToDeg, type Degrees } from "@carma-units";
import {
  cartographicToEcef,
  ecefToCartographic,
  ecefToEnuMatrix,
  WGS84_A,
  WGS84_E2,
} from "@carma-geo/proj";
import { getWebMercatorFromWgs84Deg } from "@carma-geo/proj";
import { getCameraLocalMercatorFit } from "@carma-geo/proj";

// MapLibre's MercatorCoordinate metre unit uses the mean radius, not EPSG:3857's A.
const MAPLIBRE_EARTH_RADIUS_METERS = 6371008.8;

/** Projection-position budgets for the Wuppertal ±24 km, 0–1000 m domain.
 * Decision: MESH_REFERENCE_DECISIONS.md / MESH-PROJECTION-TARGETS-20260915.
 * These tune interpolation only, not source accuracy or triangle tessellation.
 */
export const MESH_PROJECTION_ACCURACY = {
  "1cm": { targetMeters: 0.01, gridStepMeters: 400 },
  "10cm": { targetMeters: 0.1, gridStepMeters: 1200 },
  "1m": { targetMeters: 1, gridStepMeters: 4000 },
} as const;
export type MeshProjectionAccuracy = keyof typeof MESH_PROJECTION_ACCURACY;

export const MESH_PROJECTION_METHOD = {
  ELLIPSOID: "ellipsoid-mercator",
  SPHERE: "axis-fitted-sphere",
  SPHERE_GLOBAL: "global-fit-sphere",
  AEQD: "spherical-aeqd",
} as const;
export type MeshProjectionMethod =
  (typeof MESH_PROJECTION_METHOD)[keyof typeof MESH_PROJECTION_METHOD];
export const MESH_PROJECTION_SAMPLING = { LUT: "lut", EXACT: "exact" } as const;
export const MESH_REPROJECTION_MODE = {
  OFF: "off",
  CAMERA: "camera-tangent",
  CAMERA_METRIC: "camera-metric",
  SPHERE: "fixed-sphere",
  SPHERE_GLOBAL: "global-fit-sphere",
  AEQD_CAMERA: "aeqd-camera-fit",
  ELLIPSOID_LUT: "ellipsoid-lut",
  ELLIPSOID_EXACT: "ellipsoid-exact",
} as const;
export type MeshReprojectionMode =
  (typeof MESH_REPROJECTION_MODE)[keyof typeof MESH_REPROJECTION_MODE];

/** One mutually exclusive mode contract for render stories and numerical checks. */
export const MESH_REPROJECTION_METHODS = {
  [MESH_REPROJECTION_MODE.OFF]: {
    label: "Off · fixed original root",
    method: null,
    cameraFit: false,
    sampling: MESH_PROJECTION_SAMPLING.LUT,
  },
  [MESH_REPROJECTION_MODE.CAMERA]: {
    label: "Camera tangent · latitude scale",
    method: null,
    cameraFit: true,
    sampling: MESH_PROJECTION_SAMPLING.LUT,
  },
  [MESH_REPROJECTION_MODE.CAMERA_METRIC]: {
    label: "Camera tangent · ellipsoid axis metric",
    method: null,
    cameraFit: true,
    sampling: MESH_PROJECTION_SAMPLING.LUT,
  },
  [MESH_REPROJECTION_MODE.SPHERE]: {
    label: "Fixed axis-fitted sphere → Mercator",
    method: MESH_PROJECTION_METHOD.SPHERE,
    cameraFit: false,
    sampling: MESH_PROJECTION_SAMPLING.LUT,
  },
  [MESH_REPROJECTION_MODE.SPHERE_GLOBAL]: {
    label: "Sphere → Mercator + global least-squares fit",
    method: MESH_PROJECTION_METHOD.SPHERE_GLOBAL,
    cameraFit: false,
    sampling: MESH_PROJECTION_SAMPLING.LUT,
  },
  [MESH_REPROJECTION_MODE.AEQD_CAMERA]: {
    label: "Spherical AEQD + camera-local affine fit",
    method: MESH_PROJECTION_METHOD.AEQD,
    cameraFit: true,
    sampling: MESH_PROJECTION_SAMPLING.LUT,
  },
  [MESH_REPROJECTION_MODE.ELLIPSOID_LUT]: {
    label: "Full ellipsoid → Mercator · segmented LUT",
    method: MESH_PROJECTION_METHOD.ELLIPSOID,
    cameraFit: false,
    sampling: MESH_PROJECTION_SAMPLING.LUT,
  },
  [MESH_REPROJECTION_MODE.ELLIPSOID_EXACT]: {
    label: "Full ellipsoid → Mercator · direct reference",
    method: MESH_PROJECTION_METHOD.ELLIPSOID,
    cameraFit: false,
    sampling: MESH_PROJECTION_SAMPLING.EXACT,
  },
} as const;

export type MeshMercatorLutOptions = {
  longitudeDegrees: number;
  latitudeDegrees: number;
  halfExtentMeters?: number;
  gridStepMeters?: number;
  method?: MeshProjectionMethod;
  sampling?: (typeof MESH_PROJECTION_SAMPLING)[keyof typeof MESH_PROJECTION_SAMPLING];
};

/** Local-only warp; not a global ECEF projection or a vertical-datum conversion. */
export type MeshMercatorLut = {
  options: Required<MeshMercatorLutOptions>;
  size: number;
  stepMeters: number;
  /** RGBA texels, row = local south, column = local east. Alpha is unused. */
  baseDelta: Float32Array;
  heightDerivativeDelta: Float32Array;
};

const resolveOptions = (options: MeshMercatorLutOptions) => {
  const resolved = {
    halfExtentMeters: 24000,
    gridStepMeters: 250,
    method: MESH_PROJECTION_METHOD.ELLIPSOID,
    sampling: MESH_PROJECTION_SAMPLING.LUT,
    ...options,
  };
  if (
    ![
      resolved.longitudeDegrees,
      resolved.latitudeDegrees,
      resolved.halfExtentMeters,
      resolved.gridStepMeters,
    ].every(Number.isFinite) ||
    !Object.values(MESH_PROJECTION_METHOD).includes(resolved.method) ||
    !Object.values(MESH_PROJECTION_SAMPLING).includes(resolved.sampling) ||
    Math.abs(resolved.latitudeDegrees) > 80 ||
    Math.abs(resolved.longitudeDegrees) > 180 ||
    resolved.halfExtentMeters <= 0 ||
    resolved.halfExtentMeters > 50000 ||
    resolved.gridStepMeters < 25 ||
    resolved.gridStepMeters > 4000
  )
    throw new RangeError(
      "Mercator LUT requires a local domain up to 50 km, latitude within 80 degrees, and 25–4000 m grid spacing"
    );
  return resolved;
};

const exactProjector = (options: Required<MeshMercatorLutOptions>) => {
  const latitude = degToRad(options.latitudeDegrees as Degrees);
  const longitude = degToRad(options.longitudeDegrees as Degrees);
  const inverse = ecefToEnuMatrix(
    cartographicToEcef(longitude, latitude, 0)
  ).invert();
  const origin = getWebMercatorFromWgs84Deg(
    options.longitudeDegrees as Degrees,
    options.latitudeDegrees as Degrees
  );
  const rootScale = 1 / Math.cos(latitude);
  const horizontalScale = MAPLIBRE_EARTH_RADIUS_METERS / WGS84_A / rootScale;
  const scratch = new Vector3();
  return (east: number, up: number, south: number, target = new Vector3()) => {
    const cartographic = ecefToCartographic(
      scratch.set(east, -south, up).applyMatrix4(inverse)
    );
    const projected = getWebMercatorFromWgs84Deg(
      radToDeg(cartographic.longitude) as Degrees,
      radToDeg(cartographic.latitude) as Degrees
    );
    return target.set(
      (projected[0] - origin[0]) * horizontalScale,
      cartographic.altitude / Math.cos(cartographic.latitude) / rootScale,
      (origin[1] - projected[1]) * horizontalScale
    );
  };
};

type LocalProjector = (
  east: number,
  up: number,
  south: number,
  target?: Vector3
) => Vector3;

/** Experimental alternatives share the same root-local input/output convention.
 * Decision: MESH_REFERENCE_DECISIONS.md / MESH-PROJECTION-COMPARISON-20260915.
 * Sphere/AEQD are comparison hypotheses, not certified ellipsoid replacements.
 */
export const createMeshLocalProjection = (
  input: MeshMercatorLutOptions
): LocalProjector => {
  const options = resolveOptions(input);
  const reference = exactProjector(options);
  if (options.method === MESH_PROJECTION_METHOD.ELLIPSOID) return reference;
  const latitude = degToRad(options.latitudeDegrees as Degrees);
  const longitude = degToRad(options.longitudeDegrees as Degrees);
  const sin = Math.sin(latitude),
    cos = Math.cos(latitude);
  const radius = MAPLIBRE_EARTH_RADIUS_METERS;
  const denominator = 1 - WGS84_E2 * sin * sin;
  const n = WGS84_A / Math.sqrt(denominator);
  const m = (WGS84_A * (1 - WGS84_E2)) / denominator ** 1.5;
  const inverse = ecefToEnuMatrix(
    cartographicToEcef(longitude, latitude, 0)
  ).invert();
  const scratch = new Vector3();
  const mercator = (phi: number) => Math.log(Math.tan(Math.PI / 4 + phi / 2));
  const baseMercator = mercator(latitude);
  const project: LocalProjector = (east, up, south, target = new Vector3()) => {
    if (options.method === MESH_PROJECTION_METHOD.AEQD) {
      const point = ecefToCartographic(
        scratch.set(east, -south, up).applyMatrix4(inverse)
      );
      const deltaLongitude = point.longitude - longitude;
      const eastDirection = Math.cos(point.latitude) * Math.sin(deltaLongitude);
      const northDirection =
        cos * Math.sin(point.latitude) -
        sin * Math.cos(point.latitude) * Math.cos(deltaLongitude);
      const tangentLength = Math.hypot(eastDirection, northDirection);
      const normal =
        sin * Math.sin(point.latitude) +
        cos * Math.cos(point.latitude) * Math.cos(deltaLongitude);
      const scale =
        tangentLength < 1e-12
          ? radius
          : (radius * Math.atan2(tangentLength, normal)) / tangentLength;
      return target.set(
        eastDirection * scale,
        point.altitude,
        -northDirection * scale
      );
    }
    // First match the two principal ellipsoid metrics, then unwrap the fitted
    // sphere nonlinearly. Rotation into the root meridian avoids global ECEF floats.
    const e = (east * radius) / n,
      north = (-south * radius) / m;
    const radial = radius + up;
    const x = radial * cos - north * sin,
      z = radial * sin + north * cos;
    const phi = Math.atan2(z, Math.hypot(x, e));
    const deltaLongitude = Math.atan2(e, x);
    return target.set(
      radius * cos * deltaLongitude,
      ((Math.hypot(x, e, z) - radius) * cos) / Math.cos(phi),
      -radius * cos * (mercator(phi) - baseMercator)
    );
  };
  if (options.method !== MESH_PROJECTION_METHOD.SPHERE_GLOBAL) return project;
  // One root-preserving 3×3 least-squares correction over the declared domain.
  // Fit small residuals, not two nearly equal large coordinates. This is a
  // sampled least-squares optimum, not a minimax/1cm or arbitrary-domain claim.
  const gram = new Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
  const rhs = [new Vector3(), new Vector3(), new Vector3()];
  const from = new Vector3(),
    to = new Vector3();
  const extent = options.halfExtentMeters;
  for (let z = -4; z <= 4; z++)
    for (let x = -4; x <= 4; x++)
      for (const up of [0, 500, 1000]) {
        project((x * extent) / 4, up, (z * extent) / 4, from);
        reference((x * extent) / 4, up, (z * extent) / 4, to).sub(from);
        from.multiplyScalar(1 / extent);
        for (let row = 0; row < 3; row++) {
          rhs[row].addScaledVector(from, to.getComponent(row));
          for (let col = 0; col < 3; col++)
            gram.elements[col * 3 + row] +=
              from.getComponent(row) * from.getComponent(col);
        }
      }
  if (Math.abs(gram.determinant()) < 1e-12)
    throw new Error("Degenerate global projection fit");
  const inverseGram = gram.invert();
  rhs.forEach((row) =>
    row.applyMatrix3(inverseGram).multiplyScalar(1 / extent)
  );
  const matrix = new Matrix3().set(
    1 + rhs[0].x,
    rhs[0].y,
    rhs[0].z,
    rhs[1].x,
    1 + rhs[1].y,
    rhs[1].z,
    rhs[2].x,
    rhs[2].y,
    1 + rhs[2].z
  );
  return (east, up, south, target = new Vector3()) =>
    project(east, up, south, target).applyMatrix3(matrix);
};

/** Recenter a preprojected local world at camera lon/lat, using its differential.
 * No tile reloading or root change; the same matrix must affect native bounds.
 */
export const getProjectedMeshCameraFit = (
  options: MeshMercatorLutOptions,
  cameraLngLat: readonly [number, number]
): Matrix4 => {
  if (
    !cameraLngLat.every(Number.isFinite) ||
    Math.abs(cameraLngLat[0]) > 180 ||
    Math.abs(cameraLngLat[1]) > 80
  )
    throw new RangeError(
      "Camera fit requires finite local geographic coordinates"
    );
  const project = createMeshLocalProjection(options);
  const reference = exactProjector(resolveOptions(options));
  const root = cartographicToEcef(
    degToRad(options.longitudeDegrees as Degrees),
    degToRad(options.latitudeDegrees as Degrees),
    0
  );
  const p = cartographicToEcef(
    degToRad(cameraLngLat[0] as Degrees),
    degToRad(cameraLngLat[1] as Degrees),
    0
  ).applyMatrix4(ecefToEnuMatrix(root));
  p.set(p.x, p.z, -p.y);
  const extent = resolveOptions(options).halfExtentMeters;
  if (Math.abs(p.x) > extent || Math.abs(p.z) > extent)
    throw new RangeError("Camera outside the local projection domain");
  const source = project(p.x, p.y, p.z),
    target = reference(p.x, p.y, p.z);
  const sourceJacobian = new Matrix3(),
    targetJacobian = new Matrix3();
  const plus = new Vector3(),
    minus = new Vector3();
  for (let axis = 0; axis < 3; axis++) {
    const high = p.clone().setComponent(axis, p.getComponent(axis) + 1);
    const low = p.clone().setComponent(axis, p.getComponent(axis) - 1);
    project(high.x, high.y, high.z, plus);
    project(low.x, low.y, low.z, minus);
    plus
      .sub(minus)
      .multiplyScalar(0.5)
      .toArray(sourceJacobian.elements, axis * 3);
    reference(high.x, high.y, high.z, plus);
    reference(low.x, low.y, low.z, minus);
    plus
      .sub(minus)
      .multiplyScalar(0.5)
      .toArray(targetJacobian.elements, axis * 3);
  }
  if (Math.abs(sourceJacobian.determinant()) < 1e-9)
    throw new Error("Singular local projection fit");
  const linear = targetJacobian.multiply(sourceJacobian.invert());
  const translation = target.sub(source.applyMatrix3(linear));
  return new Matrix4().setFromMatrix3(linear).setPosition(translation);
};

/** Root-local parent transform shared by render and numerical comparisons. */
export const getMeshReprojectionCameraFit = (
  mode: MeshReprojectionMode,
  options: MeshMercatorLutOptions,
  cameraLngLat: readonly [number, number]
) => {
  if (mode === MESH_REPROJECTION_MODE.AEQD_CAMERA)
    return getProjectedMeshCameraFit(
      { ...options, method: MESH_PROJECTION_METHOD.AEQD },
      cameraLngLat
    );
  if (
    mode === MESH_REPROJECTION_MODE.CAMERA ||
    mode === MESH_REPROJECTION_MODE.CAMERA_METRIC
  )
    return getCameraLocalMercatorFit(
      [options.longitudeDegrees, options.latitudeDegrees],
      cameraLngLat,
      {
        correctEllipsoidMetric: mode === MESH_REPROJECTION_MODE.CAMERA_METRIC,
      }
    );
  return new Matrix4();
};

const validatePoint = (lut: MeshMercatorLut, point: Vector3) => {
  const extent = lut.options.halfExtentMeters;
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z) ||
    Math.abs(point.x) > extent ||
    Math.abs(point.z) > extent ||
    point.y < 0 ||
    point.y > 1000
  )
    throw new RangeError(
      "Point outside local Mercator LUT domain or 0–1000 m local-up interval"
    );
};

/** Exact double-precision reference in root-scaled east/up/south Mercator metres. */
export const projectMeshLocalToMercatorExact = (
  options: MeshMercatorLutOptions,
  point: Vector3,
  target = new Vector3()
) => exactProjector(resolveOptions(options))(point.x, point.y, point.z, target);

/**
 * Two RGBA32F fields, bilinear in east/south and linear in local up.
 * Stores small deltas rather than global coordinates to preserve Float32 precision.
 * Yields after four rows by default; callers may supply an abortable scheduler.
 */
export const createMeshMercatorLut = async (
  input: MeshMercatorLutOptions,
  yieldControl: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 0))
): Promise<MeshMercatorLut> => {
  const options = resolveOptions(input);
  if (options.sampling === MESH_PROJECTION_SAMPLING.EXACT)
    return {
      options,
      size: 0,
      stepMeters: 0,
      baseDelta: new Float32Array(),
      heightDerivativeDelta: new Float32Array(),
    };
  const cells = Math.ceil(
    (2 * options.halfExtentMeters) / options.gridStepMeters
  );
  const size = cells + 1;
  const lut: MeshMercatorLut = {
    options,
    size,
    stepMeters: (2 * options.halfExtentMeters) / cells,
    baseDelta: new Float32Array(size * size * 4),
    heightDerivativeDelta: new Float32Array(size * size * 4),
  };
  const project = createMeshLocalProjection(options);
  const base = new Vector3(),
    upper = new Vector3();
  for (let row = 0; row < size; row++) {
    const south = row * lut.stepMeters - options.halfExtentMeters;
    for (let col = 0; col < size; col++) {
      const east = col * lut.stepMeters - options.halfExtentMeters;
      project(east, 0, south, base);
      project(east, 1000, south, upper);
      const index = (row * size + col) * 4;
      lut.baseDelta.set([base.x - east, base.y, base.z - south, 0], index);
      lut.heightDerivativeDelta.set(
        [
          (upper.x - base.x) / 1000,
          (upper.y - base.y) / 1000 - 1,
          (upper.z - base.z) / 1000,
          0,
        ],
        index
      );
    }
    if (row % 4 === 3) await yieldControl();
  }
  return lut;
};

/** CPU equivalent of the two bilinear GPU texture samples. Does not clamp edges. */
export const sampleMeshMercatorLut = (
  lut: MeshMercatorLut,
  point: Vector3,
  target = new Vector3()
) => {
  validatePoint(lut, point);
  if (lut.options.sampling === MESH_PROJECTION_SAMPLING.EXACT)
    return createMeshLocalProjection(lut.options)(
      point.x,
      point.y,
      point.z,
      target
    );
  const x = (point.x + lut.options.halfExtentMeters) / lut.stepMeters;
  const z = (point.z + lut.options.halfExtentMeters) / lut.stepMeters;
  const col = Math.min(lut.size - 2, Math.floor(x));
  const row = Math.min(lut.size - 2, Math.floor(z));
  const fx = x - col,
    fz = z - row;
  const base = lut.baseDelta;
  const height = lut.heightDerivativeDelta;
  let deltaX = 0,
    deltaY = 0,
    deltaZ = 0;
  // Share each corner's weight across channels without allocating per sample.
  // Keep the original accumulation order and defer writes for in-place callers.
  for (let dz = 0; dz < 2; dz++)
    for (let dx = 0; dx < 2; dx++) {
      const index = ((row + dz) * lut.size + col + dx) * 4;
      const weight = (dx ? fx : 1 - fx) * (dz ? fz : 1 - fz);
      deltaX += weight * (base[index] + point.y * height[index]);
      deltaY += weight * (base[index + 1] + point.y * height[index + 1]);
      deltaZ += weight * (base[index + 2] + point.y * height[index + 2]);
    }
  return target.set(point.x + deltaX, point.y + deltaY, point.z + deltaZ);
};
