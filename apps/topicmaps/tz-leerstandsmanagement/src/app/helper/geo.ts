import { getProj4Converter, ManagedProjections } from "@carma-geo/proj";

export type LngLat = [lng: number, lat: number];
export type Utm = [x: number, y: number];

const converter = getProj4Converter(
  ManagedProjections.EPSG4326,
  ManagedProjections.EPSG25832
);

// The typed converter expects branded coordinate tuples; the values here are
// plain numbers from Leaflet and from the database, so the cast is deliberate.
type NumericConverter = {
  forward: (c: [number, number]) => [number, number];
  inverse: (c: [number, number]) => [number, number];
};
const numeric = converter as unknown as NumericConverter;

export const CRS_25832 = {
  type: "name",
  properties: { name: "urn:ogc:def:crs:EPSG::25832" },
} as const;

export const lngLatToUtm = (lngLat: LngLat): Utm => numeric.forward(lngLat);
export const utmToLngLat = (utm: Utm): LngLat => numeric.inverse(utm);

/** GeoJSON point in EPSG:25832 as the WuNDa database stores it */
export const utmPoint = ([x, y]: Utm) => ({
  type: "Point",
  crs: CRS_25832,
  coordinates: [x, y],
});

/** Axis-aligned square (side length in metres) around a UTM point */
export const utmSquare = ([x, y]: Utm, side: number) => {
  const h = side / 2;
  return {
    type: "Polygon",
    crs: CRS_25832,
    coordinates: [
      [
        [x - h, y - h],
        [x + h, y - h],
        [x + h, y + h],
        [x - h, y + h],
        [x - h, y - h],
      ],
    ],
  };
};

export const utmDistance = ([ax, ay]: Utm, [bx, by]: Utm) =>
  Math.hypot(ax - bx, ay - by);
