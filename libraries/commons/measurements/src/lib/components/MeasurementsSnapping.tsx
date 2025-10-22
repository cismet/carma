import { useEffect, useRef, useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { adjustClickPosition, toLatLngFromClosestPoint } from "../utils/helper";
import { useMapMeasurementsContext } from "../components/MapMeasurementsProvider";
import { SnappingPoint } from "../snapping/types";
import {
  extractPointsFromGeometry,
  extractPointsFromMeasurementShape,
} from "../snapping/utils/coordinateExtraction";

export function MeasurementsSnapping({ 
  maplibreMap,
  enabled 
}: { 
  maplibreMap: any;
  enabled?: boolean; // Optional: override config.snappingEnabled
}) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { shapes, setSnappingLatlng, config } = useMapMeasurementsContext();
  const [queryRadius, setQueryRadius] = useState(config.snappingQueryRadius);
  const queryRadiusRef = useRef(queryRadius);
  const circleMarkerRef = useRef<any>(null);
  const snappingIndicatorRef = useRef<any>(null); // Leaflet marker for snapping point
  const shapesRef = useRef(shapes);
  
  // Use prop if provided, otherwise fall back to config
  const snappingEnabled = enabled !== undefined ? enabled : config.snappingEnabled;
  const snappingEnabledRef = useRef(snappingEnabled);
  const maplibreMapRef = useRef(maplibreMap);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    queryRadiusRef.current = queryRadius;
  }, [queryRadius]);

  useEffect(() => {
    snappingEnabledRef.current = snappingEnabled;
  }, [snappingEnabled]);

  useEffect(() => {
    maplibreMapRef.current = maplibreMap;
  }, [maplibreMap]);

  useEffect(() => {
    const leafletMap = routedMapRef?.leafletMap?.leafletElement;

    // Clean up visual indicators and coordinates when snapping is disabled
    if (!snappingEnabled) {
      // Clear snapping coordinates immediately
      if (setSnappingLatlng) {
        setSnappingLatlng(null);
      }

      // Remove all Leaflet markers
      if (leafletMap) {
        try {
          if (snappingIndicatorRef.current) {
            leafletMap.removeLayer(snappingIndicatorRef.current);
            snappingIndicatorRef.current = null;
          }
          if (circleMarkerRef.current) {
            leafletMap.removeLayer(circleMarkerRef.current);
            circleMarkerRef.current = null;
          }
        } catch (_) {
          // no-op safeguard
        }
      }

      if (maplibreMap && maplibreMap.getCanvas) {
        maplibreMap.getCanvas().style.cursor = "";
      }

      // Add handlers when snapping is disabled to prevent stale coordinates
      if (leafletMap && typeof leafletMap.on === "function") {
        const clearSnappingHandler = () => {
          if (setSnappingLatlng) {
            setSnappingLatlng(null);
          }
        };

        leafletMap.on("mousemove", clearSnappingHandler);

        // Add a mouseup handler that does NOT adjust click position
        const mapContainer = leafletMap.getContainer();
        const noAdjustHandler = (event: MouseEvent) => {
          // Do nothing - just let the event pass through normally
          // This prevents the old adjustClickPosition handler from being used
        };

        mapContainer.addEventListener("mouseup", noAdjustHandler, true);

        return () => {
          leafletMap.off("mousemove", clearSnappingHandler);
          mapContainer.removeEventListener("mouseup", noAdjustHandler, true);
        };
      }

      return;
    }

    if (leafletMap && typeof leafletMap.on === "function") {
      // Import L from leaflet
      const L = (window as any).L;
      let closestPoint: any = null;

      // Centralized cleanup for markers and closestPoint
      const clearBlackPoint = () => {
        try {
          if (circleMarkerRef.current) {
            leafletMap.removeLayer(circleMarkerRef.current);
            circleMarkerRef.current = null;
          }
          if (snappingIndicatorRef.current) {
            leafletMap.removeLayer(snappingIndicatorRef.current);
            snappingIndicatorRef.current = null;
          }
          if (maplibreMap && maplibreMap.getCanvas) {
            maplibreMap.getCanvas().style.cursor = "";
          }
          closestPoint = null;
        } catch (_) {
          // no-op safeguard
        }
      };

      const mousemoveHandler = (e: any) => {
        // Check zoom level - only work if zoom >= configured minimum
        const currentZoom = leafletMap.getZoom();
        if (currentZoom < config.snappingMinZoom) {
          // Zoom too low: centralized cleanup
          clearBlackPoint();
          return; // Exit early
        }

        // Remove old circle if exists
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
        }

        const currentMaplibreMap = maplibreMapRef.current;
        
        // Get mouse position in lat/lng using Leaflet (always available)
        const mouseLatLng = leafletMap.mouseEventToLatLng(e.originalEvent);
        const mousePoint = leafletMap.latLngToContainerPoint(mouseLatLng);
        
        const currentRadius = queryRadiusRef.current;
        const coordinatePoints: SnappingPoint[] = [];

        // 1. Extract from vector features (if MapLibre is available)
        if (currentMaplibreMap && currentMaplibreMap.getStyle && currentMaplibreMap.getCanvas) {
          try {
            const style = currentMaplibreMap.getStyle();
            if (style && style.layers) {
              const canvas = currentMaplibreMap.getCanvas();
              const rect = canvas.getBoundingClientRect();
              const point = {
                x: e.originalEvent.clientX - rect.left,
                y: e.originalEvent.clientY - rect.top,
              };

              const bbox = [
                [point.x - currentRadius, point.y - currentRadius],
                [point.x + currentRadius, point.y + currentRadius],
              ];

              const features = currentMaplibreMap.queryRenderedFeatures(bbox, {
                layers: style.layers
                  .map((layer: any) => layer.id)
                  .filter((id: string) => !id.startsWith("highlight-")),
              });

              features.forEach((feature: any) => {
                const points = extractPointsFromGeometry(
                  feature.geometry,
                  "vector-features"
                );
                coordinatePoints.push(...points);
              });
            }
          } catch (error) {
            console.warn("Error extracting vector features:", error);
          }
        }

        // 2. Extract from measurement shapes (independent of MapLibre)
        // Use shapesRef which is kept in sync via useEffect
        const currentShapes = shapesRef.current;
        currentShapes.forEach((shape: any) => {
          const points = extractPointsFromMeasurementShape(
            shape,
            "measurements"
          );
          coordinatePoints.push(...points);
        });

        // Filter points to only those within the query radius and calculate distances
        // Use Leaflet for coordinate projection (works without MapLibre)
        const filteredPointsWithDistance = coordinatePoints
          .map((snappingPoint: SnappingPoint) => {
            const coord = snappingPoint.coordinates;
            const pointLatLng = L.latLng(coord[1], coord[0]); // [lng, lat] -> L.latLng(lat, lng)
            const projectedPoint = leafletMap.latLngToContainerPoint(pointLatLng);

            const dx = projectedPoint.x - mousePoint.x;
            const dy = projectedPoint.y - mousePoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            return { snappingPoint, distance };
          })
          .filter((item) => item.distance <= currentRadius);

        // Find the shortest distance
        let shortestDistance = Infinity;
        let shortestIndex = -1;

        filteredPointsWithDistance.forEach((item: any, index: number) => {
          if (item.distance < shortestDistance) {
            shortestDistance = item.distance;
            shortestIndex = index;
          }
        });

        // Determine snapping point
        const blackPoint: any[] = [];
        let isSnapped = false;

        if (shortestIndex === -1) {
            // No points found - use mouse pointer but don't show indicator
            blackPoint.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [mouseLatLng.lng, mouseLatLng.lat],
              },
              properties: { black: true },
            });
            isSnapped = false;
          } else {
            // Snap to the closest point found within query radius
            const closestItem = filteredPointsWithDistance[shortestIndex];
            blackPoint.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: closestItem.snappingPoint.coordinates,
              },
              properties: { black: true },
            });
          isSnapped = true;
        }
        closestPoint = blackPoint[0];

        const finalLatLng = toLatLngFromClosestPoint(closestPoint);
        if (finalLatLng && setSnappingLatlng) {
          setSnappingLatlng(finalLatLng);
        }

        // Remove old snapping indicator if exists
        if (snappingIndicatorRef.current) {
          leafletMap.removeLayer(snappingIndicatorRef.current);
          snappingIndicatorRef.current = null;
        }

        // Create Leaflet marker for snapping indicator ONLY when snapped
        // Match the size of measurement handles (8px total = 4px radius)
        if (finalLatLng && isSnapped) {
          snappingIndicatorRef.current = L.circleMarker(
            [finalLatLng.lat, finalLatLng.lng],
            {
              radius: 3.5,
              color: "#000000",
              fillColor: "#000000",
              fillOpacity: 0.8,
              weight: 1,
              opacity: 0.8,
            }
          ).addTo(leafletMap);
        }
      };

      const mouseoutHandler = () => {
        // Remove circle and snapping indicator when mouse leaves map
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
          circleMarkerRef.current = null;
        }
        if (snappingIndicatorRef.current) {
          leafletMap.removeLayer(snappingIndicatorRef.current);
          snappingIndicatorRef.current = null;
        }
      };

      leafletMap.on("mousemove", mousemoveHandler);
      leafletMap.on("mouseout", mouseoutHandler);

      // Add DOM listener in CAPTURE phase to intercept before Leaflet
      const mapContainer = leafletMap.getContainer();
      const mouseupHandler = (event: MouseEvent) => {
        // Only adjust if snapping is enabled
        if (snappingEnabledRef.current) {
          adjustClickPosition(event, closestPoint, "mouseup", leafletMap);
        }
      };
      mapContainer.addEventListener("mouseup", mouseupHandler, true);
      // mapContainer.addEventListener(
      //   "click",
      //   (event: MouseEvent) =>
      //     adjustClickPosition(event, closestPoint, "click", leafletMap),
      //   true
      // );

      // Cleanup function to remove listeners and markers
      return () => {
        leafletMap.off("mousemove", mousemoveHandler);
        leafletMap.off("mouseout", mouseoutHandler);
        mapContainer.removeEventListener("mouseup", mouseupHandler, true);
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
          circleMarkerRef.current = null;
        }
        if (snappingIndicatorRef.current) {
          leafletMap.removeLayer(snappingIndicatorRef.current);
          snappingIndicatorRef.current = null;
        }
      };
    }
  }, [
    routedMapRef,
    maplibreMap,
    snappingEnabled,
    config.snappingMinZoom,
    setSnappingLatlng,
  ]);
  return null;
}
