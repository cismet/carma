import {
  createBasisScaleTranslationMatrix,
  matrix4ColumnToCartesian3,
} from "../Transforms";
import {
  Cartesian3,
  Matrix4,
  Primitive,
  SceneTransforms,
  Transforms,
  defined,
  type Scene,
} from "@carma-cesium";
export const GUIDE_NORMAL_EPSILON_SQUARED = 1e-8;

const DISC_MIN_WORLD_RADIUS = 1e-3;
const DISC_MIN_PROJECTED_PIXEL_PER_WORLD = 1e-6;
const DISC_PROJECTION_SCALE_SAMPLE_COUNT = 16;
const LOCAL_UP_ENU_FRAME_SCRATCH = new Matrix4();
const STABLE_DISC_NORMAL_LOCAL_UP_SCRATCH = new Cartesian3();
const STABLE_DISC_NORMAL_SCRATCH = new Cartesian3();

export const safeRemovePrimitive = (
  scene: Scene | null,
  primitive: Primitive | null | undefined
) => {
  if (!scene || !primitive) return;
  try {
    if (!scene.isDestroyed()) {
      scene.primitives.remove(primitive);
    }
  } catch {
    // Scene/primitive teardown may race while effects are cleaning up.
  }
};

export const safeCall = (callback: (() => void) | null | undefined) => {
  if (!callback) return;
  try {
    callback();
  } catch {
    // Listener removal can race with scene/widget teardown.
  }
};

export const getLocalUpDirectionAtPosition = (
  positionECEF: Cartesian3,
  result: Cartesian3 = new Cartesian3()
): Cartesian3 => {
  const localEnuFrame = Transforms.eastNorthUpToFixedFrame(
    positionECEF,
    undefined,
    LOCAL_UP_ENU_FRAME_SCRATCH
  );
  const upDirection = matrix4ColumnToCartesian3(localEnuFrame, 2, result);

  if (
    Cartesian3.magnitudeSquared(upDirection) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    return Cartesian3.normalize(positionECEF, result);
  }

  return Cartesian3.normalize(upDirection, result);
};

export const createPlaneBasis = (normal: Cartesian3) => {
  const up = Cartesian3.normalize(normal, new Cartesian3());
  const reference =
    Math.abs(Cartesian3.dot(up, Cartesian3.UNIT_Z)) > 0.9
      ? Cartesian3.UNIT_X
      : Cartesian3.UNIT_Z;
  const xAxis = Cartesian3.normalize(
    Cartesian3.cross(up, reference, new Cartesian3()),
    new Cartesian3()
  );
  const yAxis = Cartesian3.normalize(
    Cartesian3.cross(xAxis, up, new Cartesian3()),
    new Cartesian3()
  );
  return { xAxis, yAxis };
};

export const resolveDiscNormal = (
  origin: Cartesian3,
  preferredNormal: Cartesian3 | null | undefined
): Cartesian3 => {
  if (
    preferredNormal &&
    Cartesian3.magnitudeSquared(preferredNormal) > GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    return Cartesian3.normalize(preferredNormal, new Cartesian3());
  }
  return getLocalUpDirectionAtPosition(origin);
};

const resolveHealthyDiscNormalCandidate = (
  normal: Cartesian3 | null | undefined
) => {
  if (
    !normal ||
    Cartesian3.magnitudeSquared(normal) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    return null;
  }

  return Cartesian3.normalize(
    Cartesian3.clone(normal, STABLE_DISC_NORMAL_SCRATCH),
    STABLE_DISC_NORMAL_SCRATCH
  );
};

