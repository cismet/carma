import { useState, useEffect } from "react";

export const useMapLibreMap = () => {
  const [maplibreMap, setMaplibreMap] = useState<any>(null);
  useEffect(() => {
    // Highlight points (black for serious mode)
    if (maplibreMap) {
      maplibreMap.addSource("highlight", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      maplibreMap.addLayer({
        id: "highlight-point-black",
        type: "circle",
        source: "highlight",
        filter: [
          "all",
          ["==", ["geometry-type"], "Point"],
          ["==", ["get", "black"], true],
        ],
        paint: {
          "circle-radius": 5,
          "circle-color": "#000000",
          "circle-opacity": 0.8,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }, [maplibreMap]);
  return {
    maplibreMap,
    setMaplibreMap,
  };
};
