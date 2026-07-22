import { getUtmToGeographicConverter } from "./proj4";

export type ReferenceEllipsoid = Readonly<{
  name: string;
  semiMajorAxis: number;
  semiMinorAxis: number;
}>;

export type UtmReference = Readonly<{
  zone: number;
  hemisphere: "north" | "south";
  ellipsoid: ReferenceEllipsoid;
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

const validateReference = ({ zone, ellipsoid }: UtmReference) => {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new RangeError(
      `UTM zone must be an integer from 1 to 60, got ${zone}`
    );
  }
  if (
    !Number.isFinite(ellipsoid.semiMajorAxis) ||
    !Number.isFinite(ellipsoid.semiMinorAxis) ||
    ellipsoid.semiMajorAxis <= 0 ||
    ellipsoid.semiMinorAxis <= 0 ||
    ellipsoid.semiMinorAxis > ellipsoid.semiMajorAxis
  ) {
    throw new RangeError("Reference ellipsoid axes are invalid");
  }
};

const getConverter = (reference: UtmReference) => {
  validateReference(reference);
  const { zone, hemisphere, ellipsoid } = reference;
  return getUtmToGeographicConverter({
    zone,
    hemisphere,
    semiMajorAxis: ellipsoid.semiMajorAxis,
    semiMinorAxis: ellipsoid.semiMinorAxis,
  });
};

export type EllipsoidSurfaceCoordinate = Readonly<{
  longitudeRadians: number;
  latitudeRadians: number;
  ellipsoidalHeight: number;
  ecef: readonly [x: number, y: number, z: number];
}>;

/**
 * Maps a coordinate in any UTM zone onto a selected reference ellipsoid.
 * The height is ellipsoidal and is never interpreted as an orthometric height.
 */
export const utmToEllipsoidSurface = (
  easting: number,
  northing: number,
  ellipsoidalHeight: number,
  reference: UtmReference
): EllipsoidSurfaceCoordinate => {
  if (
    !Number.isFinite(easting) ||
    !Number.isFinite(northing) ||
    !Number.isFinite(ellipsoidalHeight)
  ) {
    throw new RangeError(
      "UTM coordinate and ellipsoidal height must be finite"
    );
  }
  const [longitudeDegrees, latitudeDegrees] = getConverter(reference).forward([
    easting,
    northing,
  ]);
  const longitudeRadians = (longitudeDegrees * Math.PI) / 180;
  const latitudeRadians = (latitudeDegrees * Math.PI) / 180;
  const { semiMajorAxis: a, semiMinorAxis: b } = reference.ellipsoid;
  const eccentricitySquared = (a * a - b * b) / (a * a);
  const sinLatitude = Math.sin(latitudeRadians);
  const cosLatitude = Math.cos(latitudeRadians);
  const sinLongitude = Math.sin(longitudeRadians);
  const cosLongitude = Math.cos(longitudeRadians);
  const primeVerticalRadius =
    a / Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude);
  const radial = primeVerticalRadius + ellipsoidalHeight;
  const ecef = [
    radial * cosLatitude * cosLongitude,
    radial * cosLatitude * sinLongitude,
    (primeVerticalRadius * (1 - eccentricitySquared) + ellipsoidalHeight) *
      sinLatitude,
  ] as const;

  return {
    longitudeRadians,
    latitudeRadians,
    ellipsoidalHeight,
    ecef,
  };
};
