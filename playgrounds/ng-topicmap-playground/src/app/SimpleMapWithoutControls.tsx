import { CarmaMap } from "@carma-mapping/core";

export function SimpleMapWithoutControls() {
  return (
    <CarmaMap
      appKey="ng-topicmap-playground-simpleWithoutControls"
      fullScreenControl={false}
      zoomControls={false}
      terrainControl={false}
      gazetteerSearchControl={false}
      mapEngine="maplibre"
      exposeMapToWindow
    />
  );
}
