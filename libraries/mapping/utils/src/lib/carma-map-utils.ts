export function carmaMapUtils(): string {
  return "carma-map-utils";
}
import proj4 from "proj4";

export function getBoundingBoxForLeafletMap(
  leafletMap,
  referenceSystemDefinition
) {
  const bounds = leafletMap.leafletElement.getBounds();
  const projectedNE = proj4("EPSG:4326", referenceSystemDefinition, [
    bounds._northEast.lng,
    bounds._northEast.lat,
  ]);
  const projectedSW = proj4("EPSG:4326", referenceSystemDefinition, [
    bounds._southWest.lng,
    bounds._southWest.lat,
  ]);
  return {
    left: projectedSW[0],
    top: projectedNE[1],
    right: projectedNE[0],
    bottom: projectedSW[1],
  };
}

export const proj4crs3857def =
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs";

export const proj4crs4326def = "+proj=longlat +datum=WGS84 +no_defs";
