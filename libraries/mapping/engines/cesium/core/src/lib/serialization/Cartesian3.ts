import { isFiniteNumber } from "@carma-commons/math";
import type { Meters, MetricVector3 } from "@carma-units";

import { Cartesian3 } from "@carma-cesium";

/**
 * Array of XYZ values for Cartesian3 constructor.
 */
export type Cartesian3ConstructorArgs = [x: Meters, y: Meters, z: Meters];

/**
 * Convert Cesium Cartesian3 to a plain metric vector.
 */
export const cartesian3ToMetricVector3 = (
  cartesian3: Cartesian3
): MetricVector3 => ({
  x: cartesian3.x as Meters,
  y: cartesian3.y as Meters,
  z: cartesian3.z as Meters,
});

/**
 * Convert plain metric vector to Cesium Cartesian3.
 */
export const cartesian3FromMetricVector3 = ({
  x,
  y,
  z,
}: MetricVector3): Cartesian3 => new Cartesian3(x, y, z);

export const isMetricVector3 = (
  value: MetricVector3 | undefined | null
): value is MetricVector3 =>
  !!value &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isFiniteNumber(value.z);
