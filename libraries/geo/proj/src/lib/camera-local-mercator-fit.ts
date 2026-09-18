import { getWebMercatorFromWgs84Deg } from "./web-mercator";
import { Matrix4 } from "three";
import { degToRadNumeric } from "@carma-units";
import type { Degrees, Radians } from "@carma-units";

import {
  cartographicToEcef,
  ecefToEnuMatrix,
  WGS84_A,
  WGS84_E2,
} from "./geodetic";
import { getMercatorScaleFactorAtLatitudeRad } from "./mercator";
import { WEB_MERCATOR_MAX_LATITUDE_DEG } from "./web-map";
import { EARTH_RADIUS } from "./earth";

// East/north/up → scene east/up/south. This is an axis permutation, not a CRS.
const ENU_TO_SCENE = new Matrix4().set(
  1,
  0,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  -1,
  0,
  0,
  0,
  0,
  0,
  1
);

/**
 * Refit a root-local ECEF tangent mesh at another geographic point.
 *
 * Inputs are [longitude, latitude] in degrees, both anchors at ellipsoidal h=0.
 * Input and output axes are X east, Y up, Z south, in root-scale scene metres.
 * The fit anchor matches mean-radius Web Mercator; axes are tangent there.
 * Uniform sec(latitude) scale compensation is optional, on by default.
 *
 * This is a local affine approximation, not global nonlinear flattening. It
 * cannot make two distant tangent neighbourhoods exact simultaneously. The
 * uniform scale follows spherical Web Mercator; ellipsoidal east/north metric
 * differences remain unless correctEllipsoidMetric enables the R/N and R/M
 * differential at the fit point. Neither option is a curvature correction.
 * Apply the same matrix to geometry, bounds and picking.
 */
export const getCameraLocalMercatorFit = (
  rootLngLat: readonly [number, number],
  fitLngLat: readonly [number, number],
  {
    correctScale = true,
    correctEllipsoidMetric = false,
  }: {
    correctScale?: boolean;
    correctEllipsoidMetric?: boolean;
  } = {}
): Matrix4 => {
  for (const [longitude, latitude] of [rootLngLat, fitLngLat]) {
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 ||
      Math.abs(latitude) > WEB_MERCATOR_MAX_LATITUDE_DEG
    )
      throw new RangeError(
        "Local fit needs finite coordinates inside Web Mercator"
      );
  }
  if (Math.abs(rootLngLat[0] - fitLngLat[0]) > 180)
    throw new RangeError("Local fit does not cross the antimeridian");
  const rootLatitude = degToRadNumeric(rootLngLat[1]) as Radians;
  const fitLatitude = degToRadNumeric(fitLngLat[1]) as Radians;
  const rootEcef = cartographicToEcef(
    degToRadNumeric(rootLngLat[0]),
    rootLatitude,
    0
  );
  const fitEcef = cartographicToEcef(
    degToRadNumeric(fitLngLat[0]),
    fitLatitude,
    0
  );
  const rootMercator = getWebMercatorFromWgs84Deg(
    rootLngLat[0] as Degrees,
    rootLngLat[1] as Degrees
  );
  const fitMercator = getWebMercatorFromWgs84Deg(
    fitLngLat[0] as Degrees,
    fitLngLat[1] as Degrees
  );
  const rootScale = getMercatorScaleFactorAtLatitudeRad(rootLatitude);
  // EPSG:3857 uses WGS84_A, while geographic scene metres use the mean Earth
  // radius. Keep the same physical scale as the existing MapLibre scene.
  const projectedToScene = EARTH_RADIUS / WGS84_A / rootScale;
  const scale = correctScale
    ? getMercatorScaleFactorAtLatitudeRad(fitLatitude) / rootScale
    : 1;
  const denominator = 1 - WGS84_E2 * Math.sin(fitLatitude) ** 2;
  const primeVerticalRadius = WGS84_A / Math.sqrt(denominator);
  const meridianRadius = (WGS84_A * (1 - WGS84_E2)) / denominator ** 1.5;
  return new Matrix4()
    .makeTranslation(
      (fitMercator[0] - rootMercator[0]) * projectedToScene,
      0,
      -(fitMercator[1] - rootMercator[1]) * projectedToScene
    )
    .multiply(
      new Matrix4().makeScale(
        scale *
          (correctEllipsoidMetric ? EARTH_RADIUS / primeVerticalRadius : 1),
        scale,
        scale * (correctEllipsoidMetric ? EARTH_RADIUS / meridianRadius : 1)
      )
    )
    .multiply(ENU_TO_SCENE)
    .multiply(ecefToEnuMatrix(fitEcef))
    .multiply(ecefToEnuMatrix(rootEcef).invert())
    .multiply(ENU_TO_SCENE.clone().invert());
};
