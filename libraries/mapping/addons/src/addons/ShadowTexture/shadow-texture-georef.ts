import { getFromWebMercatorToWGS84 } from "@carma-geo/proj";

/** Anchor from the original EPSG:3857 model footprint. */
export const DZ_B_PRM_EPSG3857_CENTER = {
  x: 791706.051,
  y: 6664825.628,
} as const;

const [longitude, latitude] = getFromWebMercatorToWGS84([
  DZ_B_PRM_EPSG3857_CENTER.x,
  DZ_B_PRM_EPSG3857_CENTER.y,
]);
export const DZ_B_PRM_POSITION = { longitude, latitude } as const;

/** GLB X/Z are EPSG:3857 metres, while GLB Y is a physical height in metres. */
export const dzbPrmPhysicalDirectionToProjected = (
  east: number,
  up: number,
  south: number
): [number, number, number] => {
  const mercatorScale = 1 / Math.cos((latitude * Math.PI) / 180);
  return [east * mercatorScale, up, south * mercatorScale];
};

/** glTF X is projected east; glTF Z is projected south. */
export const dzbPrmLocalToLonLat = (x: number, z: number): [number, number] => {
  const [longitude, latitude] = getFromWebMercatorToWGS84([
    DZ_B_PRM_EPSG3857_CENTER.x + x,
    DZ_B_PRM_EPSG3857_CENTER.y - z,
  ]);
  return [longitude, latitude];
};
