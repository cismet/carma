import proj4 from "proj4";
import type { Converter } from "proj4/dist/lib/core";

import { PROJ4_CONVERTERS } from "@carma-commons/utils";

import { DEFAULT_PROJ } from "@carma-commons/resources";
import { SearchResultItem } from "@carma-commons/types";

const proj4ConverterLookup: Record<string, Converter> = {};
const DEFAULT_ZOOM_LEVEL = 16;

const HITOBJECT_POLYGON_TYPE = "Polygon";

const getPosInWGS84 = (
  { x, y }: { x: number; y: number },
  refSystem: Converter
) => {
  const coords = PROJ4_CONVERTERS.CRS4326.forward(refSystem.inverse([x, y]));
  return {
    lat: coords[1],
    lon: coords[0],
  };
};

const getRingInWGS84 = (coords: (string | number)[][], refSystem: Converter) =>
  coords
    .map((c) => c.map((v) => (typeof v === "string" ? parseFloat(v) : v)))
    .filter(
      (coords) =>
        !coords.some((c) => isNaN(c) || c === Infinity || c === -Infinity)
    )
    .map((coord) => PROJ4_CONVERTERS.CRS4326.forward(refSystem.inverse(coord)));

export interface DerivedGeometries {
  pos: { lon: number; lat: number };
  zoom: number;
  polygon?: number[][][];
}

export const getDerivedGeometries = (
  hitObject: SearchResultItem
): DerivedGeometries => {
  const crs = hitObject.crs ?? DEFAULT_PROJ;
  const polygonCrsString = hitObject.more?.g?.crs?.properties.name;
  const polygonCrs = polygonCrsString?.split(":")[1] ?? crs; // e.g. change "EPSG:4326" -> "4326" to use common format

  let refSystemConverter = proj4ConverterLookup[crs];
  if (!refSystemConverter && crs !== undefined) {
    console.debug("create new proj4 converter for", crs);
    refSystemConverter = proj4(`EPSG:${crs}`);
    proj4ConverterLookup[crs] = refSystemConverter;
  }

  let polygonRefSystemConverter = proj4ConverterLookup[polygonCrs];
  if (!polygonRefSystemConverter && polygonCrs !== undefined) {
    console.debug("create new proj4 converter for polygon", polygonCrs);
    polygonRefSystemConverter = proj4(`EPSG:${polygonCrs}`);
    proj4ConverterLookup[polygonCrs] = polygonRefSystemConverter;
  }

  const pos = getPosInWGS84(hitObject, refSystemConverter);
  const zoom = hitObject.more.zl ?? DEFAULT_ZOOM_LEVEL;

  let polygon: number[][][] | undefined = undefined;
  if (
    hitObject.more.g &&
    hitObject.more.g.type === HITOBJECT_POLYGON_TYPE &&
    hitObject.more.g.coordinates.length > 0
  ) {
    polygon = hitObject.more.g.coordinates.map((ring) =>
      getRingInWGS84(ring, polygonRefSystemConverter)
    );
  }
  console.debug(
    "hitObject crs",
    crs,
    polygonCrs,
    hitObject.more.zl,
    hitObject.more.g?.type,
    hitObject.more.g?.crs,
    pos,
    zoom,
    polygon,
    hitObject
  );

  const derivedGeometries = {
    pos,
    zoom,
    polygon,
  };

  return derivedGeometries;
};
