import localforage from "localforage";
import { point, latLng } from "@carma/leaflet";
import { distance } from "@turf/turf";

import type { LatLng } from "leaflet";

/** Default threshold for coordinate match (0.1 meters = 10cm) */
export const EXACT_MATCH_METERS = 0.1;

/**
 * Distance in meters between two lat/lng positions (Turf geodesic)
 */
export const distanceBetweenLatLng = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number => distance([a.lng, a.lat], [b.lng, b.lat], { units: "meters" });

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
 * Get the first vertex of a draw handler's polygon if it has 3+ vertices
 */
export const getFirstVertexIfClosable = (drawHandler: any): LatLng | null => {
  if (drawHandler?._poly?._latlngs?.length >= 3) {
    return drawHandler._poly._latlngs[0];
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
 * Try to close a polygon by clicking its first vertex marker
 * Returns true if closure was triggered
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

export const setFromLocalforage = async (
  lfKey: string,
  setter: (value: any) => void,
  fallbackValue?: any,
  forceFallback?: boolean
) => {
  try {
    const value = await localforage.getItem(lfKey);
    if (value !== undefined && value !== null) {
      setter(value);
    } else if (fallbackValue !== undefined || forceFallback === true) {
      setter(fallbackValue);
    }
  } catch (error) {
    console.warn(`Failed to load ${lfKey} from localStorage:`, error);
    if (fallbackValue !== undefined || forceFallback === true) {
      setter(fallbackValue);
    }
  }
};

export const saveToLocalforage = async (lfKey: string, value: any) => {
  try {
    await localforage.setItem(lfKey, value);
  } catch (error) {
    console.warn(`Failed to save ${lfKey} to localStorage:`, error);
  }
};

export const adjustClickPosition = (
  domEvent: MouseEvent,
  closestPoint: any,
  eventType: string,
  leafletMap: any,
  currentDrawHandler?: any
) => {
  const containerPoint = leafletMap.mouseEventToContainerPoint(domEvent);
  const shiftedContainerPoint = point(containerPoint.x, containerPoint.y);
  // Use closestPoint if available, otherwise use shifted click position
  if (!closestPoint) {
    return false;
  }

  const [lng, lat] = closestPoint.geometry.coordinates;
  const finalLatLng = latLng(lat, lng);

  // Check if we're drawing and snapped to first vertex (polygon closure)
  if (isFirstVertexMatch(currentDrawHandler, finalLatLng)) {
    if (tryClosePolygon(currentDrawHandler)) {
      return true; // Don't fire synthetic map event
    }
  }

  // Fire a new click event with shifted coordinates on the map
  console.log("[snapping] Firing synthetic Leaflet event", {
    eventType,
    latlng: finalLatLng,
    originalCoords: [domEvent.clientX, domEvent.clientY],
  });

  leafletMap.fire(eventType, {
    latlng: finalLatLng,
    containerPoint: shiftedContainerPoint,
    originalEvent: domEvent,
    _isSyntheticSnap: true, // Mark as synthetic snap event
  });

  return true; // Return true to indicate we handled the snap (caller should stop propagation)
};

// Prepare a Leaflet LatLng from a GeoJSON Point-like feature with coordinates [lng, lat]
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

export function filterArrByIds(
  arrIds: (string | number)[],
  fullArray: any[]
): any[] {
  const finalResult: any[] = [];
  fullArray.forEach((currentItem) => {
    if (arrIds.includes(currentItem.shapeId)) {
      finalResult.push(currentItem);
    }
  });

  return finalResult;
}

export function findLargestNumber(measurements: any[]): number {
  let largestNumber = 0;

  measurements.forEach((item) => {
    if (item.number > largestNumber) {
      largestNumber = item.number;
    }
  });

  return largestNumber;
}
