import type { LatLngDegrees } from "@carma-commons/types";

export type PositionPreset = {
  name: string;
  position: LatLngDegrees;
  height: number;
  extent?: {
    east: 7.32;
    north: 51.33;
    south: 51.16;
    west: 7.0;
  };
};
