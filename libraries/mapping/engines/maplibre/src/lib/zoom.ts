// proper relation would be log2 of tilesize / 256 but this is a fixed relation for maplibre and leaflet
// const zoomDelta = Math.log2(tilesize / 256);

import type { Zoom512, Zoom256 } from "@carma/types";

export const zoom512as256 = (zoom512: Zoom512): Zoom256 => {
  return (zoom512 + 1) as Zoom256;
};

export const zoom256as512 = (zoom256: Zoom256) => {
  return (zoom256 - 1) as Zoom512;
};
