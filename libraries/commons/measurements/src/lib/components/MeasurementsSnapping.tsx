import { useEffect, useRef, useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { adjustClickPosition, toLatLngFromClosestPoint } from "../utils/helper";
import { useMapMeasurementsContext } from "../components/MapMeasurementsProvider";
import { SnappingPoint } from "../snapping/types";
import {
  extractPointsFromGeometry,
  extractPointsFromMeasurementShape,
} from "../snapping/utils/coordinateExtraction";

export function MeasurementsSnapping({ maplibreMap }: { maplibreMap: any }) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { shapes, setSnappingLatlng, config } = useMapMeasurementsContext();
  const [queryRadius, setQueryRadius] = useState(config.snappingQueryRadius);
  const [toleranceRadius, setToleranceRadius] = useState(
    config.snappingToleranceRadius
  );
  const queryRadiusRef = useRef(queryRadius);
  const toleranceRadiusRef = useRef(toleranceRadius);
  const circleMarkerRef = useRef<any>(null);
  const toleranceCircleMarkerRef = useRef<any>(null);
  const shapesRef = useRef(shapes);
  const snappingEnabledRef = useRef(config.snappingEnabled);
  const maplibreMapRef = useRef(maplibreMap);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    queryRadiusRef.current = queryRadius;
  }, [queryRadius]);

  useEffect(() => {
    toleranceRadiusRef.current = toleranceRadius;
  }, [toleranceRadius]);

  useEffect(() => {
    snappingEnabledRef.current = config.snappingEnabled;
  }, [config.snappingEnabled]);

  useEffect(() => {
    maplibreMapRef.current = maplibreMap;
  }, [maplibreMap]);

  useEffect(() => {
    const leafletMap = routedMapRef?.leafletMap?.leafletElement;

    // Clean up visual indicators and coordinates when snapping is disabled
    if (!config.snappingEnabled) {
      // Clear snapping coordinates immediately
      if (setSnappingLatlng) {
        setSnappingLatlng(null);
      }

      if (maplibreMap && typeof maplibreMap.getSource === "function") {
        try {
          const highlightSource = maplibreMap.getSource("highlight");
          if (highlightSource) {
            highlightSource.setData({
              type: "FeatureCollection",
              features: [],
            });
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

      // Centralized cleanup for markers, highlight, cursor, and closestPoint
      const clearBlackPoint = () => {
        try {
          if (circleMarkerRef.current) {
            leafletMap.removeLayer(circleMarkerRef.current);
            circleMarkerRef.current = null;
          }
          if (toleranceCircleMarkerRef.current) {
            leafletMap.removeLayer(toleranceCircleMarkerRef.current);
            toleranceCircleMarkerRef.current = null;
          }
          if (
            maplibreMap &&
            typeof maplibreMap.getSource === "function" &&
            maplibreMap.getSource("highlight")
          ) {
            maplibreMap.getSource("highlight").setData({
              type: "FeatureCollection",
              features: [],
            });
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

        // Remove old circles if exist
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
        }
        if (toleranceCircleMarkerRef.current) {
          leafletMap.removeLayer(toleranceCircleMarkerRef.current);
        }

        // Check if MapLibre is available and valid using the ref
        // If not (e.g., after removing all vector layers), just return early
        // and let normal Leaflet measurement behavior work without snapping
        const currentMaplibreMap = maplibreMapRef.current;

        if (!currentMaplibreMap) {
          if (setSnappingLatlng) {
            setSnappingLatlng(null);
          }
          return;
        }

        // Try to access MapLibre methods - if they fail, return early
        try {
          if (!currentMaplibreMap.getCanvas || !currentMaplibreMap.getStyle) {
            if (setSnappingLatlng) {
              setSnappingLatlng(null);
            }
            return;
          }
        } catch (error) {
          // MapLibre is in invalid state
          if (setSnappingLatlng) {
            setSnappingLatlng(null);
          }
          return;
        }

        // MapLibre is valid, proceed with snapping logic
        try {
          // Check if MapLibre has a valid style - if not, it's in an invalid state
          const style = currentMaplibreMap.getStyle();
          if (!style) {
            // MapLibre style is undefined - return early
            if (setSnappingLatlng) {
              setSnappingLatlng(null);
            }
            return;
          }

          const canvas = currentMaplibreMap.getCanvas();
          const rect = canvas.getBoundingClientRect();

          // Calculate the mouse position relative to the MapLibre canvas
          const point = {
            x: e.originalEvent.clientX - rect.left,
            y: e.originalEvent.clientY - rect.top,
          };

          const currentRadius = queryRadiusRef.current;

          const bbox = [
            [point.x - currentRadius, point.y - currentRadius],
            [point.x + currentRadius, point.y + currentRadius],
          ];

          // Query features but exclude our highlight layers to avoid feedback loop
          let features: any[] = [];
          try {
            if (style && style.layers) {
              features = currentMaplibreMap.queryRenderedFeatures(bbox, {
                layers: style.layers
                  .map((layer: any) => layer.id)
                  .filter((id: string) => !id.startsWith("highlight-")),
              });
            }
          } catch (error) {
            console.warn("Error querying features:", error);
            features = [];
          }

          // Always run snapping logic when snapping is enabled, even if no features
          // This ensures the indicator shows and clicks work normally
          currentMaplibreMap.getCanvas().style.cursor =
            features.length > 0 || shapesRef.current.length > 0
              ? "pointer"
              : "";
          const coordinatePoints: SnappingPoint[] = [];

          // Extract points from vector features
          features.forEach((feature: any) => {
            const points = extractPointsFromGeometry(
              feature.geometry,
              "vector-features"
            );
            coordinatePoints.push(...points);
          });

          // Extract points from measurement shapes
          shapesRef.current.forEach((shape: any) => {
            const points = extractPointsFromMeasurementShape(
              shape,
              "measurements"
            );
            coordinatePoints.push(...points);
          });

          // Filter points to only those within the circle radius and calculate distances
          const filteredPointsWithDistance = coordinatePoints
            .map((snappingPoint: SnappingPoint) => {
              const coord = snappingPoint.coordinates;
              const projectedPoint = currentMaplibreMap.project(coord);

              const dx = projectedPoint.x - point.x;
              const dy = projectedPoint.y - point.y;
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

          // Get mouse pointer coordinates in lng/lat
          const mouseLatLng = currentMaplibreMap.unproject([point.x, point.y]);

          // Get current tolerance radius
          const currentToleranceRadius = toleranceRadiusRef.current;

          // Only show the closest point in black
          const blackPoint: any[] = [];

          if (shortestIndex === -1) {
            // No points found - show black dot at mouse pointer
            blackPoint.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [mouseLatLng.lng, mouseLatLng.lat],
              },
              properties: { black: true },
            });
          } else {
            const closestItem = filteredPointsWithDistance[shortestIndex];

            // Check if winning dot is within tolerance radius
            if (closestItem.distance <= currentToleranceRadius) {
              // Show black point at the actual closest coordinate
              blackPoint.push({
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: closestItem.snappingPoint.coordinates,
                },
                properties: { black: true },
              });
            } else {
              // Winning dot is outside tolerance - show dot at mouse pointer
              blackPoint.push({
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [mouseLatLng.lng, mouseLatLng.lat],
                },
                properties: { black: true, mode: "serious" },
              });
            }
          }
          closestPoint = blackPoint[0];

          const finalLatLng = toLatLngFromClosestPoint(closestPoint);
          if (finalLatLng && setSnappingLatlng) {
            setSnappingLatlng(finalLatLng);
          }

          // Update highlight source with only the black point
          const highlightSource = currentMaplibreMap.getSource("highlight");
          if (highlightSource) {
            highlightSource.setData({
              type: "FeatureCollection",
              features: blackPoint,
            });
          }
        } catch (error) {
          // MapLibre error during snapping - clear state and continue
          console.warn(
            "MapLibre error during snapping, falling back to normal mode:",
            error
          );
          closestPoint = null;
          if (setSnappingLatlng) {
            setSnappingLatlng(null);
          }
        }
      };

      const mouseoutHandler = () => {
        // Remove circles when mouse leaves map
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
          circleMarkerRef.current = null;
        }
        if (toleranceCircleMarkerRef.current) {
          leafletMap.removeLayer(toleranceCircleMarkerRef.current);
          toleranceCircleMarkerRef.current = null;
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

      // Cleanup function to remove listeners and circles
      return () => {
        leafletMap.off("mousemove", mousemoveHandler);
        leafletMap.off("mouseout", mouseoutHandler);
        mapContainer.removeEventListener("mouseup", mouseupHandler, true);
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
          circleMarkerRef.current = null;
        }
        if (toleranceCircleMarkerRef.current) {
          leafletMap.removeLayer(toleranceCircleMarkerRef.current);
          toleranceCircleMarkerRef.current = null;
        }
      };
    }
  }, [
    routedMapRef,
    maplibreMap,
    config.snappingEnabled,
    config.snappingMinZoom,
    setSnappingLatlng,
  ]);
  return null;
}
