import { useEffect, useState, useRef, useContext } from "react";
import { useMapLibreMap } from "../hooks/useMapLibreMap";
import {
  TopicMapDispatchContext,
  TopicMapContext,
} from "react-cismap/contexts/TopicMapContextProvider";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";

export function MeasurementsSnapping() {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const { maplibreMap } = useMapLibreMap();
  const queryRadius = 165;
  const toleranceRadius = 77;
  const queryRadiusRef = useRef(queryRadius);
  const toleranceRadiusRef = useRef(toleranceRadius);
  const circleMarkerRef = useRef<any>(null);
  const toleranceCircleMarkerRef = useRef<any>(null);
  const { zoomToFeature } = useContext(TopicMapDispatchContext) as any;
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  useEffect(() => {
    const leafletMap = routedMapRef?.leafletMap?.leafletElement;
    console.log("xxx 1111", leafletMap);

    if (leafletMap && typeof leafletMap.on === "function") {
      console.log("xxx leafletMap", leafletMap);
      console.log("xxx maplibreMap", maplibreMap);
      // Import L from leaflet
      const L = (window as any).L;
      let closestPoint: any = null;

      const mousemoveHandler = (e: any) => {
        // Check zoom level - only work if zoom >= 17
        const currentZoom = leafletMap.getZoom();
        if (currentZoom < 17) {
          // Remove circles if zoom is too low
          if (circleMarkerRef.current) {
            leafletMap.removeLayer(circleMarkerRef.current);
            circleMarkerRef.current = null;
          }
          if (toleranceCircleMarkerRef.current) {
            leafletMap.removeLayer(toleranceCircleMarkerRef.current);
            toleranceCircleMarkerRef.current = null;
          }
          return; // Exit early
        }

        // Remove old circles if exist
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
        }
        if (toleranceCircleMarkerRef.current) {
          leafletMap.removeLayer(toleranceCircleMarkerRef.current);
        }

        // Create new outer circle at mouse position with radius in pixels
        circleMarkerRef.current = L.circleMarker(e.latlng, {
          radius: queryRadius,
          color: "#ffffff",
          fillColor: "#ffffff",
          fillOpacity: 0.2,
          weight: 2,
          opacity: 0.5,
        }).addTo(leafletMap);

        toleranceCircleMarkerRef.current = L.circleMarker(e.latlng, {
          radius: toleranceRadius,
          color: "#00ff00",
          fillColor: "#00ff00",
          fillOpacity: 0.15,
          weight: 2,
          opacity: 0.6,
        }).addTo(leafletMap);
        console.log("xxx circleMarkerRef", circleMarkerRef.current);

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

          if (features.length > 0) {
            maplibreMap.getCanvas().style.cursor = "pointer";
            // Mode 6: Serious - only show the closest point in black, no lines
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

      // Cleanup function to remove listeners and circles
      return () => {
        leafletMap.off("mousemove", mousemoveHandler);
        leafletMap.off("mouseout", mouseoutHandler);
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
  }, [routedMapRef, maplibreMap]);

  return null;
}
