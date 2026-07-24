import * as THREE from "three";

export type RegistrationConstraint = {
  allowTranslation?: { x?: boolean; y?: boolean; z?: boolean };
  allowRotation?: { x?: boolean; y?: boolean; z?: boolean };
  maxTranslationMeters?: number;
  /**
   * Cap on the TOTAL rotation angle in degrees (not per Euler axis).
   * Defaults to 3° — the registration corrects survey-grade placement, so
   * anything larger than a few degrees is a fitting artifact, not signal.
   */
  maxRotationDegrees?: number;
  /** Enables similarity registration instead of rigid-only registration. */
  allowUniformScale?: boolean;
  minUniformScale?: number;
  maxUniformScale?: number;
  /**
   * Allowed deviation of the uniform scale from exactly 1 when scale is
   * enabled and no explicit min/max is given. Defaults to 0.005 (±0.5%).
   */
  maxUniformScaleDeviation?: number;
  /**
   * How much stronger vertical (up) residuals count than horizontal ones in
   * the squared-error cost. Defaults to 4 — height agreement with the mesh
   * takes priority over east/south agreement in the local ENU frame.
   */
  verticalErrorWeight?: number;
  /**
   * "density" (default) balances spatial coverage: pairs inside a cluster
   * share the influence a single pair at that location would have, so a
   * handful of well-separated pairs is not outvoted by many pairs in one
   * easy-to-pick corner. "uniform" restores plain unweighted least squares.
   */
  weighting?: "density" | "uniform";
};

export type RegistrationPair = {
  /** Point-cloud coordinate that is transformed by the result matrix. */
  source: THREE.Vector3Like;
  /** Corresponding Mesh 2024 coordinate. */
  target: THREE.Vector3Like;
};

export type RigidRegistrationResult = {
  matrix: THREE.Matrix4;
  translation: THREE.Vector3;
  rotation: THREE.Euler;
  residuals: number[];
  rmsResidualMeters: number;
  maximumResidualMeters: number;
  uniformScale: number;
  /** Per-pair solver weights (normalized to mean 1); absent on restored solves. */
  weights?: number[];
};

const DEFAULT_MAX_ROTATION_DEGREES = 3;
const DEFAULT_UNIFORM_SCALE_DEVIATION = 0.005;
const DEFAULT_VERTICAL_ERROR_WEIGHT = 4;
/**
 * Rotation directions whose information falls below this fraction of the
 * strongest direction are treated as unobservable and excluded from the
 * solve. Pairs that sit on a line carry (almost) no information about the
 * rotation around that line — without this cutoff their random errors would
 * start rotating the whole set purely to chase noise.
 */
const ROTATION_OBSERVABILITY_CUTOFF = 1e-4;

const vector = (value: THREE.Vector3Like) =>
  new THREE.Vector3(value.x, value.y, value.z);

const defaults = {
  allowTranslation: { x: true, y: true, z: true },
  allowRotation: { x: true, y: true, z: true },
};

/**
 * Density-balancing weights: every pair is down-weighted by the effective
 * number of neighbors sharing its location, measured with a Gaussian kernel
 * whose bandwidth follows the overall spread of the pair set. A tight cluster
 * of k pairs collectively contributes like one pair at that spot, while an
 * isolated pair keeps its full vote — so all covered regions pull equally on
 * the rigid fit regardless of how easy they were to pick points in.
 */
export function densityBalancedWeights(
  points: readonly THREE.Vector3Like[]
): number[] {
  if (points.length === 0) return [];
  const center = points
    .reduce<THREE.Vector3>((sum, point) => sum.add(vector(point)), new THREE.Vector3())
    .multiplyScalar(1 / points.length);
  const meanSquaredSpread =
    points.reduce(
      (sum, point) => sum + vector(point).distanceToSquared(center),
      0
    ) / points.length;
  // A quarter of the RMS spread separates "same region" from "different
  // region" without any dataset-specific tuning.
  const sigmaSquared = meanSquaredSpread * 0.0625;
  if (sigmaSquared <= Number.EPSILON) return points.map(() => 1);
  const falloff = -1 / (2 * sigmaSquared);
  const weights = points.map((point) => {
    const self = vector(point);
    let density = 0;
    for (const other of points) {
      density += Math.exp(falloff * self.distanceToSquared(vector(other)));
    }
    // The self-term keeps density >= 1, so weights stay in (0, 1].
    return 1 / density;
  });
  const mean = weights.reduce((sum, value) => sum + value, 0) / weights.length;
  return weights.map((value) => value / mean);
}

