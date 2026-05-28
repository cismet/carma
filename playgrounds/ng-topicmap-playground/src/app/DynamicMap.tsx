import { CarmaMap, useDynamicVectorLayer } from "@carma-mapping/core";
import { Control } from "@carma-mapping/map-controls-layout";

import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

export function DynamicMap() {
  const { libreLayer, selectors } = useDynamicVectorLayer({
    layerId: "alkis-flurstuecke-dynamic",
    styleUrl: "https://tiles.cismet.de/alkis/flurstuecke.dynamic.style.json",
  });

  return (
    <div className="w-full h-screen relative">
      <CarmaMap
        appKey="ng-topicmap-playground-dynamic"
        mapEngine="maplibre"
        exposeMapToWindow
        backgroundLayers="basemap_grey@20"
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        libreLayers={libreLayer ? [libreLayer] : []}
        extraControls={
          selectors.length ? (
            <Control position="topcenter" order={10}>
              <div
                style={{
                  pointerEvents: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: "white",
                  borderRadius: 4,
                  padding: "4px 8px",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                }}
              >
                {selectors}
              </div>
            </Control>
          ) : null
        }
      />
    </div>
  );
}

export default DynamicMap;
