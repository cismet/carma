import type { Extent, LatLngAlt } from "@carma/geo/types";

export type PositionPreset = {
  name: string;
  position: LatLngAlt.deg;
  extent?: Extent.deg;
};
