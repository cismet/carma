import type { Extent, LatLng } from "@carma-commons/types";

export type PositionPreset = {
  name: string;
  position: LatLng.deg;
  extent?: Extent.deg;
};
