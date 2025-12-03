/**
 * Snapping utilities for measurement tools
 */
import L from "leaflet";
import { latLng } from "@carma/leaflet";
import { distanceMeters, metersPerPixel } from "@carma/geo/utils";

import type { LatLng, Map as LeafletMap, CircleMarker } from "leaflet";
import type { SnappingPoint } from "../types";

/** Snapping modifier key to temporarily disable snapping */
export const SNAPPING_MODIFIER_KEY = "Alt";

/**
 * Check if snapping modifier key is pressed
 */
export const isSnappingModifierPressed = (event: {
  getModifierState?: (key: string) => boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}): boolean => {
  if (event.getModifierState) {
    return event.getModifierState(SNAPPING_MODIFIER_KEY);
  }
  if (SNAPPING_MODIFIER_KEY === "Alt") return !!event.altKey;
  if (SNAPPING_MODIFIER_KEY === "Control") return !!event.ctrlKey;
  if (SNAPPING_MODIFIER_KEY === "Shift") return !!event.shiftKey;
  return false;
};

/** Default threshold for coordinate match (0.1 meters = 10cm) */
export const EXACT_MATCH_METERS = 0.1;

/**
 * Screen pixel distance between two points
 */
export const screenPixelDistance = (
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Convert pixel radius to meters at a given lat/zoom
 */
export const pixelRadiusToMeters = (
  pixelRadius: number,
  lat: number,
  zoom: number
): number => {
  const mpp = metersPerPixel(zoom, lat as any);
  return pixelRadius * mpp;
};

/**
 * Distance in meters between two lat/lng positions (uses @carma/geo/utils)
 */
export const distanceBetweenLatLng = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number =>
  distanceMeters(
    { latitude: a.lat, longitude: a.lng } as any,
    { latitude: b.lat, longitude: b.lng } as any
  );

/**
 * Check if a coordinate [lng, lat] matches a LatLng within threshold (default 0.1m)
 */
export const isCoordMatchLatLng = (
  coord: [number, number],
  latlng: { lat: number; lng: number },
  thresholdMeters = EXACT_MATCH_METERS
): boolean =>
  distanceBetweenLatLng({ lat: coord[1], lng: coord[0] }, latlng) <
  thresholdMeters;

/**
 * Create a snapping indicator marker
 */
export const createSnappingIndicator = (
  latlng: { lat: number; lng: number },
  map: LeafletMap
): CircleMarker => {
  return L.circleMarker([latlng.lat, latlng.lng], {
    radius: 3.5,
    color: "#000000",
    fillColor: "#000000",
    fillOpacity: 0.8,
    weight: 1,
    opacity: 0.8,
    interactive: false,
  }).addTo(map);
};

/**
 * Find the closest snapping point within a pixel radius
 */
export const findClosestSnappingPoint = (
  points: SnappingPoint[],
  referencePoint: { x: number; y: number },
  maxPixelRadius: number,
  projectToScreen: (coord: [number, number]) => { x: number; y: number }
): { point: SnappingPoint; distance: number } | null => {
  let closest: { point: SnappingPoint; distance: number } | null = null;

  for (const snappingPoint of points) {
    const screenPoint = projectToScreen(snappingPoint.coordinates);
    const dist = screenPixelDistance(screenPoint, referencePoint);

    if (dist <= maxPixelRadius && (!closest || dist < closest.distance)) {
      closest = { point: snappingPoint, distance: dist };
    }
  }

  return closest;
};

/**
 * Get the first vertex of a draw handler's polygon if it has 3+ vertices
 */
export const getFirstVertexIfClosable = (drawHandler: any): LatLng | null => {
  if (drawHandler?._poly?._latlngs?.length >= 3) {
    return drawHandler._poly._latlngs[0];
  }
  return null;
};

/**
 * Get the last vertex of a draw handler's line if it has 2+ vertices
 */
export const getLastVertexIfFinishable = (drawHandler: any): LatLng | null => {
  const latlngs = drawHandler?._poly?._latlngs;
  if (latlngs?.length >= 2) {
    return latlngs[latlngs.length - 1];
  }
  return null;
};

/**
 * Check if a position matches the first vertex of a closable polygon
 */
export const isFirstVertexMatch = (
  drawHandler: any,
  position: { lat: number; lng: number },
  thresholdMeters = EXACT_MATCH_METERS
): boolean => {
  const firstVertex = getFirstVertexIfClosable(drawHandler);
  return firstVertex
    ? distanceBetweenLatLng(position, firstVertex) < thresholdMeters
    : false;
};

/**
 * Check if a position matches the last vertex of a finishable line
 */
export const isLastVertexMatch = (
  drawHandler: any,
  position: { lat: number; lng: number },
  thresholdMeters = EXACT_MATCH_METERS
): boolean => {
  const lastVertex = getLastVertexIfFinishable(drawHandler);
  return lastVertex
    ? distanceBetweenLatLng(position, lastVertex) < thresholdMeters
    : false;
};

/**
 * Try to close a polygon by clicking its first vertex marker
 */
export const tryClosePolygon = (drawHandler: any): boolean => {
  const firstVertex = getFirstVertexIfClosable(drawHandler);
  if (!firstVertex) return false;

  const firstMarker = drawHandler._markers?.[0];
  if (!firstMarker) return false;

  console.debug("[snapping] Closing polygon via first vertex click");
  firstMarker.fire("click", {
    latlng: firstVertex,
    target: firstMarker,
  });
  return true;
};

/**
 * Try to finish a line measurement by calling _finishShape directly
 */
export const tryFinishLine = (drawHandler: any): boolean => {
  if (!drawHandler?._finishShape) return false;

  const latlngs = drawHandler?._poly?._latlngs;
  if (!latlngs || latlngs.length < 2) return false;

  console.debug("[snapping] Finishing line via _finishShape");
  drawHandler._finishShape();
  return true;
};

/**
 * Prepare a Leaflet LatLng from a GeoJSON Point-like feature
 */
export const toLatLngFromClosestPoint = (closestPoint: any) => {
  if (
    !closestPoint ||
    !closestPoint.geometry ||
    !closestPoint.geometry.coordinates
  ) {
    return null;
  }
  const [lng, lat] = closestPoint.geometry.coordinates;
  return latLng(lat, lng);
};

/**
 * Adjust click position for snapping (fires synthetic event)
 */
export const adjustClickPosition = (
  domEvent: MouseEvent,
  closestPoint: any,
  eventType: string,
  leafletMap: any,
  currentDrawHandler?: any
) => {
  const containerPoint = leafletMap.mouseEventToContainerPoint(domEvent);
  const shiftedContainerPoint = L.point(containerPoint.x, containerPoint.y);

  if (!closestPoint) {
    return false;
  }

  const [lng, lat] = closestPoint.geometry.coordinates;
  const finalLatLng = latLng(lat, lng);

  // Check if we're drawing and snapped to first vertex (polygon closure)
  if (isFirstVertexMatch(currentDrawHandler, finalLatLng)) {
    if (tryClosePolygon(currentDrawHandler)) {
      return true;
    }
  }

  console.log("[snapping] Firing synthetic Leaflet event", {
    eventType,
    latlng: finalLatLng,
    originalCoords: [domEvent.clientX, domEvent.clientY],
  });

  leafletMap.fire(eventType, {
    latlng: finalLatLng,
    containerPoint: shiftedContainerPoint,
    originalEvent: domEvent,
    _isSyntheticSnap: true,
  });

  return true;
};

/**
 * Handle potential duplicate vertex (snapped or unsnapped).
 * Returns true if the vertex was handled (either finished the line or ignored as duplicate).
 * Returns false if the vertex should be added as new.
 */
export const handleDuplicateVertex = (
  drawHandler: any,
  position: { lat: number; lng: number },
  thresholdMeters: number
): boolean => {
  if (drawHandler._markers && drawHandler._markers.length > 0) {
    const lastMarker = drawHandler._markers[drawHandler._markers.length - 1];
    const lastLatLng = lastMarker.getLatLng();

    if (distanceBetweenLatLng(position, lastLatLng) < thresholdMeters) {
      // It is the same point as the last one.
      // Try to finish if possible (Leaflet Draw logic: click last point to finish)
      if (tryFinishLine(drawHandler)) {
        return true; // Handled (finished)
      }
      // If we couldn't finish (e.g. only 1 point), it's just a duplicate. Ignore it.
      console.debug(
        "[snapping] Ignoring duplicate vertex click (0-length segment prevention)"
      );
      return true; // Handled (ignored)
    }
  }
  return false; // Not a duplicate
};
