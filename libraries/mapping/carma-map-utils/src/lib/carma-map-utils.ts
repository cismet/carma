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
