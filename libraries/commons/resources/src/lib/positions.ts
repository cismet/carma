import { LatLngDegrees } from "types/common-geo";

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
