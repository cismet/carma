/**
 * Generic position representations in various coordinate systems
 */

// keep in namespace only not not mix up with cesium types in use

export namespace Position {
  /**
   * 3D Cartesian position (x, y, z)
   * Coordinate system meaning depends on context
   */
  export type Cartesian3 = {
    x: number;
    y: number;
    z: number;
  };

  /**
   * 2D Cartesian position (x, y)
   * Coordinate system meaning depends on context
   */
  export type Cartesian2 = {
    x: number;
    y: number;
  };

  // TODO: Add spherical/cylindrical coordinates if needed
  // export type Spherical = { radius: number; theta: Radians; phi: Radians };
  // export type Cylindrical = { radius: number; theta: Radians; z: number };
}
