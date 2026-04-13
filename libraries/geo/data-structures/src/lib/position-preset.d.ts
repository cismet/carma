import type { Extent } from "./extents";
import type { LatLngAlt } from "./geographic-positions";

export type PositionPreset = {
  name: string;
  position: LatLngAlt.deg;
  extent?: Extent.deg;
};
