import { extractRingsFromGeometry } from "@carma-geo/utils";
import type { CarmaConf3DClippingPolygon } from "../contracts/maplibre-style.d";

export type CarmaConf3DClippingPolygonRing = number[][];

export const getCarmaConf3DClippingPolygonRing = (
  clippingPolygon: CarmaConf3DClippingPolygon | null | undefined
): CarmaConf3DClippingPolygonRing | null => {
  if (!clippingPolygon) {
    return null;
  }

  const ring = extractRingsFromGeometry(clippingPolygon, {
    includeLineGeometries: false,
  })[0];

  return ring && ring.length >= 3 ? ring : null;
};
