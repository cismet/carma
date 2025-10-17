/**
 * Generic 6DOF pose (position + orientation)
 *
 * Represents the complete position and orientation of an object in 3D space.
 * Standard term in robotics, graphics, and photogrammetry.
 *
 * Terminology:
 * - **Position**: Location in space (NOT "translation" - that's a transformation)
 * - **Orientation**: Rotation/attitude of the object
 *
 * Common uses:
 * - Camera poses
 * - Model/entity transforms
 * - Sensor/vehicle states
 * - Robot end-effector poses
 */
export type Pose<TOrientation = Orientation.Quaternion> = {
  position: Position.Cartesian3;
  orientation: TOrientation;
};

/**
 * Pose namespace with common orientation representations
 */
export namespace Pose {
  /** Pose with quaternion orientation (most common, Cesium-compatible) */
  export type Quaternion = Pose<Orientation.Quaternion>;

  /** Pose with axis-angle orientation */
  export namespace AxisAngle {
    export type deg = Pose<Orientation.AxisAngle.deg>;
    export type rad = Pose<Orientation.AxisAngle.rad>;
  }

  /** Pose with up/direction/right vectors (useful for cameras) */
  export type UpDirectionRight = Pose<Orientation.UpDirectionRight>;

  /** Pose with yaw-pitch-roll angles (aircraft/IMU convention) */
  export namespace YawPitchRoll {
    export type deg = Pose<Orientation.YawPitchRoll.deg>;
    export type rad = Pose<Orientation.YawPitchRoll.rad>;
  }

  /** Pose with omega-phi-kappa angles (photogrammetry convention) */
  export namespace OmegaPhiKappa {
    export type deg = Pose<Orientation.OmegaPhiKappa.deg>;
    export type rad = Pose<Orientation.OmegaPhiKappa.rad>;
  }

  /** Pose with 4×4 transformation matrix (position + orientation encoded in matrix) */
  export type Matrix4 = Pose<Matrix4RowMajor>;
}
