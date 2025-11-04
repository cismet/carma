import type { PositionPreset } from "../positions";
import type { Altitude, Degrees } from "@carma/geo/types";

export const WUPPERTAL: PositionPreset = {
  name: "Wuppertal",
  position: {
    latitude: 51.27174 as Degrees,
    longitude: 7.20028 as Degrees,
    altitude: 155 as Altitude.EllipsoidalWGS84Meters,
  },
  extent: {
    east: 7.32 as Degrees,
    north: 51.33 as Degrees,
    south: 51.16 as Degrees,
    west: 7.0 as Degrees,
  },
};

export default WUPPERTAL;
