import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { searchWithPoints } from "../utils/apiMethods";
import { convertLatLngToXY } from "../utils/mappingTools";

const MARKER_SOURCE_ID = "alkis-point-search-marker";
const MARKER_LAYER_ID = "alkis-point-search-marker-circle";
/** How long the click marker stays on the map, as in the Leaflet variant. */
const MARKER_LIFETIME_MS = 1500;

interface LibrePointSearchProps {
  setMode: (mode: string) => void;
  mode: string;
  map: maplibregl.Map | null | undefined;
  jwt: string;
}

const removeMarker = (map: maplibregl.Map) => {
  if (map.getLayer(MARKER_LAYER_ID)) {
    map.removeLayer(MARKER_LAYER_ID);
  }
  if (map.getSource(MARKER_SOURCE_ID)) {
    map.removeSource(MARKER_SOURCE_ID);
  }
};

/**
 * MapLibre counterpart of PointSearch: clicking the map looks up the ALKIS
 * landparcel under the click and opens its datasheet in a new tab.
 */
export const LibrePointSearch = ({
  map,
  jwt,
  mode,
  setMode,
}: LibrePointSearchProps) => {
  useEffect(() => {
    if (!map) {
      return;
    }

    const canvas = map.getCanvas();

    if (mode !== "point") {
      canvas.style.cursor = "";
      return;
    }

    canvas.style.cursor = "crosshair";

    let markerTimeout: ReturnType<typeof setTimeout> | undefined;

    const drawCircle = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;

      removeMarker(map);
      map.addSource(MARKER_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [lng, lat] },
        },
      });
      map.addLayer({
        id: MARKER_LAYER_ID,
        type: "circle",
        source: MARKER_SOURCE_ID,
        paint: {
          "circle-radius": 10,
          "circle-color": "green",
          "circle-opacity": 0.1,
          "circle-stroke-color": "green",
          "circle-stroke-width": 1,
        },
      });

      const convertedCenter = convertLatLngToXY({ lat, lng });
      searchWithPoints({ x: convertedCenter[0], y: convertedCenter[1] }, jwt);

      markerTimeout = setTimeout(() => {
        removeMarker(map);
        setMode("default");
      }, MARKER_LIFETIME_MS);
    };

    map.on("click", drawCircle);

    return () => {
      canvas.style.cursor = "";
      map.off("click", drawCircle);
      if (markerTimeout) {
        clearTimeout(markerTimeout);
      }
      removeMarker(map);
    };
  }, [map, mode, jwt, setMode]);

  return null;
};