/** Jacobi eigendecomposition of a symmetric 3x3 matrix. */
const symmetricEigen3 = (
  matrix: readonly number[][]
): { values: number[]; vectors: THREE.Vector3[] } => {
  const a = matrix.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const offDiagonalPairs: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (let sweep = 0; sweep < 32; sweep++) {
    let p = 0;
    let q = 1;
    let largest = 0;
    for (const [i, j] of offDiagonalPairs) {
      if (Math.abs(a[i][j]) > largest) {
        largest = Math.abs(a[i][j]);
        p = i;
        q = j;
      }
    }
    if (largest < 1e-14) break;
    const angle = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p];
      const akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[k][q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k];
      const aqk = a[q][k];
      a[p][k] = c * apk - s * aqk;
      a[q][k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }
  return {
    values: [a[0][0], a[1][1], a[2][2]],
    vectors: [
      new THREE.Vector3(v[0][0], v[1][0], v[2][0]),
      new THREE.Vector3(v[0][1], v[1][1], v[2][1]),
      new THREE.Vector3(v[0][2], v[1][2], v[2][2]),
    ],
  };
};

/** Solves the dense symmetric system H·x = g via Gaussian elimination. */
const solveLinearSystem = (
  h: number[][],
  g: readonly number[]
): number[] | null => {
  const n = g.length;
  const m = h.map((row, index) => [...row, g[index]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(m[row][column]) > Math.abs(m[pivot][column])) pivot = row;
    }
    if (Math.abs(m[pivot][column]) < 1e-12) return null;
    [m[column], m[pivot]] = [m[pivot], m[column]];
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = m[row][column] / m[column][column];
      for (let k = column; k <= n; k++) m[row][k] -= factor * m[column][k];
    }
  }
  return m.map((row, index) => row[n] / m[index][index]);
};

const clampQuaternionAngle = (
  quaternion: THREE.Quaternion,
  maxAngleRadians: number
): THREE.Quaternion => {
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(quaternion.w), -1, 1));
  if (angle <= maxAngleRadians || angle === 0) return quaternion;
  return new THREE.Quaternion().slerp(quaternion, maxAngleRadians / angle);
};

/**
 * Solves the point-cloud-to-Mesh 2024 transform.
 *
 * The returned matrix is applied to point-cloud coordinates and produces mesh
 * coordinates: `meshPoint = matrix * pointCloudPoint`. Both inputs must be in
 * the shared local [east, up, south] scene frame, not raw ECEF coordinates.
 *
 * Pipeline: a weighted Horn (quaternion) solve provides the initial guess,
 * followed by a Gauss–Newton refinement that (a) weights vertical residuals
 * stronger than horizontal ones, (b) restricts rotation to the directions the
 * pair geometry can actually observe, and (c) enforces hard caps on the total
 * rotation angle and the uniform-scale deviation. Uniform scale is estimated
 * only when explicitly enabled.
 */
