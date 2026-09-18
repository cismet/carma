/**
 * Reference ellipsoids as plain constants. This module imports nothing, so
 * closed-form projections that need only a semi-major axis stay free of proj4.
 */
export type ReferenceEllipsoid = Readonly<{
  name: string;
  semiMajorAxis: number;
  semiMinorAxis: number;
}>;
export const GRS80_ELLIPSOID: ReferenceEllipsoid = {
  name: "GRS 1980",
  semiMajorAxis: 6_378_137,
  semiMinorAxis: 6_356_752.314_140_356,
};

export const WGS84_ELLIPSOID: ReferenceEllipsoid = {
  name: "WGS 84",
  semiMajorAxis: 6_378_137,
  semiMinorAxis: 6_356_752.314_245_179,
};
