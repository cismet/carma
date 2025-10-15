import {
  getProj4Converter,
  ManagedProjections,
  getManagedCrs,
  type ManagedProjection,
} from "@carma/geo/proj";

import { DEFAULT_PROJ } from "@carma/resources";
import { SearchResultItem } from "@carma/types";

const DEFAULT_ZOOM_LEVEL = 16;

const HITOBJECT_POLYGON_TYPE = "Polygon";

const getPosInWGS84 = (
  { x, y }: { x: number; y: number },
  sourceCrs: ManagedProjection
) => {
  const converter = getProj4Converter(sourceCrs, ManagedProjections.EPSG4326);
  const coords = converter.forward([x, y]);
  return {
    lat: coords[1],
    lon: coords[0],
  };
};

const getRingInWGS84 = (
  coords: (string | number)[][],
  sourceCrs: ManagedProjection
) => {
  const converter = getProj4Converter(sourceCrs, ManagedProjections.EPSG4326);
  return coords
    .map((c) => c.map((v) => (typeof v === "string" ? parseFloat(v) : v)))
    .filter(
      (coords) =>
        !coords.some((c) => isNaN(c) || c === Infinity || c === -Infinity)
    )
    .map((coord) => converter.forward(coord));
};

export interface DerivedGeometries {
  pos: { lon: number; lat: number };
  zoom: number;
  polygon?: number[][][];
}

export const getDerivedGeometries = (
  hitObject: SearchResultItem
): DerivedGeometries => {
  const crsCode = hitObject.crs ?? DEFAULT_PROJ;
  const polygonCrsString = hitObject.more?.g?.crs?.properties.name;
  const polygonCrsCode = polygonCrsString?.split(":")[1] ?? crsCode;

  let pos: { lon: number; lat: number };
  let polygon: number[][][] | undefined = undefined;
  const zoom = hitObject.more.zl ?? DEFAULT_ZOOM_LEVEL;

  try {
    const sourceCrs = getManagedCrs(crsCode);
    pos = getPosInWGS84(hitObject, sourceCrs);

    if (
      hitObject.more.g &&
      hitObject.more.g.type === HITOBJECT_POLYGON_TYPE &&
      hitObject.more.g.coordinates.length > 0
    ) {
      const polygonCrs = getManagedCrs(polygonCrsCode);
      polygon = hitObject.more.g.coordinates.map((ring) =>
        getRingInWGS84(ring, polygonCrs)
      );
    }
  } catch (error) {
    console.error("Failed to convert geometries:", error);
    console.debug(
      "hitObject crs",
      crsCode,
      polygonCrsCode,
      hitObject.more.zl,
      hitObject.more.g?.type,
      hitObject.more.g?.crs,
      hitObject
    );
    throw error;
  }
  console.debug(
    "hitObject crs",
    crsCode,
    polygonCrsCode,
    hitObject.more.zl,
    hitObject.more.g?.type,
    hitObject.more.g?.crs,
    pos,
    zoom,
    polygon,
    hitObject
  );

  return {
    pos,
    zoom,
    polygon,
  };
};
