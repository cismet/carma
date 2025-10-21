import localforage from "localforage";

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
  leafletMap: any
) => {
  const containerPoint = leafletMap.mouseEventToContainerPoint(domEvent);
  const shiftedContainerPoint = L.point(containerPoint.x, containerPoint.y);
  // Use closestPoint if available, otherwise use shifted click position
  if (!closestPoint) {
    return false;
  }

  const [lng, lat] = closestPoint.geometry.coordinates;
  const finalLatLng = L.latLng(lat, lng);

  // Fire a new click event with shifted coordinates
  leafletMap.fire(eventType, {
    latlng: finalLatLng,
    containerPoint: shiftedContainerPoint,
    originalEvent: domEvent,
  });
};

export const adjustClickPositionLeaflet = (
  domEvent: MouseEvent,
  closestPoint: any,
  eventType: string,
  leafletMap: any
) => {
  const containerPoint = leafletMap.mouseEventToContainerPoint(domEvent);
  const shiftedContainerPoint = L.point(containerPoint.x, containerPoint.y);
  // Use closestPoint if available, otherwise use shifted click position
  if (!closestPoint) {
    return false;
  }
  console.log("xxx closestPoint", closestPoint);

  // const [lng, lat] = closestPoint.geometry.coordinates;
  // const finalLatLng = L.latLng(lat, lng);

  // Fire a new click event with shifted coordinates
  leafletMap.fire(eventType, {
    latlng: closestPoint,
    containerPoint: shiftedContainerPoint,
    originalEvent: domEvent,
  });
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
  return L.latLng(lat, lng);
};

export const toLatLngFromClosestPointLeaflet = (closestPoint: any) => {
  if (
    !closestPoint ||
    !closestPoint.geometry ||
    !closestPoint.geometry.coordinates
  ) {
    return null;
  }
  const [lng, lat] = closestPoint.geometry.coordinates;
  return L.latLng(lat, lng);
};
