import { CarmaMap } from "@carma-appframeworks/portals";

export function SimpleMapWithoutControls() {
  return (
    <CarmaMap
      fullScreenControl={false}
      zoomControls={false}
      terrainControl={false}
      gazetteerSearchControl={false}
      mapEngine="maplibre"
    />
  );
}
