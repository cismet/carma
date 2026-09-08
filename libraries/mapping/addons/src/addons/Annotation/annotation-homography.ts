/**
 * The plane-to-screen transform, solved from four point correspondences.
 *
 * A ground plane seen through a perspective camera maps to the screen by a
 * homography, exactly — no approximation, no per-element work. Four points
 * determine it, so four screen points are unprojected to the ground, matched
 * with where they sit on the plane, and the 3x3 that takes one to the other is
 * solved and handed to CSS as a `matrix3d`.
 *
 * The solve is normalised at a reference point rather than at the plane's own
 * origin: `h33 = 1` fixes `w = 1` at whatever point the source coordinates are
 * measured from, so that point has to be one that is in front of the camera.
 * Normalising at the plane's origin instead would claim `w = 1` there even
 * when the corner is past the horizon, and the horizon test below would read
 * every point as safe.
 *
 * `w` is therefore a depth relative to that reference: 1 at the reference, and
 * falling to 0 at the horizon. Everything the plane draws is clipped to
 * `w >= HORIZON_W`, in plane coordinates, which is what keeps the far half of
 * a tilted plane out of the projective singularity.
 */

/** row major: [a, b, c, d, e, f, g, h, i] */
export type Mat3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export type Point = { x: number; y: number };

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** how close to the horizon the plane may still be drawn, as a depth */
export const HORIZON_W = 0.15;

/** below this a matrix entry is zero */
const EPSILON = 1e-9;

/** below this the transform is the identity and nothing is written */
const IDENTITY_EPSILON = 1e-6;

const solveLinear = (rows: number[][], rhs: number[]): number[] | null => {
  const n = rhs.length;
  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(rows[r][i]) > Math.abs(rows[pivot][i])) {
        pivot = r;
      }
    }
    if (Math.abs(rows[pivot][i]) < 1e-12) {
      return null;
    }
    const swapRow = rows[i];
    rows[i] = rows[pivot];
    rows[pivot] = swapRow;
    const swapValue = rhs[i];
    rhs[i] = rhs[pivot];
    rhs[pivot] = swapValue;

    for (let r = i + 1; r < n; r += 1) {
      const factor = rows[r][i] / rows[i][i];
      if (factor === 0) {
        continue;
      }
      for (let c = i; c < n; c += 1) {
        rows[r][c] -= factor * rows[i][c];
      }
      rhs[r] -= factor * rhs[i];
    }
  }

  const solution = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = rhs[i];
    for (let c = i + 1; c < n; c += 1) {
      sum -= rows[i][c] * solution[c];
    }
    solution[i] = sum / rows[i][i];
  }
  return solution.every((value) => Number.isFinite(value)) ? solution : null;
};

/**
 * The homography taking each `source` point to the matching `screen` point,
 * with `w = 1` at the source origin. Both arrays hold four points.
 */
export const solveHomography = (
  source: readonly Point[],
  screen: readonly Point[]
): Mat3 | null => {
  if (source.length !== 4 || screen.length !== 4) {
    return null;
  }
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x: u, y: v } = source[i];
    const { x, y } = screen[i];
    rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    rhs.push(x);
    rows.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    rhs.push(y);
  }
  const solved = solveLinear(rows, rhs);
  if (!solved) {
    return null;
  }
  return [
    solved[0],
    solved[1],
    solved[2],
    solved[3],
    solved[4],
    solved[5],
    solved[6],
    solved[7],
    1,
  ];
};

export const multiply = (a: Mat3, b: Mat3): Mat3 => {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] =
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out as Mat3;
};

/** moves the source origin by (-dx, -dy) before the transform */
export const translated = (m: Mat3, dx: number, dy: number): Mat3 =>
  multiply(m, [1, 0, -dx, 0, 1, -dy, 0, 0, 1]);

export const invert = (m: Mat3): Mat3 | null => {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) {
    return null;
  }
  return [
    A / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    C / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
};

/** the depth of a source point: 1 at the reference, 0 at the horizon */
export const depthAt = (m: Mat3, x: number, y: number): number =>
  m[6] * x + m[7] * y + m[8];

export const apply = (m: Mat3, x: number, y: number): Point | null => {
  const w = depthAt(m, x, y);
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) {
    return null;
  }
  return {
    x: (m[0] * x + m[1] * y + m[2]) / w,
    y: (m[3] * x + m[4] * y + m[5]) / w,
  };
};

export const isIdentity = (m: Mat3): boolean => {
  const scale = m[8];
  if (!Number.isFinite(scale) || Math.abs(scale) < 1e-12) {
    return false;
  }
  const n = m.map((value) => value / scale);
  return IDENTITY.every(
    (value, index) => Math.abs(n[index] - value) < IDENTITY_EPSILON
  );
};

/**
 * The CSS value for the matrix. `none` when it is the identity, a plain 2D
 * `matrix` while nothing is tilted — that keeps the canvas out of a 3D
 * rendering context — and `matrix3d` otherwise. The matrix is passed
 * unnormalised: CSS takes any `m44`, and dividing by one that is near zero is
 * exactly what happens when the plane's own origin sits on the horizon.
 */
export const cssTransform = (m: Mat3): string => {
  if (isIdentity(m)) {
    return "none";
  }
  const [a, b, c, d, e, f, g, h, i] = m;
  if (Math.abs(g) < EPSILON && Math.abs(h) < EPSILON && Math.abs(i) > 1e-12) {
    return `matrix(${a / i}, ${d / i}, ${b / i}, ${e / i}, ${c / i}, ${f / i})`;
  }
  return `matrix3d(${a}, ${d}, 0, ${g}, ${b}, ${e}, 0, ${h}, 0, 0, 1, 0, ${c}, ${f}, 0, ${i})`;
};

/** the part of a convex polygon that is at least `minDepth` in front */
export const clipToHorizon = (
  polygon: readonly Point[],
  m: Mat3,
  minDepth: number
): Point[] => {
  const kept: Point[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index];
    const to = polygon[(index + 1) % polygon.length];
    const fromDepth = depthAt(m, from.x, from.y) - minDepth;
    const toDepth = depthAt(m, to.x, to.y) - minDepth;
    if (fromDepth >= 0) {
      kept.push(from);
    }
    if (fromDepth >= 0 !== toDepth >= 0) {
      const t = fromDepth / (fromDepth - toDepth);
      kept.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
  }
  return kept;
};

/** the clip as a CSS value; `none` when the whole plane is in front */
export const cssClipPath = (
  polygon: readonly Point[],
  full: readonly Point[]
): string => {
  if (polygon.length < 3) {
    // nothing of the plane is in front of the horizon
    return "polygon(0 0, 0 0, 0 0)";
  }
  if (polygon.length === full.length) {
    const same = polygon.every(
      (point, index) =>
        Math.abs(point.x - full[index].x) < 1e-6 &&
        Math.abs(point.y - full[index].y) < 1e-6
    );
    if (same) {
      return "none";
    }
  }
  return `polygon(${polygon
    .map((point) => `${point.x.toFixed(2)}px ${point.y.toFixed(2)}px`)
    .join(", ")})`;
};
