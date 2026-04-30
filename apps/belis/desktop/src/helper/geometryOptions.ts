const CRS_25832 = {
  type: "name" as const,
  properties: { name: "urn:ogc:def:crs:EPSG::25832" },
};

const HARDCODED_POINT_TOELLETURM = {
  type: "Point" as const,
  crs: CRS_25832,
  coordinates: [374503.93, 5679879.3],
};

const HARDCODED_LINE = {
  type: "LineString" as const,
  crs: CRS_25832,
  coordinates: [
    [374503.93, 5679879.3],
    [374523.93, 5679899.3],
    [374543.93, 5679919.3],
  ],
};

export type GeometryKey = "point_toelleturm" | "line";

export const GEOMETRY_OPTIONS: {
  key: GeometryKey;
  label: string;
  geometry: typeof HARDCODED_POINT_TOELLETURM | typeof HARDCODED_LINE;
}[] = [
  {
    key: "point_toelleturm",
    label: "Punkt – Tölleturm",
    geometry: HARDCODED_POINT_TOELLETURM,
  },
  {
    key: "line",
    label: "Linie – Tölleturm",
    geometry: HARDCODED_LINE,
  },
];

export const getGeometryByKey = (key: GeometryKey) =>
  GEOMETRY_OPTIONS.find((o) => o.key === key)!.geometry;

export const getDefaultGeometryKey = (featureType: string): GeometryKey =>
  featureType === "leitung" ? "line" : "point_toelleturm";
