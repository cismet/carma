import { proj4crs25832def } from "./defs";

export const ManagedProjections = {
  EPSG25832: "EPSG:25832",
  EPSG3857: "EPSG:3857",
  EPSG4326: "EPSG:4326",
} as const;

export type ManagedProjectionMap = typeof ManagedProjections;
export type ManagedProjectionKey = keyof ManagedProjectionMap;
export type ManagedProjection = ManagedProjectionMap[ManagedProjectionKey];

export type ManagedDefMap = Record<ManagedProjection, string | undefined>;

export const ManagedDefs: ManagedDefMap = {
  [ManagedProjections.EPSG25832]: proj4crs25832def,
  [ManagedProjections.EPSG3857]: undefined,
  [ManagedProjections.EPSG4326]: undefined,
} satisfies ManagedDefMap;
