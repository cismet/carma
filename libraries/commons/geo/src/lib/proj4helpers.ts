import proj4 from "proj4";
import type { Converter } from "proj4/dist/lib/core";

import {
  EPSG3857,
  EPSG4326,
  EPSG25832,
  proj4crs3857def,
  proj4crs4326def,
  proj4crs25832def,
} from "./constants/proj";

// Export proj4 with correct typing from proj4 package
export default proj4;

export const PROJ4_CONVERTERS = {
  CRS3857: proj4(EPSG3857, proj4crs3857def),
  CRS4326: proj4(EPSG4326, proj4crs4326def),
  CRS25832: proj4(EPSG25832, proj4crs25832def),
};

export const isProj4Converter = (
  obj:
    | {
        forward?: unknown;
        inverse?: unknown;
      }
    | string
): obj is Converter => {
  return (
    typeof obj !== "string" &&
    typeof obj.forward === "function" &&
    typeof obj.inverse === "function"
  );
};

export function convertBBox2Bounds(
  bbox: [number, number, number, number],
  refDef = PROJ4_CONVERTERS.CRS4326
) {
  const projectedNE = PROJ4_CONVERTERS.CRS4326.forward(
    refDef.inverse([bbox[0], bbox[1]])
  );
  const projectedSW = PROJ4_CONVERTERS.CRS4326.forward(
    refDef.inverse([bbox[2], bbox[3]])
  );
  return [
    [projectedNE[1], projectedSW[0]],
    [projectedSW[1], projectedNE[0]],
  ];
}
