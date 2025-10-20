import type { Meters } from "@carma/units/types";
import type { Altitude } from "./altitudes";

export type EastingNorthingMeters = {
  east: Meters;
  north: Meters;
};

export type EastingNorthingMetersEllipsoidal = EastingNorthingMeters &
  Altitude.WithAltitude<Altitude.EllipsoidalWGS84Meters>;

export type EastingNorthingMetersDHHN2016 = EastingNorthingMeters &
  Altitude.WithAltitude<Altitude.DHHN2016Meters>;

export interface Cartesian3D {
  x: number;
  y: number;
  z: number;
}

export interface Cartesian3Meters {
  x: Meters;
  y: Meters;
  z: Meters;
}
