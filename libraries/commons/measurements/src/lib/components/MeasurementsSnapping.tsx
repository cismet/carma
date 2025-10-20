import { useEffect, useRef, useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { adjustClickPosition } from "../utils/helper";
import { useMapMeasurementsContext } from "../components/MapMeasurementsProvider";

export function MeasurementsSnapping({ maplibreMap }: { maplibreMap: any }) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const [queryRadius, setQueryRadius] = useState(40);
  const [toleranceRadius, setToleranceRadius] = useState(36);
  const { shapes } = useMapMeasurementsContext();
  const queryRadiusRef = useRef(queryRadius);
  const toleranceRadiusRef = useRef(toleranceRadius);
  const circleMarkerRef = useRef<any>(null);
  const toleranceCircleMarkerRef = useRef<any>(null);
  const verticesRef = useRef<{ latlng: any; shapeId?: number | string }[]>([]);
  const blackCursorRef = useRef<any>(null);
  const isMeasurementLayer = (layer: any): boolean => {
    const className = layer?.options?.className === "custom-polyline";

    console.log("xxx ", className);

    return className;
  };

  useEffect(() => {
    queryRadiusRef.current = queryRadius;
  }, [queryRadius]);

  useEffect(() => {
    toleranceRadiusRef.current = toleranceRadius;
  }, [toleranceRadius]);

  useEffect(() => {
    const leafletMap = routedMapRef?.leafletMap?.leafletElement;

    if (leafletMap && typeof leafletMap.on === "function") {
      // Import L from leaflet
      const L = (window as any).L;
      let closestPoint: any = null;

      // leafletMap.eachLayer((layer: any) => {
      //   const isItMeasurementLayer = isMeasurementLayer(layer);
      //   if (isItMeasurementLayer) {
      //     console.log("xxx isItMeasurementLayer", layer);
      //   }
      // });

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
        // Check zoom level - only work if zoom >= 17
        const currentZoom = leafletMap.getZoom();
        if (currentZoom < 17) {
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

        // Create new outer circle at mouse position with radius in pixels
        // circleMarkerRef.current = L.circleMarker(e.latlng, {
        //   radius: queryRadius,
        //   color: "#ffffff",
        //   fillColor: "#ffffff",
        //   fillOpacity: 0.2,
        //   weight: 2,
        //   opacity: 0.5,
        // }).addTo(leafletMap);

        // toleranceCircleMarkerRef.current = L.circleMarker(e.latlng, {
        //   radius: toleranceRadius,
        //   color: "#00ff00",
        //   fillColor: "#00ff00",
        //   fillOpacity: 0.15,
        //   weight: 2,
        //   opacity: 0.6,
        // }).addTo(leafletMap);

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

            // Normalize measurement shapes into point features (lng,lat order)
            shapes.forEach((shape: any) => {
              const type = (
                shape.shapeType ||
                shape.shapeTy ||
                ""
              ).toLowerCase();
              const coords = shape.coordinates || [];

              if (type === "polygon") {
                // coords may be [ ring1, ring2, ... ] or possibly a single ring (flat)
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
                      properties: { fromShape: true, shapeId: shape.shapeId },
                    });
                  });
                });
              } else {
                // // polyline/line: coords is array of points
                // coords.forEach((pt: any[]) => {
                //   coordinatePoints.push({
                //     type: "Feature",
                //     geometry: {
                //       type: "Point",
                //       coordinates: [pt[1], pt[0]], // swap lat/lng to lng/lat
                //     },
                //     properties: { fromShape: true, shapeId: shape.shapeId },
                //   });
                // });
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

      // Add DOM listener in CAPTURE phase to intercept before Leaflet
      const mapContainer = leafletMap.getContainer();
      mapContainer.addEventListener(
        "mouseup",
        (event: MouseEvent) =>
          adjustClickPosition(event, closestPoint, "mouseup", leafletMap),
        true
      );
      mapContainer.addEventListener(
        "click",
        (event: MouseEvent) =>
          adjustClickPosition(event, closestPoint, "click", leafletMap),
        true
      );

      // Cleanup function to remove listeners and circles
      return () => {
        leafletMap.off("mousemove", mousemoveHandler);
        leafletMap.off("mouseout", mouseoutHandler);
        mapContainer.removeEventListener("mouseup", adjustClickPosition);
        mapContainer.removeEventListener("click", adjustClickPosition);
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
  }, [routedMapRef, maplibreMap, shapes]);

  // useEffect(() => {
  //   const leafletMap = routedMapRef?.leafletMap?.leafletElement;
  //   if (!leafletMap) return;

  //   const L = (window as any).L;

  //   // 1) Build flattened vertex list from shapes (runs when shapes change)
  //   const buildVertices = (shapesList: any[]) => {
  //     const vertices: any[] = [];
  //     if (!Array.isArray(shapesList)) return vertices;

  //     shapesList.forEach((s) => {
  //       const coords = s.coordinates || [];
  //       const type = (s.shapeType || s.shapeTy || "").toLowerCase();

  //       if (type === "polygon") {
  //         // Ensure ring structure (coords could be [ [pt,pt,...] ] or a single ring)
  //         const rings = Array.isArray(coords[0][0]) ? coords : [coords];
  //         rings.forEach((ring: any[]) => {
  //           ring.forEach((pt) => {
  //             // pt is [lat, lng]
  //             vertices.push({
  //               latlng: L.latLng(pt[0], pt[1]),
  //               shapeId: s.shapeId ?? s.id,
  //             });
  //           });
  //         });
  //       } else {
  //         // line / polyline: coords is array of [lat, lng]
  //         coords.forEach((pt: any[]) => {
  //           vertices.push({
  //             latlng: L.latLng(pt[0], pt[1]),
  //             shapeId: s.shapeId ?? s.id,
  //           });
  //         });
  //       }
  //     });

  //     return vertices;
  //   };

  //   verticesRef.current = buildVertices(shapes || []);

  //   // 2) Mousemove handler: compute closest vertex in container pixels
  //   const onMouseMove = (e: any) => {
  //     // pick query radius in pixels
  //     const currentRadius = queryRadiusRef.current ?? 40;
  //     const currentRadiusSq = currentRadius * currentRadius;

  //     // mouse container point (Leaflet convenience)
  //     // Use leafletMap.mouseEventToContainerPoint or latlngToContainerPoint
  //     // since you already have e.containerPoint sometimes; but we'll compute from client
  //     const container = leafletMap.getContainer();
  //     const rect = container.getBoundingClientRect();
  //     // containerPoint in CSS pixels relative to container
  //     const mousePoint = {
  //       x: e.originalEvent.clientX - rect.left,
  //       y: e.originalEvent.clientY - rect.top,
  //     };

  //     // Prepare best
  //     let best = {
  //       d2: Infinity,
  //       vertexLatLng: null as any,
  //       shapeId: null as any,
  //     };

  //     const verts = verticesRef.current || [];
  //     // iterate vertices and compute distance in container (pixel) space
  //     for (let i = 0; i < verts.length; i++) {
  //       const v = verts[i];
  //       // convert vertex latlng to container point (pixel coords relative to container)
  //       const pt = leafletMap.latLngToContainerPoint(v.latlng);
  //       const dx = pt.x - mousePoint.x;
  //       const dy = pt.y - mousePoint.y;
  //       const d2 = dx * dx + dy * dy;
  //       if (d2 < best.d2) {
  //         best = { d2, vertexLatLng: v.latlng, shapeId: v.shapeId };
  //       }
  //     }

  //     // Create/move black cursor marker: store in ref so same instance is reused
  //     if (!blackCursorRef.current) {
  //       blackCursorRef.current = L.circleMarker(e.latlng, {
  //         radius: 5,
  //         color: "#000000",
  //         weight: 1,
  //         fillColor: "#000000",
  //         fillOpacity: 0.8,
  //         interactive: false,
  //         pane: "markerPane",
  //       }).addTo(leafletMap);
  //     }

  //     // If best vertex inside query radius => snap to vertex; else follow mouse
  //     if (best.d2 <= currentRadiusSq && best.vertexLatLng) {
  //       blackCursorRef.current.setLatLng(best.vertexLatLng);
  //     } else {
  //       // set to raw mouse latlng (no snap)
  //       blackCursorRef.current.setLatLng(e.latlng);
  //     }
  //   };

  //   const onMouseOut = () => {
  //     if (blackCursorRef.current) {
  //       leafletMap.removeLayer(blackCursorRef.current);
  //       blackCursorRef.current = null;
  //     }
  //   };

  //   leafletMap.on("mousemove", onMouseMove);
  //   leafletMap.on("mouseout", onMouseOut);

  //   return () => {
  //     leafletMap.off("mousemove", onMouseMove);
  //     leafletMap.off("mouseout", onMouseOut);
  //     if (blackCursorRef.current) {
  //       leafletMap.removeLayer(blackCursorRef.current);
  //       blackCursorRef.current = null;
  //     }
  //   };
  // }, [routedMapRef, shapes]);

  return null;
}
