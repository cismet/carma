import { CarmaMap } from "@carma-mapping/core";

export function SimpleMapWithoutControls() {
  return (
    <CarmaMap
      fullScreenControl={false}
      zoomControls={false}
      terrainControl={false}
      gazetteerSearchControl={false}
      mapEngine="maplibre"
      exposeMapToWindow
    />
  );
}
