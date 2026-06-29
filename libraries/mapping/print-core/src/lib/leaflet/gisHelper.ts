// Minimal copy of the geoportal `helper/gisHelper.js` exports that the Leaflet
// print helper needs. Only the three symbols consumed by `print.helper.tsx`
// are reproduced here so the leaflet folder stays self-contained without
// dragging in the app's unrelated GIS utilities (flatbush, turf, polylabel, …).

import proj4 from "proj4";

export const proj4crs3857def =
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs";

const degToRad = (degrees) => degrees * (Math.PI / 180);

export const getMeractorScale = (scale, lat) =>
  scale * (1 / Math.cos(degToRad(lat)));

// In the app this defaulted to `proj4crs25832def`; every caller passes
// `proj4crs3857def`, so the default is kept harmless here.
export function convertBBox2Bounds(bbox, refDef = proj4crs3857def) {
  const wgs84 = proj4.defs("EPSG:4326") as any;
  const projectedNE = proj4(refDef, wgs84, [bbox[0], bbox[1]]);
  const projectedSW = proj4(refDef, wgs84, [bbox[2], bbox[3]]);
  return [
    [projectedNE[1], projectedSW[0]],
    [projectedSW[1], projectedNE[0]],
  ];
}
