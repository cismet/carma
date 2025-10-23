import type { AltitudeEllipsoidalWGS84Meters, Degrees, Extent } from "./types";

export type PositionPreset = {
  name: string;
  position: {
    latitude: Degrees;
    longitude: Degrees;
    altitude?: AltitudeEllipsoidalWGS84Meters;
  };
  extent?: Extent.deg;
};
