type AxisPoint = Readonly<{ x: number; y: number; z: number }>;

export type CalibratedCameraAxis = Readonly<{
  /** Column-major full-sensor projection: bottom-left UV, positive depth in w. */
  sceneToImage: Readonly<{ elements: readonly number[] }>;
  eye: AxisPoint;
  direction: AxisPoint;
}>;

const finitePoint = (point: AxisPoint) =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  Number.isFinite(point.z);

/** Cosine similarity for a covered calibrated sensor ray; higher scores win. */
export const scoreCalibratedCameraAxis = (
  site: CalibratedCameraAxis,
  point: AxisPoint
): number | null => {
  const m = site.sceneToImage.elements;
  if (
    m.length !== 16 ||
    !m.every(Number.isFinite) ||
    !finitePoint(site.eye) ||
    !finitePoint(site.direction) ||
    !finitePoint(point)
  )
    return null;
  const rx = point.x - site.eye.x,
    ry = point.y - site.eye.y,
    rz = point.z - site.eye.z;
  const direction = site.direction;
  const denominator = Math.sqrt(
    (rx * rx + ry * ry + rz * rz) *
      (direction.x * direction.x +
        direction.y * direction.y +
        direction.z * direction.z)
  );
  if (!(denominator > 0) || !Number.isFinite(denominator)) return null;
  const x = m[0] * point.x + m[4] * point.y + m[8] * point.z + m[12];
  const y = m[1] * point.x + m[5] * point.y + m[9] * point.z + m[13];
  const z = m[2] * point.x + m[6] * point.y + m[10] * point.z + m[14];
  const w = m[3] * point.x + m[7] * point.y + m[11] * point.z + m[15];
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    !Number.isFinite(w) ||
    !(w > 0) ||
    x < 0 ||
    x > w ||
    y < 0 ||
    y > w
  )
    return null;
  return Math.max(
    -1,
    Math.min(
      1,
      (rx * direction.x + ry * direction.y + rz * direction.z) / denominator
    )
  );
};
