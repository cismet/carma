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
  toLatLngFromClosestPoint,
  isCoordMatchLatLng,
  isFirstVertexMatch,
  isLastVertexMatch,
  tryClosePolygon,
  tryFinishLine,
  distanceBetweenLatLng,
  screenPixelDistance,
  pixelRadiusToMeters,
  createSnappingIndicator,
  findClosestSnappingPoint,
  SNAPPING_MODIFIER_KEY,
  isSnappingModifierPressed,
} from "../utils/snapping";
import { filterArrByIds, findLargestNumber } from "../utils/shapes";
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
    snappingIdentityDistanceMeters,
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

      // Centralized cleanup for all snapping state
      const clearSnapping = () => {
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
          // Clear all snapping refs
          closestPoint = null;
          closestPointRef.current = null;
          snappingLatlngRef.current = null;
          if (measureControl) {
            measureControl.options.snappingLatlng = null;
          }
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
            clearSnapping();
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
          clearSnapping();
          return;
        }

        // Check if Snapping Modifier Key is pressed - if so, disable snapping temporarily
        if (isPressed) {
          clearSnapping();
          return;
        }

        // Check zoom level - only work if zoom >= configured minimum
        const currentZoom = leafletMap.getZoom();

        if (currentZoom < snappingMinZoom) {
          clearSnapping();
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
          const radiusInMeters = pixelRadiusToMeters(
            currentRadius,
            mouseLatLng.lat,
            currentZoom
          );

          circleMarkerRef.current = L.circle(mouseLatLng, {
            radius: radiusInMeters,
            color: "#ffffff",
            fillColor: "#ffffff",
            fillOpacity: 0.15,
            weight: 1,
            opacity: 0.4,
            interactive: false,
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
        // Find closest snapping point using helper
        const projectToScreen = (coord: [number, number]) => {
          const pointLatLng = L.latLng(coord[1], coord[0]);
          return leafletMap.latLngToContainerPoint(pointLatLng);
        };

        const closestResult = findClosestSnappingPoint(
          coordinatePoints,
          mousePoint,
          currentRadius,
          projectToScreen
        );

        // Determine snapping point
        let isSnapped = false;
        let snappedFeature: any;

        if (!closestResult) {
          // No points found - use mouse pointer but don't show indicator
          snappedFeature = {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [mouseLatLng.lng, mouseLatLng.lat],
            },
            properties: { black: true },
          };
          isSnapped = false;
        } else {
          // Snap to the closest point found within query radius
          snappedFeature = {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: closestResult.point.coordinates,
            },
            properties: {
              black: true,
              source: closestResult.point.sourceId,
            },
          };
          isSnapped = true;
        }
        closestPoint = snappedFeature;
        // Only store snap point if actually snapped - prevents click handler from using stale/unsnapped positions
        closestPointRef.current = isSnapped ? snappedFeature : null;

        const finalLatLng = toLatLngFromClosestPoint(closestPoint);
        // Logic for updating snappingLatlng
        let newSnappingLatlng = null;

        if (finalLatLng) {
          // Check if we're snapping to the first vertex of an in-progress drawing
          // If so, only allow snapping if we're within the query radius (prevents premature polygon closure)
          let shouldSnap = true;

          if (
            isFirstVertexMatch(
              currentDrawHandlerValue,
              finalLatLng,
              snappingIdentityDistanceMeters
            )
          ) {
            // We're trying to snap to first vertex - check pixel distance from mouse
            const map = realRoutedMapRef.current?.leafletMap?.leafletElement;
            const firstVertex = currentDrawHandlerValue._poly._latlngs[0];
            if (map && mouseLatLng) {
              const mousePt = map.latLngToContainerPoint(mouseLatLng);
              const vertexPt = map.latLngToContainerPoint(firstVertex);
              const pixelDist = screenPixelDistance(mousePt, vertexPt);

              // Only snap if mouse is within query radius
              if (pixelDist > queryRadiusRef.current) {
                shouldSnap = false;
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
          closestResult
        ) {
          const snappedCoord = closestResult.point.coordinates;

          // Check if snapped point matches first vertex coordinates (regardless of source)
          // This handles both drawing-in-progress points AND vector features at same location
          const firstVertex = currentDrawHandlerValue._poly?._latlngs?.[0];
          if (
            firstVertex &&
            isCoordMatchLatLng(
              snappedCoord,
              firstVertex,
              snappingIdentityDistanceMeters
            )
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
          if (
            finalLatLng &&
            isSnapped &&
            (statusRef.current === "WAITING" ||
              statusRef.current === "DRAWING" ||
              statusRef.current === "INACTIVE")
          ) {
            snappingIndicatorRef.current = createSnappingIndicator(
              finalLatLng,
              leafletMap
            );
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

      // Shared helper for vertex drag snapping
      const findVertexSnapTarget = (vertexLatLng: {
        lat: number;
        lng: number;
      }): SnappingPoint | null => {
        const vertexPoint = leafletMap.latLngToContainerPoint(vertexLatLng);
        const currentRadius = queryRadiusRef.current;
        const coordinatePoints: SnappingPoint[] = [];

        // Extract snap points from vector features
        const mapContainer = leafletMap.getContainer();
        const mapRect = mapContainer.getBoundingClientRect();
        const screenX = vertexPoint.x + mapRect.left;
        const screenY = vertexPoint.y + mapRect.top;

        coordinatePoints.push(
          ...getSnappingPointsFromMapLibre(
            snappingLayersRef.current,
            { x: screenX, y: screenY },
            currentRadius
          )
        );

        // Extract from measurement shapes
        shapesRef.current.forEach((shape: any) => {
          coordinatePoints.push(
            ...extractPointsFromMeasurementShape(shape, "measurements")
          );
        });

        // Filter out self (exclude self-snapping)
        const filtered = coordinatePoints.filter((point) => {
          const pointLatLng = {
            lat: point.coordinates[1],
            lng: point.coordinates[0],
          };
          return (
            distanceBetweenLatLng(pointLatLng, vertexLatLng) >=
            snappingIdentityDistanceMeters
          );
        });

        // Find closest
        const projectToScreen = (coord: [number, number]) => {
          const pointLatLng = L.latLng(coord[1], coord[0]);
          return leafletMap.latLngToContainerPoint(pointLatLng);
        };

        const result = findClosestSnappingPoint(
          filtered,
          vertexPoint,
          currentRadius,
          projectToScreen
        );

        return result?.point ?? null;
      };

      // Phase 4: Show snap indicator during vertex drag
      const vertexDragHandler = (e: any) => {
        isDraggingVertexRef.current = true;
        if (!snappingOnUpdate) return;

        const vertex = e.vertex;
        if (!vertex) return;

        // Remove old indicator
        if (snappingIndicatorRef.current) {
          leafletMap.removeLayer(snappingIndicatorRef.current);
          snappingIndicatorRef.current = null;
        }

        const snapTarget = findVertexSnapTarget(vertex.latlng);
        if (snapTarget) {
          snappingIndicatorRef.current = createSnappingIndicator(
            { lat: snapTarget.coordinates[1], lng: snapTarget.coordinates[0] },
            leafletMap
          );
        }
      };

      leafletMap.on("editable:vertex:drag", vertexDragHandler);

      // Phase 4: Snap vertex AFTER drag ends
      const vertexDragEndHandler = (e: any) => {
        isDraggingVertexRef.current = false;
        if (!snappingOnUpdate) return;

        const vertex = e.vertex;
        if (!vertex) return;

        const snapTarget = findVertexSnapTarget(vertex.latlng);
        if (snapTarget) {
          // Snap vertex to final position
          vertex.latlng.lat = snapTarget.coordinates[1];
          vertex.latlng.lng = snapTarget.coordinates[0];
          vertex.update();
          // Force complete refresh of the editor
          if (e.layer.editor) {
            e.layer.editor.reset();
          }
          e.layer.redraw();
        }
      };

      leafletMap.on("editable:vertex:dragend", vertexDragEndHandler);

      // click handler for snapped vertices
      const mapContainer = leafletMap.getContainer();
      const clickHandler = (event: MouseEvent) => {
        const snapPoint = closestPointRef.current;
        if (!snapPoint) return; // No snap point, let normal click handling proceed

        const drawHandler = currentDrawHandlerRef.current;
        if (!drawHandler || !drawHandler.addVertex) return; // Not drawing

        // Get snapped latlng
        const snappedLatlng = toLatLngFromClosestPoint(snapPoint);
        if (!snappedLatlng) return;

        // Check if snapping to first vertex (polygon closure)
        if (
          isFirstVertexMatch(
            drawHandler,
            snappedLatlng,
            snappingIdentityDistanceMeters
          )
        ) {
          if (tryClosePolygon(drawHandler)) {
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }
        }

        // Check if snapping to last vertex (finish line measurement)
        if (
          isLastVertexMatch(
            drawHandler,
            snappedLatlng,
            snappingIdentityDistanceMeters
          )
        ) {
          if (tryFinishLine(drawHandler)) {
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }
        }

        // Directly add vertex at snapped position
        drawHandler.addVertex(snappedLatlng);
        event.stopPropagation();
        event.stopImmediatePropagation();
      };
      mapContainer.addEventListener("click", clickHandler, true);

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
        mapContainer.removeEventListener("click", clickHandler, true);
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
    snappingIdentityDistanceMeters,
    snappingLayers,
    isMeasurementEnabled,
    measureControl,
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
};
