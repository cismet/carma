interface MapSize {
  width: number;
  height: number;
}

interface MapPosition {
  lat: number;
  lng: number;
  zoom: number;
}

/**
 * Calculates the degrees per pixel at a given latitude and zoom level.
 * This is needed because the map projection causes different scales at different latitudes.
 */
const getDegreesPerPixel = (lat: number, zoom: number) => {
  const earthCircumference = 40075016.686; // meters at equator
  const metersPerPixel =
    (earthCircumference * Math.cos((lat * Math.PI) / 180)) /
    Math.pow(2, zoom + 8);
  const degreesPerMeterLat = 1 / 111320;
  const degreesPerMeterLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));

  return {
    lat: metersPerPixel * degreesPerMeterLat,
    lng: metersPerPixel * degreesPerMeterLng,
  };
};

/**
 * Calculates the zoom level change needed when resizing the map.
 * Returns the zoom delta (negative when shrinking).
 */
const calculateZoomDelta = (bigSize: MapSize, smallSize: MapSize): number => {
  const widthRatio = smallSize.width / bigSize.width;
  const heightRatio = smallSize.height / bigSize.height;
  const avgRatio = (widthRatio + heightRatio) / 2;

  // Each zoom level doubles/halves the scale
  return Math.log2(avgRatio);
};

/**
 * Calculates the new map position when transitioning from a big map to a small map
 * positioned in the bottom-right corner.
 *
 * The goal is to keep the same geographic area visible in the small map.
 * We zoom out to fit the same area, and shift the center to the south-east
 * to compensate for the small map being anchored to the bottom-right.
 */
export const calculateSmallMapPosition = (
  currentPosition: MapPosition,
  bigSize: MapSize,
  smallSize: MapSize,
  padding: number = 16
): MapPosition => {
  // Calculate zoom delta (will be negative since we're shrinking)
  const zoomDelta = calculateZoomDelta(bigSize, smallSize);
  const newZoom = Math.round(currentPosition.zoom + zoomDelta);

  // Use degrees per pixel at the NEW zoom level
  // because we need to calculate the shift in the new coordinate space
  const degreesPerPixel = getDegreesPerPixel(currentPosition.lat, newZoom);

  // The small map is anchored bottom-right with padding
  // We need to shift the center so the original viewport stays in view
  // Shift = distance from small map center to where big map center would be
  // Small map position: bottom-right corner minus padding
  // To keep the same area visible, shift center to south-east (decrease lat, increase lng)
  const shiftX = bigSize.width / 2 - smallSize.width / 2 - padding;
  const shiftY = bigSize.height / 2 - smallSize.height / 2 - padding;

  // Convert pixel shift to degrees at the new zoom level
  const latShift = shiftY * degreesPerPixel.lat;
  const lngShift = shiftX * degreesPerPixel.lng;

  return {
    // Shift south-east: decrease lat (south) and increase lng (east)
    lat: currentPosition.lat - latShift,
    lng: currentPosition.lng + lngShift,
    zoom: newZoom,
  };
};

/**
 * Calculates the new map position when transitioning from a small map back to a big map.
 * This reverses the calculation from calculateSmallMapPosition.
 */
export const calculateBigMapPosition = (
  currentPosition: MapPosition,
  bigSize: MapSize,
  smallSize: MapSize,
  padding: number = 16
): MapPosition => {
  // Calculate zoom delta (will be positive when expanding)
  const zoomDelta = -calculateZoomDelta(bigSize, smallSize);
  const newZoom = Math.round(currentPosition.zoom + zoomDelta);

  // Use degrees per pixel at the CURRENT (small) zoom level
  // because we're calculating the shift from the current position
  const degreesPerPixel = getDegreesPerPixel(
    currentPosition.lat,
    currentPosition.zoom
  );

  // Same shift values as calculateSmallMapPosition
  const shiftX = bigSize.width / 2 - smallSize.width / 2 - padding;
  const shiftY = bigSize.height / 2 - smallSize.height / 2 - padding;

  const latShift = shiftY * degreesPerPixel.lat;
  const lngShift = shiftX * degreesPerPixel.lng;

  return {
    // Reverse the shifts: north-west (increase lat, decrease lng)
    lat: currentPosition.lat + latShift,
    lng: currentPosition.lng - lngShift,
    zoom: newZoom,
  };
};

/**
 * Parses the current map position from the URL hash.
 * Expected format: #/?lat=51.26&lng=7.17&zoom=18
 */
export const getPositionFromUrl = (): MapPosition | null => {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace("#/?", ""));

  const lat = parseFloat(params.get("lat") || "");
  const lng = parseFloat(params.get("lng") || "");
  const zoom = parseInt(params.get("zoom") || "", 10);

  if (isNaN(lat) || isNaN(lng) || isNaN(zoom)) {
    return null;
  }

  return { lat, lng, zoom };
};

/**
 * Updates the URL hash with the new map position.
 */
export const setPositionInUrl = (position: MapPosition): void => {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace("#/?", ""));

  params.set("lat", position.lat.toString());
  params.set("lng", position.lng.toString());
  params.set("zoom", position.zoom.toString());

  window.location.hash = "#/?" + params.toString();
};
