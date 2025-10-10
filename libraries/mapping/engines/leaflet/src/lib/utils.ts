/* eslint-disable @typescript-eslint/no-explicit-any */
import proj4 from "proj4";
import type { Map as LeafletMap } from "leaflet";
import { EPSG4326 } from "@carma-commons/geo";

/**
 * Calculates the bounding box for a Leaflet map in a specified reference system.
 *
 * @param leafletMap - The Leaflet map instance
 * @param referenceSystemDefinition - Proj4 definition string for the target reference system
 * @returns Bounding box with left, top, right, bottom coordinates in the target reference system
 */

// TODO validate for proper bounds
export function getBoundingBoxForLeafletMap(
  leafletMap: LeafletMap,
  referenceSystemDefinition: string
) {
  const bounds = leafletMap.getBounds() as any;
  const projectedNE = proj4(EPSG4326, referenceSystemDefinition, [
    bounds._northEast.lng,
    bounds._northEast.lat,
  ]);
  const projectedSW = proj4(EPSG4326, referenceSystemDefinition, [
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
