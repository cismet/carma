import { Extent, LatLngAlt } from "@carma/geo/types";

export type PositionPreset = {
  name: string;
  position: LatLngAlt.Deg;
  extent?: Extent.deg;
};
