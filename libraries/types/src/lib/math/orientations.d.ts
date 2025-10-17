/**
 * Generic orientation angle types
 * These are abstract angular units that can be used in any coordinate system
 *
 * Semantic meaning (which axis, positive direction) depends on the coordinate system.
 * See engine-specific types (e.g., Cesium camera types) for concrete conventions.
 */

/**
 * Quaternion orientation representation
 *
 * Convention: Hamilton convention (same as Cesium)
 * - w: scalar part (real component)
 * - x, y, z: vector part (imaginary components)
 *
 * Normalization: Should satisfy x² + y² + z² + w² = 1
 *
 * Identity: { x: 0, y: 0, z: 0, w: 1 }
 *
 * Right-handed rotation: Positive rotation is counterclockwise
 * when looking along the axis toward the origin
 *
 * @see https://cesium.com/learn/cesiumjs/ref-doc/Quaternion.html
 */
export type Quaternion = {
  x: number;
  y: number;
  z: number;
  w: number;
};

/**
 * Axis-Angle orientation representation
 *
 * Represents a rotation by an angle around a unit axis vector.
 *
 * Convention:
 * - axis: Unit vector (length = 1) defining the rotation axis
 * - angle: Rotation angle in radians, right-handed positive
 *
 * Right-handed rotation: Positive angle rotates counterclockwise
 * when looking along the axis toward the origin (thumb points along axis,
 * fingers curl in positive rotation direction)
 *
 * Identity: Any axis with angle = 0, or angle = 2πn (n integer)
 */
export type AxisAngle<T = Radians> = {
  axis: Vector3;
  angle: T extends Degrees ? Degrees : Radians;
};

export namespace AxisAngle {
  export type deg = AxisAngle<Degrees>;
  export type rad = AxisAngle<Radians>;
}

export type UpDirectionRight = {
  up?: Vec3;
  direction?: Vec3;
  right?: Vec3;
};

/**
 * Yaw-Pitch-Roll orientation (Aircraft/IMU convention)
 *
 * Defines relation between navigation (geographic) and body coordinate systems.
 * Common in drone/aircraft flight data.
 *
 * @see https://support.pix4d.com/hc/en-us/articles/202558969
 *
 * Convention (assuming camera mounted looking down, top of image forward):
 * - **Yaw**: Rotation around vertical axis (like compass heading)
 *   - 0° = top of image points north (when nadir)
 *   - 90° = top of image points east (when nadir)
 * - **Pitch**: Camera tilt from nadir
 *   - 0° = camera looking straight down (nadir)
 *   - 90° = camera looking forward horizontally
 * - **Roll**: Rotation around forward axis (usually 0° with gimbal)
 */
export type YawPitchRoll<T = Radians> = {
  yaw?: T extends Degrees ? Degrees : Radians;
  pitch?: T extends Degrees ? Degrees : Radians;
  roll?: T extends Degrees ? Degrees : Radians;
};

export namespace YawPitchRoll {
  export type deg = YawPitchRoll<Degrees>;
  export type rad = YawPitchRoll<Radians>;
}

/**
 * Omega-Phi-Kappa orientation (Photogrammetry convention)
 *
 * Defines rotation from geodetic (X,Y,Z) to image coordinate system.
 * Standard in photogrammetry and aerial surveying.
 *
 * @see https://support.pix4d.com/hc/en-us/articles/202558969
 * @see https://support.pix4d.com/hc/en-us/articles/202559089
 *
 * Convention (rotation order matters!):
 * - **Kappa (κ)**: First rotation around Z axis (vertical)
 * - **Phi (φ)**: Second rotation around Y axis (lateral)
 * - **Omega (ω)**: Third rotation around X axis (longitudinal)
 *
 * Note: This is NOT the same as Yaw-Pitch-Roll. Conversion depends on
 * camera mounting orientation and Earth position.
 */
export type OmegaPhiKappa<T = Radians> = {
  omega?: T extends Degrees ? Degrees : Radians;
  phi?: T extends Degrees ? Degrees : Radians;
  kappa?: T extends Degrees ? Degrees : Radians;
};

export namespace OmegaPhiKappa {
  export type deg = OmegaPhiKappa<Degrees>;
  export type rad = OmegaPhiKappa<Radians>;
}

/**
 * Generic 3D orientation namespace
 * Provides common representations for rotations in 3D space
 */
export namespace Orientation {
  export type Quaternion = Quaternion;
  export type AxisAngle = AxisAngle;
  export type UpDirectionRight = UpDirectionRight;
  export type YawPitchRoll = YawPitchRoll;
  export type OmegaPhiKappa = OmegaPhiKappa;

  /** 3×3 rotation matrix */
  export type Matrix3 = Matrix3RowMajor;
  /** @deprecated Use Matrix3 instead */
  export type Matrix3RowMajor = Matrix3RowMajor;
}
