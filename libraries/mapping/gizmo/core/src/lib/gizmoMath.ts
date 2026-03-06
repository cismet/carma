export type GizmoVec3 = {
  x: number;
  y: number;
  z: number;
};

export type GizmoRay3 = {
  origin: GizmoVec3;
  direction: GizmoVec3;
};

export type GizmoAxisCandidate<TVector = GizmoVec3> = {
  id: string;
  direction: TVector;
  color?: string;
  title?: string | null;
};

export const AXIS_NUMERIC_EPSILON = 1e-6;

export const gizmoMagnitudeSquared = (vector: GizmoVec3): number =>
  vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;

export const gizmoDot = (a: GizmoVec3, b: GizmoVec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

export const gizmoSubtract = (a: GizmoVec3, b: GizmoVec3): GizmoVec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

export const gizmoNormalize = (
  vector: GizmoVec3,
  epsilon: number = AXIS_NUMERIC_EPSILON
): GizmoVec3 | null => {
  const lengthSquared = gizmoMagnitudeSquared(vector);
  if (lengthSquared <= epsilon) return null;
  const invLength = 1 / Math.sqrt(lengthSquared);
  return {
    x: vector.x * invLength,
    y: vector.y * invLength,
    z: vector.z * invLength,
  };
};

export const getClosestAxisParamToRay = (
  ray: GizmoRay3,
  axisOrigin: GizmoVec3,
  axisDirection: GizmoVec3,
  epsilon: number = AXIS_NUMERIC_EPSILON
): number => {
  const rayDirection = gizmoNormalize(ray.direction, epsilon);
  const normalizedAxisDirection = gizmoNormalize(axisDirection, epsilon);

  if (!rayDirection || !normalizedAxisDirection) {
    return 0;
  }

  const originDelta = gizmoSubtract(ray.origin, axisOrigin);

  const a = gizmoDot(rayDirection, rayDirection);
  const b = gizmoDot(rayDirection, normalizedAxisDirection);
  const c = gizmoDot(normalizedAxisDirection, normalizedAxisDirection);
  const d = gizmoDot(rayDirection, originDelta);
  const e = gizmoDot(normalizedAxisDirection, originDelta);
  const denominator = a * c - b * b;

  if (Math.abs(denominator) < epsilon) {
    return e;
  }

  return (a * e - b * d) / denominator;
};

export const findAxisCandidateByDirection = <
  T extends { direction: GizmoVec3 }
>(
  candidates: T[],
  direction: GizmoVec3,
  threshold = 0.999,
  epsilon: number = AXIS_NUMERIC_EPSILON
): T | null => {
  const normalizedDirection = gizmoNormalize(direction, epsilon);
  if (!normalizedDirection) return null;

  for (const candidate of candidates) {
    const normalizedCandidate = gizmoNormalize(candidate.direction, epsilon);
    if (!normalizedCandidate) continue;
    if (
      Math.abs(gizmoDot(normalizedCandidate, normalizedDirection)) > threshold
    ) {
      return candidate;
    }
  }

  return null;
};
