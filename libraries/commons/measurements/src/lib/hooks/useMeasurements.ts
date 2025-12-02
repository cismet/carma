import React, { useState, useEffect, useContext, useRef } from "react";

import { Map as MapLibreMap } from "maplibre-gl";

import L from "leaflet";
import "leaflet-draw";
import "leaflet-editable";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import "../utils/measure";
import "../utils/measure-path";
import useDeviceDetection from "../hooks/useDeviceDetection";
import { useMapMeasurementsContext } from "../context";
import {
  adjustClickPosition,
  toLatLngFromClosestPoint,
  filterArrByIds,
  findLargestNumber,
} from "../utils/helper";
import { SnappingPoint } from "./../types";
import { extractPointsFromMeasurementShape } from "../snapping/utils/coordinateExtraction";
import { getSnappingPointsFromMapLibre } from "../snapping/utils/mapLibreExtraction";

import "../styles/m-style.css";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-measure-path/leaflet-measure-path.css";

export interface MeasurementShapeDrawing {
  shapeId: number | string;
  number: number;
  coordinates?: unknown;
  [key: string]: unknown;
}

export const useMeasurements = (snappingLayers: MapLibreMap[] = []) => {
  const { realRoutedMapRef } =
    useContext<typeof TopicMapContext>(TopicMapContext);
  const {
    isMeasurementEnabled,
    activeShape,
    setActiveShape,
    shapes,
    setShapes,
    addShape,
    deleteAll,
    setDeleteAll,
    setUpdateShape,
    visibleShapes,
    setVisibleShapes,
    drawingShape: ifDrawing,
    setDrawingShape,
    moveToShape,
    setMoveToShape,
    showAll,
    setShowAll,
    toggleMeasurementMode: toggleUIMode,
    setMapMovingEnd,
    deleteShapeById,
    updateShapeById,
    setLastVisibleShapeActive,
    setDrawingWithLastActiveShape,
    setActiveShapeIfDrawCancelled,
    updateAreaOfDrawing,
    deleteVisibleShapeById,
    config,
  } = useMapMeasurementsContext();

  // Local state for drawing logic
  const [status, setStatus] = useState<string>("INACTIVE");
  const currentDrawHandlerRef = useRef<any>(null);
  const snappingLatlngRef = useRef<any>(null);
  const [measureControl, setMeasureControl] = useState<any>(null);

  // Helper to update status
  const setCurrentDrawHandler = (handler: any) => {
    currentDrawHandlerRef.current = handler;
  };

  // destructure config for snapping
  const {
    snappingQueryRadius,
    snappingMinZoom,
    snappingOnUpdate,
    snappingRadiusVisible,
  } = config;

  const queryRadiusRef = useRef(snappingQueryRadius);
  const circleMarkerRef = useRef<any>(null);
  const snappingIndicatorRef = useRef<any>(null); // Leaflet marker for snapping point
  const shapesRef = useRef(shapes);

  const snappingLayersRef = useRef(snappingLayers);
  const lastHoveredMarkerRef = useRef<any>(null);
  const isDraggingVertexRef = useRef(false);
  const lastSnappedCoordRef = useRef<[number, number] | null>(null);
  const statusRef = useRef(status);

  useEffect(() => {
    snappingLayersRef.current = snappingLayers;
  }, [snappingLayers]);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    queryRadiusRef.current = snappingQueryRadius;
  }, [snappingQueryRadius]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    const leafletMap = realRoutedMapRef.current?.leafletMap?.leafletElement;

    if (
      isMeasurementEnabled &&
      leafletMap &&
      typeof leafletMap.on === "function"
    ) {
      // Import L from leaflet
      let closestPoint: SnappingPoint | null = null;
      const closestPointRef = { current: null as SnappingPoint | null }; // Stable ref to preserve closestPoint

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
          snappingLayers.forEach((map) => {
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

      // Store last mouse event to re-trigger handlers on key press
      const lastMouseEventRef = { current: null as any };

      const updateTooltipTemplate = (isPressed: boolean) => {
        const snappingText = isPressed
          ? "Snapping deaktiviert"
          : `Snapping aktiv (${SNAPPING_MODIFIER_KEY} zum Deaktivieren)`;

        if (
          L.drawLocal &&
          L.drawLocal.draw &&
          L.drawLocal.draw.handlers &&
          L.drawLocal.draw.handlers.polyline
        ) {
          L.drawLocal.draw.handlers.polyline.tooltip.start = `Klicken, um den Startpunkt der Messung zu setzen.<br><span class="leaflet-draw-tooltip-subtext">${snappingText}</span>`;
          L.drawLocal.draw.handlers.polyline.tooltip.cont = `Klicken (ggf. mehrmals), um die nächsten Punkte des Linienzuges zu setzen.<br><span class="leaflet-draw-tooltip-subtext">${snappingText}</span>`;
        }
      };

      const mousemoveHandler = (e: MouseEvent) => {
        // Prevent infinite loop from synthetic events we generate for snapping
        if ((e as any)._isSyntheticSnapped) {
          return;
        }

        // If mouse button is pressed (e.g. panning), do not snap
        if (e.buttons !== 0) {
          if (!isDraggingVertexRef.current) {
            clearBlackPoint();
          }
          return;
        }

        lastMouseEventRef.current = e;

        // Update tooltip text based on Snapping Modifier Key
        const isPressed = isSnappingModifierPressed(e);
        updateTooltipTemplate(isPressed);

        // Force update of current tooltip if it exists
        // Removed to prevent clearing distance

        // Skip snapping indicator during vertex drag if snappingOnUpdate is disabled
        if (isDraggingVertexRef.current && !snappingOnUpdate) {
          clearBlackPoint();
          return;
        }

        // Check if Snapping Modifier Key is pressed - if so, disable snapping temporarily
        if (isPressed) {
          clearBlackPoint();
          if (circleMarkerRef.current) {
            leafletMap.removeLayer(circleMarkerRef.current);
            circleMarkerRef.current = null;
          }
          // Direct update to control instead of context
          if (measureControl) {
            measureControl.options.snappingLatlng = null;
          }
          snappingLatlngRef.current = null;
          return; // Exit early - no snapping while modifier is pressed
        }

        // Check zoom level - only work if zoom >= configured minimum
        const currentZoom = leafletMap.getZoom();

        if (currentZoom < snappingMinZoom) {
          clearBlackPoint();
          return;
        }

        // Remove old circle if exists
        if (circleMarkerRef.current) {
          leafletMap.removeLayer(circleMarkerRef.current);
        }

        const currentSnappingLayers = snappingLayersRef.current;

        // Get mouse position in lat/lng using Leaflet (always available)
        const mouseLatLng = leafletMap.mouseEventToLatLng(e);
        const mousePoint = leafletMap.latLngToContainerPoint(mouseLatLng);

        const currentRadius = queryRadiusRef.current;

        // Show radius circle if enabled and in WAITING or DRAWING status
        if (
          snappingRadiusVisible &&
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
        coordinatePoints.push(
          ...getSnappingPointsFromMapLibre(
            currentSnappingLayers,
            { x: e.clientX, y: e.clientY },
            currentRadius
          )
        );

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
        // Logic for updating snappingLatlng
        let newSnappingLatlng = null;

        if (finalLatLng) {
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
              const map = realRoutedMapRef.current?.leafletMap?.leafletElement;
              if (map && mouseLatLng) {
                const mousePoint = map.latLngToContainerPoint(mouseLatLng);
                const vertexPoint = map.latLngToContainerPoint(firstVertex);
                const pixelDistance = Math.sqrt(
                  Math.pow(mousePoint.x - vertexPoint.x, 2) +
                    Math.pow(mousePoint.y - vertexPoint.y, 2)
                );

                // Only snap if mouse is within query radius
                if (pixelDistance > queryRadiusRef.current) {
                  shouldSnap = false;
                }
              }
            }
          }

          if (shouldSnap) {
            newSnappingLatlng = finalLatLng;
          }
        }

        // Update ref and control directly
        snappingLatlngRef.current = newSnappingLatlng;
        if (measureControl) {
          measureControl.options.snappingLatlng = newSnappingLatlng;
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
            (statusRef.current === "WAITING" ||
              statusRef.current === "DRAWING" ||
              statusRef.current === "INACTIVE")
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
                interactive: false,
              }
            ).addTo(leafletMap);
          }

          lastSnappedCoordRef.current = currentCoord;
        }

        // Dispatch synthetic event for Leaflet Draw if snapped
        if (isSnapped && finalLatLng && !isPressed) {
          e.stopPropagation();
          e.stopImmediatePropagation();

          const mapContainer = leafletMap.getContainer();
          const rect = mapContainer.getBoundingClientRect();
          const point = leafletMap.latLngToContainerPoint(finalLatLng);

          const newEvent = new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.left + point.x,
            clientY: rect.top + point.y,
            screenX: e.screenX,
            screenY: e.screenY,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            buttons: e.buttons,
          });
          (newEvent as any)._isSyntheticSnapped = true;
          mapContainer.dispatchEvent(newEvent);
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

      const container = leafletMap.getContainer();
      container.addEventListener("mousemove", mousemoveHandler, {
        capture: true,
      });
      leafletMap.on("mouseout", mouseoutHandler);

      // Phase 4: Show snap indicator during vertex drag
      const vertexDragHandler = (e: any) => {
        isDraggingVertexRef.current = true;

        if (!snappingOnUpdate) return;

        const vertex = e.vertex;
        if (!vertex) return;

        // Get current vertex position during drag
        const vertexLatLng = vertex.latlng;
        const vertexPoint = leafletMap.latLngToContainerPoint(vertexLatLng);

        const currentRadius = queryRadiusRef.current;
        const coordinatePoints: SnappingPoint[] = [];

        // Extract snap points from vector features
        const currentMaplibreMaps = snappingLayersRef.current;
        const mapContainer = leafletMap.getContainer();
        const mapRect = mapContainer.getBoundingClientRect();
        const screenX = vertexPoint.x + mapRect.left;
        const screenY = vertexPoint.y + mapRect.top;

        coordinatePoints.push(
          ...getSnappingPointsFromMapLibre(
            currentMaplibreMaps,
            { x: screenX, y: screenY },
            currentRadius
          )
        );

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
                interactive: false, // Don't capture mouse events
              }
            ).addTo(leafletMap);
          }
        }
      };

      leafletMap.on("editable:vertex:drag", vertexDragHandler);

      // Phase 4: Snap vertex AFTER drag ends
      const vertexDragEndHandler = (e: any) => {
        isDraggingVertexRef.current = false;

        if (!snappingOnUpdate) return;

        const vertex = e.vertex;
        if (!vertex) return;

        // Get final vertex position after drag
        const vertexLatLng = vertex.latlng;
        const vertexPoint = leafletMap.latLngToContainerPoint(vertexLatLng);

        const currentRadius = queryRadiusRef.current;
        const coordinatePoints: SnappingPoint[] = [];

        // Extract snap points from vector features
        const currentMaplibreMaps = snappingLayersRef.current;
        const mapContainer = leafletMap.getContainer();
        const mapRect = mapContainer.getBoundingClientRect();
        const screenX = vertexPoint.x + mapRect.left;
        const screenY = vertexPoint.y + mapRect.top;

        coordinatePoints.push(
          ...getSnappingPointsFromMapLibre(
            currentMaplibreMaps,
            { x: screenX, y: screenY },
            currentRadius
          )
        );

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
        // Snapping is always enabled now
        const snapPoint = closestPointRef.current;

        console.log("[snapping] mouseupHandler called", {
          hasSnapPoint: !!snapPoint,
          snapCoords: snapPoint?.geometry?.coordinates,
          mouseX: event.clientX,
          mouseY: event.clientY,
          timestamp: Date.now(),
        });

        adjustClickPosition(
          event,
          snapPoint,
          "mouseup",
          leafletMap,
          currentDrawHandlerRef.current
        );
      };
      mapContainer.addEventListener("mouseup", mouseupHandler, true);

      // Keydown/keyup handlers for ALT key
      const handleKeyToggle = (isPressed: boolean) => {
        updateTooltipTemplate(isPressed);

        if (lastMouseEventRef.current) {
          const mapContainer = leafletMap.getContainer();
          const originalEvent = lastMouseEventRef.current;

          // Dispatch synthetic event to trigger Leaflet Draw update
          const newEvent = new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: originalEvent.clientX,
            clientY: originalEvent.clientY,
            screenX: originalEvent.screenX,
            screenY: originalEvent.screenY,
            altKey: isPressed,
            ctrlKey: originalEvent.ctrlKey,
            shiftKey: originalEvent.shiftKey,
            metaKey: originalEvent.metaKey,
            buttons: originalEvent.buttons,
          });

          mapContainer.dispatchEvent(newEvent);
        }
      };

      const keydownHandler = (e: KeyboardEvent) => {
        if (e.key === SNAPPING_MODIFIER_KEY) {
          handleKeyToggle(true);
        }
      };

      const keyupHandler = (e: KeyboardEvent) => {
        if (e.key === SNAPPING_MODIFIER_KEY) {
          handleKeyToggle(false);
        }
      };

      document.addEventListener("keydown", keydownHandler);
      document.addEventListener("keyup", keyupHandler);

      // Cleanup function to remove listeners and markers
      return () => {
        leafletMap
          .getContainer()
          .removeEventListener("mousemove", mousemoveHandler, true);
        leafletMap.off("mouseout", mouseoutHandler);
        leafletMap.off("editable:vertex:drag", vertexDragHandler);
        leafletMap.off("editable:vertex:dragend", vertexDragEndHandler);
        mapContainer.removeEventListener("mouseup", mouseupHandler, true);
        document.removeEventListener("keydown", keydownHandler);
        document.removeEventListener("keyup", keyupHandler);
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
    realRoutedMapRef,
    snappingMinZoom,
    snappingOnUpdate,
    snappingRadiusVisible,
    // Removed setSnappingLatlng dependency
    snappingLayers,
    isMeasurementEnabled,
    measureControl, // Added measureControl dependency for direct updates
  ]);

  const [visiblePolylines, setVisiblePolylines] = useState<(string | number)[]>(
    []
  );
  const [drawingShape, setDrawingLine] = useState(null);

  // Track last valid state for recovery
  const lastValidStateRef = React.useRef<{
    activeShape: any;
    mode: string;
    wasDrawing: boolean;
  } | null>(null);

  const device = useDeviceDetection();

  const toggleMeasurementModeHandler = () => {
    toggleUIMode();
  };

  useEffect(() => {
    const leafletMap = realRoutedMapRef.current?.leafletMap?.leafletElement;
    if (leafletMap && !measureControl) {
      const mapExample = leafletMap;

      console.debug(
        "[Measurements] Initializing measurement control with valid map"
      );

      const customOptions = {
        position: "topright",
        // icon_lineActive: makeMeasureActiveIcon,
        // icon_lineInactive: makeMeasureIcon,
        // icon_polygonActive: polygonActiveIcon,
        // icon_polygonInactive: polygonIcon,
        activeShape,
        mode_btn: `<div id='draw-shape-active' class='measure_button_wrapper'><div class='add_shape'>+</div></div>`,
        msj_disable_tool: "Do you want to disable the tool?",
        device,
        shapes,
        snappingLatlng: snappingLatlngRef?.current,
        snappingEnabled: true,
        cbSaveShape: saveShapeHandler,
        cbUpdateShape: updateShapeHandler,
        cdDeleteShape: deleteShapeHandler,
        cbDeleteVisibleShapeById: deleteVisibleShapeByIdHandler,
        cbVisiblePolylinesChange: visiblePolylinesChange,
        cbSetDrawingStatus: drawingStatusHandler,
        cbSetDrawingShape: drawingShapeHandler,
        measurementOrder: findLargestNumber(shapes),
        measurementMode: isMeasurementEnabled ? "measurement" : "default",
        cbSetActiveShape: setActiveShapeHandler,
        cbSetUpdateStatusHandler: setUpdateStatusHandler,
        cbMapMovingEndHandler: mapMovingEndHandler,
        cbSaveLastActiveShapeIdBeforeDrawingHandler:
          saveLastActiveShapeIdBeforeDrawingHandler,
        cbChangeActiveCanceldShapeId: changeActiveCancelledShapeId,
        cbToggleMeasurementMode: toggleMeasurementModeHandler,
        cbUpdateAreaOfDrawingMeasurement: updateAreaOfDrawingMeasurementHandler,
        cbSetCurrentDrawHandler: setCurrentDrawHandler,
        cbSetMapStatus: setStatus,
      };

      const measurePolygonControl = (L.control as any).measurePolygon(
        customOptions
      );
      measurePolygonControl.addTo(mapExample);

      setMeasureControl(measurePolygonControl);

      // Restore previous state if available
      if (lastValidStateRef.current) {
        console.debug(
          "[Measurements] Restoring previous state:",
          lastValidStateRef.current
        );
        const savedState = lastValidStateRef.current;

        // Restore mode if it was in measurement mode
        if (savedState.mode === "measurement" && !isMeasurementEnabled) {
          // Mode will be restored by parent component
        }

        // Restore active shape if there was one
        if (savedState.activeShape && !savedState.wasDrawing) {
          setTimeout(() => {
            setActiveShape(savedState.activeShape);
          }, 100);
        }

        lastValidStateRef.current = null;
      }
    }
  }, [realRoutedMapRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (measureControl) {
        console.debug("[Measurements] Cleaning up control on unmount");
        try {
          const mapExample =
            realRoutedMapRef.current?.leafletMap?.leafletElement;
          if (mapExample) {
            mapExample.removeControl(measureControl);
          }
        } catch (e) {
          console.warn("[Measurements] Error during cleanup:", e);
        }
      }
    };
  }, [measureControl, realRoutedMapRef]);

  // Sync device detection to control options
  useEffect(() => {
    if (measureControl) {
      measureControl.options.device = device;
    }
  }, [measureControl, device]);

  useEffect(() => {
    if (measureControl && activeShape) {
      const shapeCoordinates = shapes.filter((s) => s.shapeId === activeShape);
      const map = realRoutedMapRef.current?.leafletMap?.leafletElement;
      if (!map) return;

      if (ifDrawing) {
        setMoveToShape(null);
      }

      if (shapeCoordinates[0]?.shapeId && !ifDrawing && !deleteAll) {
        measureControl.changeColorByActivePolyline(
          map,
          shapeCoordinates[0].shapeId
        );
      }
      if (showAll) {
        const allPolylines = measureControl.getAllPolylines(map);
        measureControl.fitMapToPolylines(map, allPolylines);
        setShowAll(false);
      }

      if (deleteAll) {
        setMoveToShape(null);
        measureControl.removePolylineById(map, activeShape);
        const cleanArr = visibleShapes.filter((m) => m.shapeId !== activeShape);
        deleteShapeHandler(activeShape);
        setVisibleShapes(cleanArr);

        const cleanAllArr = shapes.filter((m) => m.shapeId !== activeShape);
        setShapes(cleanAllArr);
        setDeleteAll(false);
        if (measureControl.options.shapes.length === 1) {
          measureControl.options.shapes = [];
        }
        const cleanLocalLefletShapes = measureControl.options.shapes.filter(
          (m) => m.shapeId !== activeShape
        );

        measureControl.options.shapes = cleanLocalLefletShapes;
      }
      if (moveToShape && !deleteAll) {
        if (shapeCoordinates.length > 0) {
          measureControl.showActiveShape(map, shapeCoordinates[0]?.coordinates);
        }
      }
    }

    if (measureControl) {
      const map = realRoutedMapRef.current?.leafletMap?.leafletElement;
      if (!map) return;
      measureControl.changeMeasurementMode(
        isMeasurementEnabled ? "measurement" : "default",
        map
      );
      const shapeCoordinates = shapes.filter((s) => s.shapeId === activeShape);
      if (shapeCoordinates[0]?.shapeId) {
        measureControl.changeColorByActivePolyline(
          map,
          shapeCoordinates[0].shapeId
        );
      }

      if (isMeasurementEnabled && visibleShapes.length === 0) {
        measureControl.getVisibleShapeIdsArr(measureControl._map);
      }
    }
  }, [
    activeShape,
    measureControl,
    showAll,
    deleteAll,
    ifDrawing,
    moveToShape,
    isMeasurementEnabled,
    realRoutedMapRef,
  ]);

  useEffect(() => {
    if (measureControl) {
      const cleanedVisibleArr = filterArrByIds(visiblePolylines, shapes);

      // Preserve drawing shape (5555) if we're in drawing mode
      const drawingShapeInVisible = visibleShapes.find(
        (s) => s.shapeId === 5555
      );
      if (
        ifDrawing &&
        drawingShapeInVisible &&
        !cleanedVisibleArr.find((s) => s.shapeId === 5555)
      ) {
        cleanedVisibleArr.push(drawingShapeInVisible);
      }

      setVisibleShapes(cleanedVisibleArr);
      measureControl.changeMeasurementsArr(shapes);
    }
  }, [visiblePolylines, shapes, ifDrawing]);

  useEffect(() => {
    if (drawingShape) {
      const cleanArr = visibleShapes.filter((m) => m.shapeId !== 5555);
      setVisibleShapes([...cleanArr, drawingShape]);
    } else {
      setLastVisibleShapeActive();
    }
  }, [drawingShape]);

  const saveShapeHandler = (layer) => {
    addShape(layer);
  };
  const deleteShapeHandler = (id) => {
    deleteShapeById(id);
  };
  const deleteVisibleShapeByIdHandler = (id) => {
    deleteVisibleShapeById(id);
  };
  const updateShapeHandler = (id, newCoordinates, newDistance, newSquare) => {
    updateShapeById(id, newCoordinates, newDistance, newSquare);
  };

  const saveLastActiveShapeIdBeforeDrawingHandler = () => {
    setDrawingWithLastActiveShape();
  };
  const changeActiveCancelledShapeId = () => {
    setActiveShapeIfDrawCancelled();
  };

  const visiblePolylinesChange = (arr) => {
    setVisiblePolylines(arr);
  };

  const drawingStatusHandler = (status) => {
    setDrawingShape(status);
  };

  const drawingShapeHandler = (draw) => {
    setDrawingLine(draw);
  };
  const setActiveShapeHandler = (id) => {
    setActiveShape(id);
    setMoveToShape(null);
  };
  const setUpdateStatusHandler = (status) => {
    setUpdateShape(status);
  };
  const mapMovingEndHandler = (status) => {
    setMapMovingEnd(status);
  };

  const updateAreaOfDrawingMeasurementHandler = (newArea) => {
    updateAreaOfDrawing(newArea);
  };

  // Debug: Log what's causing rerenders
  useEffect(() => {
    console.debug("[Measurements] Rerender triggered. State:", {
      activeShape,
      shapesCount: shapes.length,
      visibleShapesCount: visibleShapes.length,
      isMeasurementEnabled,
      ifDrawing,
      snappingLatlng: !!snappingLatlngRef?.current,
    });
  });

  const SNAPPING_MODIFIER_KEY = "Alt";

  const isSnappingModifierPressed = (event: any) => {
    if (event.getModifierState) {
      return event.getModifierState(SNAPPING_MODIFIER_KEY);
    }
    // Fallback for synthetic events or simple objects
    if (SNAPPING_MODIFIER_KEY === "Alt") return event.altKey;
    if (SNAPPING_MODIFIER_KEY === "Control") return event.ctrlKey;
    if (SNAPPING_MODIFIER_KEY === "Shift") return event.shiftKey;
    return false;
  };
};
