import type { Extent, LatLng } from "@carma/types";

export type PositionPreset = {
  name: string;
  position: LatLng.deg;
  extent?: Extent.deg;
};
