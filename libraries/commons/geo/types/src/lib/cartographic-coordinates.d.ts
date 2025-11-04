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