export function solveRigidRegistration(
  pairs: readonly RegistrationPair[],
  constraint: RegistrationConstraint = {}
): RigidRegistrationResult {
  if (pairs.length < 3) {
    throw new Error("At least three point pairs are required");
  }

  const source = pairs.map((pair) => vector(pair.source));
  const target = pairs.map((pair) => vector(pair.target));
  const weights =
    (constraint.weighting ?? "density") === "density"
      ? densityBalancedWeights(source)
      : source.map(() => 1);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const sourceCenter = source
    .reduce(
      (sum, point, index) => sum.addScaledVector(point, weights[index]),
      new THREE.Vector3()
    )
    .multiplyScalar(1 / weightSum);
  const targetCenter = target
    .reduce(
      (sum, point, index) => sum.addScaledVector(point, weights[index]),
      new THREE.Vector3()
    )
    .multiplyScalar(1 / weightSum);

  const allowRotation = { ...defaults.allowRotation, ...constraint.allowRotation };
  const rotationAllowed = allowRotation.x || allowRotation.y || allowRotation.z;
  const maxRotationRadians = THREE.MathUtils.degToRad(
    Math.max(0, constraint.maxRotationDegrees ?? DEFAULT_MAX_ROTATION_DEGREES)
  );
  const scaleDeviation = Math.max(
    0,
    constraint.maxUniformScaleDeviation ?? DEFAULT_UNIFORM_SCALE_DEVIATION
  );
  const minScale = constraint.minUniformScale ?? 1 - scaleDeviation;
  const maxScale = constraint.maxUniformScale ?? 1 + scaleDeviation;
  const verticalErrorWeight = Math.max(
    Number.EPSILON,
    constraint.verticalErrorWeight ?? DEFAULT_VERTICAL_ERROR_WEIGHT
  );
  // Scene frame is [east, up, south]: the up axis is Y.
  const axisWeights = [1, verticalErrorWeight, 1];

  // ── Initial guess: weighted Horn quaternion solve ─────────────────────────
  const values = new Float64Array(9);
  for (let index = 0; index < pairs.length; index++) {
    const weight = weights[index];
    const a = source[index].clone().sub(sourceCenter);
    const b = target[index].clone().sub(targetCenter);
    values[0] += weight * b.x * a.x;
    values[1] += weight * b.x * a.y;
    values[2] += weight * b.x * a.z;
    values[3] += weight * b.y * a.x;
    values[4] += weight * b.y * a.y;
    values[5] += weight * b.y * a.z;
    values[6] += weight * b.z * a.x;
    values[7] += weight * b.z * a.y;
    values[8] += weight * b.z * a.z;
  }
  const n00 = values[0] + values[4] + values[8];
  const n01 = values[7] - values[5];
  const n02 = values[2] - values[6];
  const n03 = values[3] - values[1];
  const n11 = values[0] - values[4] - values[8];
  const n12 = values[3] + values[1];
  const n13 = values[2] + values[6];
  const n22 = -values[0] + values[4] - values[8];
  const n23 = values[7] + values[5];
  const n33 = -values[0] - values[4] + values[8];
  const horn = [
    [n00, n01, n02, n03],
    [n01, n11, n12, n13],
    [n02, n12, n22, n23],
    [n03, n13, n23, n33],
  ];
  // Power iteration converges to the eigenvalue of largest magnitude, but
  // Horn's rotation is the eigenvector of the largest (signed) eigenvalue.
  // A Gershgorin diagonal shift makes every eigenvalue non-negative so both
  // maxima coincide, and the asymmetric seed cannot be orthogonal to the
  // dominant eigenvector for 180-degree rotations.
  const gershgorin = Math.max(
    ...horn.map((row) => row.reduce((sum, value) => sum + Math.abs(value), 0))
  );
  const shifted = horn.map((row, rowIndex) =>
    row.map((value, columnIndex) =>
      rowIndex === columnIndex ? value + gershgorin : value
    )
  );
  let q = [1, 0.5, 0.25, 0.125];
  for (let iteration = 0; iteration < 128; iteration++) {
    const next = shifted.map((row) => row.reduce((sum, value, i) => sum + value * q[i], 0));
    const length = Math.hypot(...next);
    q = next.map((value) => value / (length || 1));
  }
  let rotation = rotationAllowed
    ? new THREE.Quaternion(q[1], q[2], q[3], q[0]).normalize()
    : new THREE.Quaternion();
  // Zero locked Euler axes of the initial guess; the refinement below never
  // reintroduces them because locked axes carry no parameters.
  if (!(allowRotation.x && allowRotation.y && allowRotation.z)) {
    const locked = new THREE.Euler().setFromQuaternion(rotation, "XYZ");
    locked.x = allowRotation.x ? locked.x : 0;
    locked.y = allowRotation.y ? locked.y : 0;
    locked.z = allowRotation.z ? locked.z : 0;
    rotation = new THREE.Quaternion().setFromEuler(locked);
  }
  rotation = clampQuaternionAngle(rotation, maxRotationRadians);

  let uniformScale = 1;
  if (constraint.allowUniformScale) {
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < source.length; index++) {
      const weight = weights[index];
      const centeredSource = source[index].clone().sub(sourceCenter);
      const centeredTarget = target[index].clone().sub(targetCenter);
      numerator += weight * centeredTarget.dot(centeredSource.applyQuaternion(rotation));
      denominator += weight * centeredSource.lengthSq();
    }
    uniformScale = denominator > Number.EPSILON ? numerator / denominator : 1;
    uniformScale = THREE.MathUtils.clamp(uniformScale, minScale, maxScale);
  }
  let translation = targetCenter
    .clone()
    .sub(sourceCenter.clone().applyQuaternion(rotation).multiplyScalar(uniformScale));

  // ── Rotation observability: which directions do the pairs constrain? ──────
  // The rotation information matrix is Σ wᵢ Σ_axis axisWeight · Jᵢᵀ·Jᵢ with
  // Jᵢ = [eₐ × pᵢ']. Directions with (near-)zero information — e.g. the roll
  // around a line all pairs sit on — are excluded from the solve entirely, so
  // pair noise cannot push rotation where the geometry cannot see it.
  const rotationBasis: THREE.Vector3[] = [];
  if (rotationAllowed) {
    const information = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    for (let index = 0; index < source.length; index++) {
      const lever = source[index]
        .clone()
        .sub(sourceCenter)
        .applyQuaternion(rotation)
        .multiplyScalar(uniformScale);
      const columns = axes.map((axis) => axis.clone().cross(lever));
      for (let a = 0; a < 3; a++) {
        for (let b = a; b < 3; b++) {
          let value = 0;
          value += axisWeights[0] * columns[a].x * columns[b].x;
          value += axisWeights[1] * columns[a].y * columns[b].y;
          value += axisWeights[2] * columns[a].z * columns[b].z;
          information[a][b] += weights[index] * value;
          if (a !== b) information[b][a] = information[a][b];
        }
      }
    }
    if (!allowRotation.x) {
      information[0] = [0, 0, 0];
      for (const row of information) row[0] = 0;
    }
    if (!allowRotation.y) {
      information[1] = [0, 0, 0];
      for (const row of information) row[1] = 0;
    }
    if (!allowRotation.z) {
      information[2] = [0, 0, 0];
      for (const row of information) row[2] = 0;
    }
    const { values: eigenValues, vectors } = symmetricEigen3(information);
    const strongest = Math.max(...eigenValues, 0);
    for (let index = 0; index < 3; index++) {
      if (eigenValues[index] > strongest * ROTATION_OBSERVABILITY_CUTOFF) {
        rotationBasis.push(vectors[index]);
      }
    }
    // Remove unobservable components the Horn initialization may contain.
    const initialAngle = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(rotation.w), -1, 1));
    if (initialAngle > 1e-9 && rotationBasis.length < 3) {
      const axis = new THREE.Vector3(rotation.x, rotation.y, rotation.z)
        .multiplyScalar(Math.sign(rotation.w) || 1)
        .normalize();
      const rotationVector = axis.multiplyScalar(initialAngle);
      const projected = rotationBasis.reduce(
        (sum, direction) =>
          sum.addScaledVector(direction, rotationVector.dot(direction)),
        new THREE.Vector3()
      );
      const projectedAngle = projected.length();
      rotation =
        projectedAngle > 1e-12
          ? new THREE.Quaternion().setFromAxisAngle(
              projected.clone().normalize(),
              projectedAngle
            )
          : new THREE.Quaternion();
    }
  }

  // ── Anisotropic Gauss–Newton refinement ──────────────────────────────────
  // Parameters: rotation coefficients along the observable directions, the
  // three translation components, and (optionally) the uniform scale. The
  // vertical axis weight is what makes this differ from the Horn solution:
  // up-residuals buy more cost reduction than east/south ones.
  const scaleActive = Boolean(constraint.allowUniformScale);
  const parameterCount = rotationBasis.length + 3 + (scaleActive ? 1 : 0);
  for (let iteration = 0; iteration < 20; iteration++) {
    const h = Array.from({ length: parameterCount }, () =>
      new Array<number>(parameterCount).fill(0)
    );
    const g = new Array<number>(parameterCount).fill(0);
    const jacobian: THREE.Vector3[] = new Array(parameterCount);
    for (let index = 0; index < source.length; index++) {
      const rotated = source[index].clone().applyQuaternion(rotation);
      const lever = rotated.clone().multiplyScalar(uniformScale);
      const predicted = lever.clone().add(translation);
      const residual = target[index].clone().sub(predicted);
      for (let k = 0; k < rotationBasis.length; k++) {
        jacobian[k] = rotationBasis[k].clone().cross(lever);
      }
      jacobian[rotationBasis.length] = new THREE.Vector3(1, 0, 0);
      jacobian[rotationBasis.length + 1] = new THREE.Vector3(0, 1, 0);
      jacobian[rotationBasis.length + 2] = new THREE.Vector3(0, 0, 1);
      if (scaleActive) jacobian[rotationBasis.length + 3] = rotated;
      const weight = weights[index];
      for (let a = 0; a < parameterCount; a++) {
        const ja = jacobian[a];
        g[a] +=
          weight *
          (axisWeights[0] * ja.x * residual.x +
            axisWeights[1] * ja.y * residual.y +
            axisWeights[2] * ja.z * residual.z);
        for (let b = a; b < parameterCount; b++) {
          const jb = jacobian[b];
          const value =
            weight *
            (axisWeights[0] * ja.x * jb.x +
              axisWeights[1] * ja.y * jb.y +
              axisWeights[2] * ja.z * jb.z);
          h[a][b] += value;
          if (a !== b) h[b][a] = h[a][b];
        }
      }
    }
    for (let index = 0; index < parameterCount; index++) {
      h[index][index] += 1e-12 + h[index][index] * 1e-9;
    }
    const delta = solveLinearSystem(h, g);
    if (!delta) break;
    if (rotationBasis.length > 0) {
      const step = rotationBasis.reduce(
        (sum, direction, index) => sum.addScaledVector(direction, delta[index]),
        new THREE.Vector3()
      );
      const stepAngle = step.length();
      if (stepAngle > 1e-15) {
        rotation = new THREE.Quaternion()
          .setFromAxisAngle(step.clone().normalize(), stepAngle)
          .multiply(rotation);
        rotation = clampQuaternionAngle(rotation, maxRotationRadians);
      }
    }
    translation.x += delta[rotationBasis.length];
    translation.y += delta[rotationBasis.length + 1];
    translation.z += delta[rotationBasis.length + 2];
    if (scaleActive) {
      uniformScale = THREE.MathUtils.clamp(
        uniformScale + delta[rotationBasis.length + 3],
        minScale,
        maxScale
      );
    }
    if (Math.max(...delta.map((value) => Math.abs(value))) < 1e-12) break;
  }

  // ── Final constraint application ─────────────────────────────────────────
  const euler = new THREE.Euler().setFromQuaternion(rotation, "XYZ");
  euler.x = allowRotation.x ? euler.x : 0;
  euler.y = allowRotation.y ? euler.y : 0;
  euler.z = allowRotation.z ? euler.z : 0;
  const constrainedRotation = clampQuaternionAngle(
    new THREE.Quaternion().setFromEuler(euler),
    maxRotationRadians
  );
  const finalEuler = new THREE.Euler().setFromQuaternion(constrainedRotation, "XYZ");
  // Closed-form translation for the final rotation and scale: the weighted
  // mean offset per axis (identical per-pair axis weights cancel out here).
  translation = new THREE.Vector3();
  for (let index = 0; index < source.length; index++) {
    const predicted = source[index]
      .clone()
      .applyQuaternion(constrainedRotation)
      .multiplyScalar(uniformScale);
    translation.addScaledVector(target[index].clone().sub(predicted), weights[index]);
  }
  translation.multiplyScalar(1 / weightSum);
  const allowTranslation = { ...defaults.allowTranslation, ...constraint.allowTranslation };
  if (!allowTranslation.x) translation.x = 0;
  if (!allowTranslation.y) translation.y = 0;
  if (!allowTranslation.z) translation.z = 0;
  if (constraint.maxTranslationMeters !== undefined) {
    const limit = Math.max(0, constraint.maxTranslationMeters);
    translation.clampLength(0, limit);
  }
  const matrix = new THREE.Matrix4().compose(
    translation,
    constrainedRotation,
    new THREE.Vector3(uniformScale, uniformScale, uniformScale)
  );
  const residuals = pairs.map((pair) =>
    vector(pair.target).distanceTo(vector(pair.source).applyMatrix4(matrix))
  );
  const squared = residuals.reduce((sum, value) => sum + value * value, 0);
  return {
    matrix,
    translation,
    rotation: finalEuler,
    residuals,
    rmsResidualMeters: Math.sqrt(squared / residuals.length),
    maximumResidualMeters: Math.max(...residuals),
    uniformScale,
    weights,
  };
}
