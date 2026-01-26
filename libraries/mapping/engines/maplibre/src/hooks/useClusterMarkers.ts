import maplibregl from "maplibre-gl";
import { useRef, useCallback, useEffect } from "react";
import { createPieChart } from "../utils/clusterUtils";
import type { GeoJsonMetadata } from "../contexts/LibreContext";

interface UseClusterMarkersOptions {
  map: maplibregl.Map | null;
  geoJsonMetadata: GeoJsonMetadata[];
  interactive?: boolean;
}

export const useClusterMarkers = ({
  map,
  geoJsonMetadata,
  interactive = true,
}: UseClusterMarkersOptions) => {
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const markersOnScreen = useRef<Record<string, maplibregl.Marker>>({});

  const updateMarkers = useCallback(() => {
    if (!map || geoJsonMetadata.length === 0) return;

    geoJsonMetadata.forEach(({ sourceId, uniqueColors }) => {
      const newMarkers: Record<string, maplibregl.Marker> = {};

      let features: maplibregl.GeoJSONFeature[] = [];
      try {
        features = map.querySourceFeatures(sourceId);
      } catch {
        // Source might not be loaded yet
        return;
      }

      for (const feature of features) {
        if (!feature.geometry || feature.geometry.type === "GeometryCollection")
          continue;
        const coords = feature.geometry.coordinates as [number, number];
        const props = feature.properties;
        if (!props || !props.cluster) continue;
        const id = `${sourceId}-${props.cluster_id}`;

        let marker = markers.current[id];
        if (!marker) {
          const el = createPieChart(props, uniqueColors);
          marker = markers.current[id] = new maplibregl.Marker({
            element: el,
          }).setLngLat(coords);

          if (interactive) {
            el.addEventListener("click", () => {
              const currentZoom = map.getZoom();
              const pointCount = props.point_count;
              const zoomIncrement =
                pointCount > 100 ? 3 : pointCount > 50 ? 2 : 1;
              const newZoom = Math.min(
                currentZoom + zoomIncrement,
                map.getMaxZoom()
              );
              map.flyTo({
                center: coords,
                zoom: newZoom,
                essential: true,
              });
            });
          }
        }
        newMarkers[id] = marker;

        if (!markersOnScreen.current[id]) marker.addTo(map);
      }

      // Remove markers that are no longer visible
      for (const id in markersOnScreen.current) {
        if (id.startsWith(sourceId) && !newMarkers[id]) {
          markersOnScreen.current[id].remove();
          delete markersOnScreen.current[id];
        }
      }

      // Update markers on screen for this source
      Object.keys(newMarkers).forEach((id) => {
        markersOnScreen.current[id] = newMarkers[id];
      });
    });
  }, [map, geoJsonMetadata, interactive]);

  // Set up event listeners for marker updates
  useEffect(() => {
    if (!map || geoJsonMetadata.length === 0) return;

    const handleData = (e: maplibregl.MapDataEvent) => {
      const isRelevantSource = geoJsonMetadata.some(
        // @ts-expect-error sourceId exists on the event
        ({ sourceId }) => e.sourceId === sourceId
      );
      // @ts-expect-error isSourceLoaded exists on the event
      if (!isRelevantSource || !e.isSourceLoaded) return;
      updateMarkers();
    };

    const handleMove = () => updateMarkers();
    const handleMoveEnd = () => setTimeout(updateMarkers, 100);

    map.on("data", handleData);
    map.on("move", handleMove);
    map.on("moveend", handleMoveEnd);

    // Initial update
    updateMarkers();

    return () => {
      map.off("data", handleData);
      map.off("move", handleMove);
      map.off("moveend", handleMoveEnd);

      // Clean up all markers
      Object.values(markersOnScreen.current).forEach((marker) =>
        marker.remove()
      );
      markersOnScreen.current = {};
      markers.current = {};
    };
  }, [map, geoJsonMetadata, updateMarkers]);

  return { updateMarkers };
};
