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
  maplibreMaps,
}: {
  maplibreMaps: any[];
}) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { shapes, setSnappingLatlng, config, currentDrawHandler, status } =
    useMapMeasurementsContext();
  const [queryRadius, setQueryRadius] = useState(config.snappingQueryRadius);
  const queryRadiusRef = useRef(queryRadius);
  const circleMarkerRef = useRef<any>(null);
  const snappingIndicatorRef = useRef<any>(null); // Leaflet marker for snapping point
  const shapesRef = useRef(shapes);

  // Use config directly
  const snappingEnabled = config.snappingEnabled;
  const snappingEnabledRef = useRef(snappingEnabled);
  const maplibreMapsRef = useRef(maplibreMaps);
  const lastHoveredMarkerRef = useRef<any>(null);
  const isDraggingVertexRef = useRef(false);
  const currentDrawHandlerRef = useRef(currentDrawHandler);
  const lastSnappedCoordRef = useRef<[number, number] | null>(null);
  const statusRef = useRef(status);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    queryRadiusRef.current = queryRadius;
  }, [queryRadius]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    snappingEnabledRef.current = snappingEnabled;
  }, [snappingEnabled]);

  useEffect(() => {
    maplibreMapsRef.current = maplibreMaps;
  }, [maplibreMaps]);

  useEffect(() => {
    currentDrawHandlerRef.current = currentDrawHandler;
  }, [currentDrawHandler]);

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

      // Clear cursor on all MapLibre maps
      maplibreMaps.forEach((map) => {
        if (map && map.getCanvas) {
          map.getCanvas().style.cursor = "";
        }
      });

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
      const closestPointRef = { current: null as any }; // Stable ref to preserve closestPoint

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
          // Clear cursor on all MapLibre maps
          maplibreMaps.forEach((map) => {
            if (map && map.getCanvas) {
              map.getCanvas().style.cursor = "";
            }
          });
          closestPoint = null;
          closestPointRef.current = null;
        } catch (_) {
          // no-op safeguard
        }
      };

      const mousemoveHandler = (e: any) => {
        // Skip snapping indicator during vertex drag if snappingOnUpdate is disabled
        if (isDraggingVertexRef.current && !config.snappingOnUpdate) {
          clearBlackPoint();
          return;
        }

        // Check if ALT key is pressed - if so, disable snapping temporarily
        if (e.originalEvent.altKey) {
          clearBlackPoint();
          if (circleMarkerRef.current) {
            leafletMap.removeLayer(circleMarkerRef.current);
            circleMarkerRef.current = null;
          }
          if (setSnappingLatlng) {
            setSnappingLatlng(null);
          }
          return; // Exit early - no snapping while ALT is pressed
        }

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

        const currentMaplibreMaps = maplibreMapsRef.current;

        // Get mouse position in lat/lng using Leaflet (always available)
        const mouseLatLng = leafletMap.mouseEventToLatLng(e.originalEvent);
        const mousePoint = leafletMap.latLngToContainerPoint(mouseLatLng);

        const currentRadius = queryRadiusRef.current;

        // Show radius circle if enabled and in WAITING or DRAWING status
        if (
          config.snappingRadiusVisible &&
          (statusRef.current === "WAITING" || statusRef.current === "DRAWING")
        ) {
          // Convert pixel radius to meters for the circle
          const metersPerPixel =
            (156543.03392 * Math.cos((mouseLatLng.lat * Math.PI) / 180)) /
            Math.pow(2, currentZoom);
          const radiusInMeters = currentRadius * metersPerPixel;

          circleMarkerRef.current = L.circle(mouseLatLng, {
            radius: radiusInMeters,
            color: "#ffffff",
            fillColor: "#ffffff",
            fillOpacity: 0.15,
            weight: 1,
            opacity: 0.4,
            interactive: false, // Don't capture mouse events
          }).addTo(leafletMap);
        }
        const coordinatePoints: SnappingPoint[] = [];

        // 1. Extract from vector features (loop through all MapLibre maps)
        currentMaplibreMaps.forEach((currentMaplibreMap) => {
          if (
            currentMaplibreMap &&
            currentMaplibreMap.getStyle &&
            currentMaplibreMap.getCanvas
          ) {
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

                const features = currentMaplibreMap.queryRenderedFeatures(
                  bbox,
                  {
                    layers: style.layers
                      .filter((layer: any) => {
                        // Skip layers with skipSnapping metadata
                        const skipSnapping =
                          layer.metadata?.carmaConf?.skipSnapping;
                        return (
                          !skipSnapping && !layer.id.startsWith("highlight-")
                        ); // if we have a layer with highlight- dont snap (thats only important if we are doing the snap vis dot in maplibre directly not atm. but we will keep it in here)
                      })
                      .map((layer: any) => layer.id),
                  }
                );

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
        });

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

        // 3. Extract from in-progress drawing (if currently drawing)
        const currentDrawHandlerValue = currentDrawHandlerRef.current;
        if (
          currentDrawHandlerValue &&
          currentDrawHandlerValue._poly &&
          currentDrawHandlerValue._poly._latlngs
        ) {
          const drawingLatLngs = currentDrawHandlerValue._poly._latlngs;
          drawingLatLngs.forEach((latlng: any) => {
            coordinatePoints.push({
              coordinates: [latlng.lng, latlng.lat],
              sourceId: "drawing-in-progress",
            });
          });
        }

        // Filter points to only those within the query radius and calculate distances
        // Use Leaflet for coordinate projection (works without MapLibre)
        const filteredPointsWithDistance = coordinatePoints
          .map((snappingPoint: SnappingPoint) => {
            const coord = snappingPoint.coordinates;
            const pointLatLng = L.latLng(coord[1], coord[0]); // [lng, lat] -> L.latLng(lat, lng)
            const projectedPoint =
              leafletMap.latLngToContainerPoint(pointLatLng);

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
            properties: {
              black: true,
              source: closestItem.snappingPoint.sourceId, // Pass source for polygon closure check
            },
          });
          isSnapped = true;
        }
        closestPoint = blackPoint[0];
        closestPointRef.current = blackPoint[0];

        const finalLatLng = toLatLngFromClosestPoint(closestPoint);
        if (finalLatLng && setSnappingLatlng) {
          // Check if we're snapping to the first vertex of an in-progress drawing
          // If so, only allow snapping if we're within the query radius (prevents premature polygon closure)
          let shouldSnap = true;
          if (
            currentDrawHandlerValue &&
            currentDrawHandlerValue._markers &&
            currentDrawHandlerValue._poly?._latlngs &&
            currentDrawHandlerValue._poly._latlngs.length >= 3
          ) {
            const firstVertex = currentDrawHandlerValue._poly._latlngs[0];
            const threshold = 0.0001; // ~11 meters

            // Check if finalLatLng matches first vertex
            if (
              Math.abs(finalLatLng.lat - firstVertex.lat) < threshold &&
              Math.abs(finalLatLng.lng - firstVertex.lng) < threshold
            ) {
              // We're trying to snap to first vertex - check pixel distance from mouse
              const map = routedMapRef.current?.leafletMap?.leafletElement;
              if (map && e.latlng) {
                const mousePoint = map.latLngToContainerPoint(e.latlng);
                const vertexPoint = map.latLngToContainerPoint(firstVertex);
                const pixelDistance = Math.sqrt(
                  Math.pow(mousePoint.x - vertexPoint.x, 2) +
                    Math.pow(mousePoint.y - vertexPoint.y, 2)
                );

                // Only snap if mouse is within query radius
                if (pixelDistance > queryRadius) {
                  shouldSnap = false;
                }
              }
            }
          }

          if (shouldSnap) {
            setSnappingLatlng(finalLatLng);
          } else {
            setSnappingLatlng(null);
          }
        }

        // Trigger vertex marker hover for tooltip/area preview (Phase 3)
        // Check if we snapped to the first vertex of in-progress drawing
        if (
          isSnapped &&
          currentDrawHandlerValue &&
          currentDrawHandlerValue._markers &&
          shortestIndex !== -1
        ) {
          const latlngs = currentDrawHandlerValue._poly?._latlngs;
          if (latlngs && latlngs.length >= 3) {
            const firstVertex = latlngs[0];
            const snappedItem = filteredPointsWithDistance[shortestIndex];
            const snappedCoord = snappedItem.snappingPoint.coordinates;
            const threshold = 0.0001; // ~11 meters

            // Check if snapped point matches first vertex coordinates (regardless of source)
            // This handles both drawing-in-progress points AND vector features at same location
            if (
              Math.abs(snappedCoord[1] - firstVertex.lat) < threshold &&
              Math.abs(snappedCoord[0] - firstVertex.lng) < threshold
            ) {
              // Fire mouseover on first vertex marker to show area preview
              const firstMarker = currentDrawHandlerValue._markers[0];
              if (firstMarker && lastHoveredMarkerRef.current !== firstMarker) {
                lastHoveredMarkerRef.current = firstMarker;
                firstMarker.fire("mouseover", { target: firstMarker });
              }
            } else {
              // Snapped to different point - fire mouseout
              if (lastHoveredMarkerRef.current) {
                lastHoveredMarkerRef.current.fire("mouseout", {
                  target: lastHoveredMarkerRef.current,
                });
                lastHoveredMarkerRef.current = null;
              }
            }
          }
        } else {
          // Not snapped or no drawing - fire mouseout if we were hovering
          if (lastHoveredMarkerRef.current) {
            lastHoveredMarkerRef.current.fire("mouseout", {
              target: lastHoveredMarkerRef.current,
            });
            lastHoveredMarkerRef.current = null;
          }
        }

        // Only update indicator if snap position changed
        const currentCoord: [number, number] | null =
          finalLatLng && isSnapped ? [finalLatLng.lng, finalLatLng.lat] : null;

        const lastCoord = lastSnappedCoordRef.current;
        const coordChanged =
          !lastCoord ||
          !currentCoord ||
          Math.abs(lastCoord[0] - currentCoord[0]) > 0.00001 ||
          Math.abs(lastCoord[1] - currentCoord[1]) > 0.00001;

        if (coordChanged) {
          // Remove old snapping indicator if exists
          if (snappingIndicatorRef.current) {
            leafletMap.removeLayer(snappingIndicatorRef.current);
            snappingIndicatorRef.current = null;
          }

          // Create Leaflet marker for snapping indicator ONLY when snapped
          // Match the size of measurement handles (8px total = 4px radius)
          if (
            finalLatLng &&
            isSnapped &&
            (statusRef.current === "WAITING" || statusRef.current === "DRAWING")
          ) {
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

          lastSnappedCoordRef.current = currentCoord;
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

      // Phase 4: Show snap indicator during vertex drag
      const vertexDragHandler = (e: any) => {
        isDraggingVertexRef.current = true;

        if (!snappingEnabledRef.current || !config.snappingOnUpdate) return;

        const vertex = e.vertex;
        if (!vertex) return;

        // Get current vertex position during drag
        const vertexLatLng = vertex.latlng;
        const vertexPoint = leafletMap.latLngToContainerPoint(vertexLatLng);

        const currentRadius = queryRadiusRef.current;
        const coordinatePoints: SnappingPoint[] = [];

        // Extract snap points from vector features
        const currentMaplibreMaps = maplibreMapsRef.current;
        currentMaplibreMaps.forEach((currentMaplibreMap) => {
          if (
            currentMaplibreMap &&
            currentMaplibreMap.getStyle &&
            currentMaplibreMap.getCanvas
          ) {
            try {
              const style = currentMaplibreMap.getStyle();
              if (style && style.layers) {
                const canvas = currentMaplibreMap.getCanvas();
                const rect = canvas.getBoundingClientRect();

                // Convert Leaflet container point to MapLibre canvas point
                const mapContainer = leafletMap.getContainer();
                const mapRect = mapContainer.getBoundingClientRect();
                const canvasX = vertexPoint.x + mapRect.left - rect.left;
                const canvasY = vertexPoint.y + mapRect.top - rect.top;

                const bbox = [
                  [canvasX - currentRadius, canvasY - currentRadius],
                  [canvasX + currentRadius, canvasY + currentRadius],
                ];

                const features = currentMaplibreMap.queryRenderedFeatures(
                  bbox,
                  {
                    layers: style.layers
                      .filter((layer: any) => {
                        // Skip layers with skipSnapping metadata
                        const skipSnapping =
                          layer.metadata?.carmaConf?.skipSnapping;
                        return (
                          !skipSnapping && !layer.id.startsWith("highlight-")
                        );
                      })
                      .map((layer: any) => layer.id),
                  }
                );

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
        });

        // Extract from other measurement shapes
        const currentShapes = shapesRef.current;
        currentShapes.forEach((shape: any) => {
          const points = extractPointsFromMeasurementShape(
            shape,
            "measurements"
          );
          coordinatePoints.push(...points);
        });

        // Filter out the vertex being dragged (exclude self-snapping)
        const threshold = 0.00001; // Very small threshold to identify same point
        const filteredCoordinatePoints = coordinatePoints.filter((point) => {
          const pointLatLng = L.latLng(
            point.coordinates[1],
            point.coordinates[0]
          );
          return !(
            Math.abs(pointLatLng.lat - vertexLatLng.lat) < threshold &&
            Math.abs(pointLatLng.lng - vertexLatLng.lng) < threshold
          );
        });

        // Find closest point within radius
        const filteredPointsWithDistance = filteredCoordinatePoints
          .map((snappingPoint: SnappingPoint) => {
            const coord = snappingPoint.coordinates;
            const pointLatLng = L.latLng(coord[1], coord[0]);
            const projectedPoint =
              leafletMap.latLngToContainerPoint(pointLatLng);

            const dx = projectedPoint.x - vertexPoint.x;
            const dy = projectedPoint.y - vertexPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            return { snappingPoint, distance };
          })
          .filter((item) => item.distance <= currentRadius);

        // Remove old indicator
        if (snappingIndicatorRef.current) {
          leafletMap.removeLayer(snappingIndicatorRef.current);
          snappingIndicatorRef.current = null;
        }

        if (filteredPointsWithDistance.length > 0) {
          // Find shortest distance
          let shortestDistance = Infinity;
          let shortestIndex = -1;
          filteredPointsWithDistance.forEach((item, index) => {
            if (item.distance < shortestDistance) {
              shortestDistance = item.distance;
              shortestIndex = index;
            }
          });

          if (shortestIndex !== -1) {
            const closestItem = filteredPointsWithDistance[shortestIndex];
            const snappedCoord = closestItem.snappingPoint.coordinates;
            // Show snap indicator at target location
            snappingIndicatorRef.current = L.circleMarker(
              [snappedCoord[1], snappedCoord[0]],
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
        }
      };

      leafletMap.on("editable:vertex:drag", vertexDragHandler);

      // Phase 4: Snap vertex AFTER drag ends
      const vertexDragEndHandler = (e: any) => {
        isDraggingVertexRef.current = false;

        if (!snappingEnabledRef.current || !config.snappingOnUpdate) return;

        const vertex = e.vertex;
        if (!vertex) return;

        // Get final vertex position after drag
        const vertexLatLng = vertex.latlng;
        const vertexPoint = leafletMap.latLngToContainerPoint(vertexLatLng);

        const currentRadius = queryRadiusRef.current;
        const coordinatePoints: SnappingPoint[] = [];

        // Extract snap points from vector features
        const currentMaplibreMaps = maplibreMapsRef.current;
        currentMaplibreMaps.forEach((currentMaplibreMap) => {
          if (
            currentMaplibreMap &&
            currentMaplibreMap.getStyle &&
            currentMaplibreMap.getCanvas
          ) {
            try {
              const style = currentMaplibreMap.getStyle();
              if (style && style.layers) {
                const canvas = currentMaplibreMap.getCanvas();
                const rect = canvas.getBoundingClientRect();

                // Convert Leaflet container point to MapLibre canvas point
                const mapContainer = leafletMap.getContainer();
                const mapRect = mapContainer.getBoundingClientRect();
                const canvasX = vertexPoint.x + mapRect.left - rect.left;
                const canvasY = vertexPoint.y + mapRect.top - rect.top;

                const bbox = [
                  [canvasX - currentRadius, canvasY - currentRadius],
                  [canvasX + currentRadius, canvasY + currentRadius],
                ];

                const features = currentMaplibreMap.queryRenderedFeatures(
                  bbox,
                  {
                    layers: style.layers
                      .filter((layer: any) => {
                        // Skip layers with skipSnapping metadata
                        const skipSnapping =
                          layer.metadata?.carmaConf?.skipSnapping;
                        return (
                          !skipSnapping && !layer.id.startsWith("highlight-")
                        );
                      })
                      .map((layer: any) => layer.id),
                  }
                );

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
        });

        // Extract from other measurement shapes
        const currentShapes = shapesRef.current;
        currentShapes.forEach((shape: any) => {
          const points = extractPointsFromMeasurementShape(
            shape,
            "measurements"
          );
          coordinatePoints.push(...points);
        });

        // Filter out the vertex being dragged (exclude self-snapping)
        const threshold = 0.00001; // Very small threshold to identify same point
        const filteredCoordinatePoints = coordinatePoints.filter((point) => {
          const pointLatLng = L.latLng(
            point.coordinates[1],
            point.coordinates[0]
          );
          return !(
            Math.abs(pointLatLng.lat - vertexLatLng.lat) < threshold &&
            Math.abs(pointLatLng.lng - vertexLatLng.lng) < threshold
          );
        });

        // Find closest point within radius
        const filteredPointsWithDistance = filteredCoordinatePoints
          .map((snappingPoint: SnappingPoint) => {
            const coord = snappingPoint.coordinates;
            const pointLatLng = L.latLng(coord[1], coord[0]);
            const projectedPoint =
              leafletMap.latLngToContainerPoint(pointLatLng);

            const dx = projectedPoint.x - vertexPoint.x;
            const dy = projectedPoint.y - vertexPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            return { snappingPoint, distance };
          })
          .filter((item) => item.distance <= currentRadius);

        if (filteredPointsWithDistance.length > 0) {
          // Find shortest distance
          let shortestDistance = Infinity;
          let shortestIndex = -1;
          filteredPointsWithDistance.forEach((item, index) => {
            if (item.distance < shortestDistance) {
              shortestDistance = item.distance;
              shortestIndex = index;
            }
          });

          if (shortestIndex !== -1) {
            const closestItem = filteredPointsWithDistance[shortestIndex];
            const snappedCoord = closestItem.snappingPoint.coordinates;
            // Snap vertex to final position
            vertex.latlng.lat = snappedCoord[1];
            vertex.latlng.lng = snappedCoord[0];
            vertex.update();
            // Force complete refresh of the editor to recalculate middle markers
            if (e.layer.editor) {
              // Reset the editor to force recalculation
              e.layer.editor.reset();
            }
            e.layer.redraw();
          }
        }
      };

      leafletMap.on("editable:vertex:dragend", vertexDragEndHandler);

      // Add DOM listener in CAPTURE phase to intercept before Leaflet
      const mapContainer = leafletMap.getContainer();
      const mouseupHandler = (event: MouseEvent) => {
        // Only adjust if snapping is enabled
        if (snappingEnabledRef.current) {
          const snapPoint = closestPointRef.current;
          adjustClickPosition(
            event,
            snapPoint,
            "mouseup",
            leafletMap,
            currentDrawHandlerRef.current
          );
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
        leafletMap.off("editable:vertex:drag", vertexDragHandler);
        leafletMap.off("editable:vertex:dragend", vertexDragEndHandler);
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
    snappingEnabled,
    config.snappingMinZoom,
    setSnappingLatlng,
  ]);
  return null;
}
