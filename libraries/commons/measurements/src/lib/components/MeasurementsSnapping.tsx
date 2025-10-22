import { useEffect, useRef, useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { adjustClickPosition, toLatLngFromClosestPoint } from "../utils/helper";
import { useMapMeasurementsContext } from "../components/MapMeasurementsProvider";

export function MeasurementsSnapping({ maplibreMap }: { maplibreMap: any }) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { shapes, setSnappingLatlng, config } = useMapMeasurementsContext();
  const [queryRadius, setQueryRadius] = useState(config.snappingQueryRadius);
  const [toleranceRadius, setToleranceRadius] = useState(config.snappingToleranceRadius);
  const queryRadiusRef = useRef(queryRadius);
  const toleranceRadiusRef = useRef(toleranceRadius);
  const circleMarkerRef = useRef<any>(null);
  const toleranceCircleMarkerRef = useRef<any>(null);
  const shapesRef = useRef(shapes);
  const snappingEnabledRef = useRef(config.snappingEnabled);

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

        // Get the MapLibre canvas position relative to the page
        if (maplibreMap) {
          const canvas = maplibreMap.getCanvas();
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
          let features = maplibreMap.queryRenderedFeatures(bbox, {
            layers: maplibreMap
              .getStyle()
              .layers.map((layer: any) => layer.id)
              .filter((id: string) => !id.startsWith("highlight-")),
          });

          if (features.length > 0 || shapesRef.current.length > 0) {
            maplibreMap.getCanvas().style.cursor = "pointer";
            const coordinatePoints: any[] = [];

            features.forEach((feature: any) => {
              const geometry = feature.geometry;

              // Extract coordinates based on geometry type
              if (geometry.type === "Point") {
                coordinatePoints.push({
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: geometry.coordinates,
                  },
                  properties: {},
                });
              } else if (geometry.type === "LineString") {
                geometry.coordinates.forEach((coord: any) => {
                  coordinatePoints.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: coord,
                    },
                    properties: {},
                  });
                });
              } else if (geometry.type === "Polygon") {
                geometry.coordinates.forEach((ring: any) => {
                  ring.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                });
              } else if (geometry.type === "MultiPoint") {
                geometry.coordinates.forEach((coord: any) => {
                  coordinatePoints.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: coord,
                    },
                    properties: {},
                  });
                });
              } else if (geometry.type === "MultiLineString") {
                geometry.coordinates.forEach((line: any) => {
                  line.forEach((coord: any) => {
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: coord,
                      },
                      properties: {},
                    });
                  });
                });
              } else if (geometry.type === "MultiPolygon") {
                geometry.coordinates.forEach((polygon: any) => {
                  polygon.forEach((ring: any) => {
                    ring.forEach((coord: any) => {
                      coordinatePoints.push({
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: coord,
                        },
                        properties: {},
                      });
                    });
                  });
                });
              }
            });

            // Normalize measurement shapes into point features (lng,lat order)
            shapesRef.current.forEach((shape: any) => {
              const type = (
                shape.shapeType ||
                shape.shapeTy ||
                ""
              ).toLowerCase();
              const coords = shape.coordinates || [];

              if (type === "polygon") {
                const rings = Array.isArray(coords[0][0]) ? coords : [coords];

                rings.forEach((ring: any[]) => {
                  ring.forEach((pt: any[]) => {
                    // pt is [lat, lng] — swap to [lng, lat] for MapLibre
                    coordinatePoints.push({
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: [pt[1], pt[0]],
                      },
                      properties: {},
                    });
                  });
                });
              } else {
                // polyline/line: coords is array of points
                coords.forEach((pt: any[]) => {
                  coordinatePoints.push({
                    type: "Feature",
                    geometry: {
                      type: "Point",
                      coordinates: [pt[1], pt[0]], // swap lat/lng to lng/lat
                    },
                    properties: {},
                  });
                });
              }
            });

            // Filter points to only those within the circle radius and calculate distances
            const filteredPointsWithDistance = coordinatePoints
              .map((pointFeature: any) => {
                const coord = pointFeature.geometry.coordinates;
                const projectedPoint = maplibreMap.project(coord);

                const dx = projectedPoint.x - point.x;
                const dy = projectedPoint.y - point.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                return { pointFeature, distance };
              })
              .filter((item: any) => item.distance <= currentRadius);

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
            const mouseLatLng = maplibreMap.unproject([point.x, point.y]);

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
                  geometry: closestItem.pointFeature.geometry,
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
            maplibreMap.getSource("highlight").setData({
              type: "FeatureCollection",
              features: blackPoint,
            });
          } else {
            maplibreMap.getCanvas().style.cursor = "";
            // Clear highlights
            maplibreMap.getSource("highlight").setData({
              type: "FeatureCollection",
              features: [],
            });
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
  }, [routedMapRef, maplibreMap, config.snappingEnabled, config.snappingMinZoom, setSnappingLatlng]);
  return null;
}