export const resolveStableDiscNormal = (
  origin: Cartesian3,
  preferredNormal: Cartesian3 | null | undefined,
  fallbackNormal?: Cartesian3 | null
): Cartesian3 => {
  const preferredCandidate = resolveHealthyDiscNormalCandidate(preferredNormal);
  const fallbackCandidate = resolveHealthyDiscNormalCandidate(
    fallbackNormal ?? null
  );

  if (preferredCandidate) {
    if (
      fallbackCandidate &&
      Cartesian3.dot(preferredCandidate, fallbackCandidate) < 0
    ) {
      return Cartesian3.negate(preferredCandidate, new Cartesian3());
    }

    const localUp = getLocalUpDirectionAtPosition(
      origin,
      STABLE_DISC_NORMAL_LOCAL_UP_SCRATCH
    );
    if (Cartesian3.dot(preferredCandidate, localUp) < 0) {
      return Cartesian3.negate(preferredCandidate, new Cartesian3());
    }

    return Cartesian3.clone(preferredCandidate, new Cartesian3());
  }

  if (fallbackCandidate) {
    return Cartesian3.clone(fallbackCandidate, new Cartesian3());
  }

  return Cartesian3.clone(
    getLocalUpDirectionAtPosition(origin, STABLE_DISC_NORMAL_LOCAL_UP_SCRATCH),
    new Cartesian3()
  );
};

export const createOrientedDiscModelMatrix = (
  origin: Cartesian3,
  planeNormal: Cartesian3,
  radius: number,
  result: Matrix4 = new Matrix4()
): Matrix4 => {
  const safeRadius = Math.max(radius, DISC_MIN_WORLD_RADIUS);
  const normalizedNormal = Cartesian3.normalize(planeNormal, new Cartesian3());
  const planeBasis = createPlaneBasis(normalizedNormal);
  return createBasisScaleTranslationMatrix(
    origin,
    planeBasis.xAxis,
    planeBasis.yAxis,
    normalizedNormal,
    safeRadius,
    safeRadius,
    1,
    result
  );
};

export const getDiscWorldRadius = (
  scene: Scene,
  origin: Cartesian3,
  planeNormal: Cartesian3,
  configuredWorldRadius: number,
  fixedScreenRadiusPx?: number
): number => {
  const baseRadius = Math.max(configuredWorldRadius, DISC_MIN_WORLD_RADIUS);
  if (fixedScreenRadiusPx === undefined) {
    return baseRadius;
  }

  const anchorCanvasPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    origin
  );
  if (!defined(anchorCanvasPosition)) {
    return baseRadius;
  }

  const planeBasis = createPlaneBasis(planeNormal);
  let pixelPerWorldMax = 0;
  for (let i = 0; i < DISC_PROJECTION_SCALE_SAMPLE_COUNT; i += 1) {
    const t = (i / DISC_PROJECTION_SCALE_SAMPLE_COUNT) * Math.PI * 2;
    const sampleDirection = Cartesian3.add(
      Cartesian3.multiplyByScalar(
        planeBasis.xAxis,
        Math.cos(t),
        new Cartesian3()
      ),
      Cartesian3.multiplyByScalar(
        planeBasis.yAxis,
        Math.sin(t),
        new Cartesian3()
      ),
      new Cartesian3()
    );
    const sampleWorld = Cartesian3.add(
      origin,
      sampleDirection,
      new Cartesian3()
    );
    const sampleCanvas = SceneTransforms.worldToWindowCoordinates(
      scene,
      sampleWorld
    );
    if (!defined(sampleCanvas)) continue;

    const dx = sampleCanvas.x - anchorCanvasPosition.x;
    const dy = sampleCanvas.y - anchorCanvasPosition.y;
    const d = Math.hypot(dx, dy);
    if (Number.isFinite(d) && d > pixelPerWorldMax) {
      pixelPerWorldMax = d;
    }
  }

  if (pixelPerWorldMax <= DISC_MIN_PROJECTED_PIXEL_PER_WORLD) {
    return baseRadius;
  }

  return Math.max(
    fixedScreenRadiusPx / pixelPerWorldMax,
    DISC_MIN_WORLD_RADIUS
  );
};
