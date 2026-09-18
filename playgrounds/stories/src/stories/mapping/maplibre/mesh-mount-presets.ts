import type { BBox2d } from "@turf/helpers";
import { MercatorCoordinate } from "maplibre-gl";
import { Matrix4, Vector3 } from "three";

import { WUPP_MESH_2024_ROOT_REFERENCE } from "@carma-commons/resources";
import {
  cartographicToEcef,
  ecefToCartographic,
  ecefToEnuOffset,
  getMercatorScaleFactorAtLatitudeRad,
} from "@carma-geo/proj";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";

/** Shared source snapshot; interpreted on WGS84 without certifying its datum. */
export const MESH_MOUNT_ROOT = WUPP_MESH_2024_ROOT_REFERENCE;

export const MESH_MOUNT_VIEW = {
  ROOT: "root-origin",
  NORTH: "north-extent",
  SOUTH: "south-extent",
  FAR: "farthest-comparison",
} as const;

export type MeshMountView =
  (typeof MESH_MOUNT_VIEW)[keyof typeof MESH_MOUNT_VIEW];

export const MESH_MOUNT_ANCHOR = {
  ROOT: "fixed-root",
  VIEW: "view-preset",
} as const;

export type MeshMountAnchor =
  (typeof MESH_MOUNT_ANCHOR)[keyof typeof MESH_MOUNT_ANCHOR];

export type MeshMountPreset = {
  label: string;
  locationSource?: string;
  lngLat: [number, number];
  ecef: readonly [number, number, number];
  wgs84HeightMeters: number;
  northOfRootMeters: number;
  horizontalDistanceFromRootMeters: number;
  mercatorScaleFromRoot: number;
};

const transform = new Matrix4().fromArray(MESH_MOUNT_ROOT.transform);
const origin = new Vector3().setFromMatrixPosition(transform);
const center = new Vector3().fromArray(MESH_MOUNT_ROOT.box);
const centerEcef = center.clone().applyMatrix4(transform);
const halfAxes = [3, 6, 9].map((offset) =>
  new Vector3().fromArray(MESH_MOUNT_ROOT.box, offset)
);
// Camera candidates, not a claim that the entire OBB contains source content.
const longestAxis = [...halfAxes].sort(
  (a, b) => b.lengthSq() - a.lengthSq()
)[0];
export const MESH_LONG_AXIS_ENDPOINTS = [-0.8, 0.8].map((fraction) => {
  const point = ecefToCartographic(
    center
      .clone()
      .addScaledVector(longestAxis, fraction)
      .applyMatrix4(transform)
  );
  return [
    radToDegNumeric(point.longitude),
    radToDegNumeric(point.latitude),
  ] as const;
});
const northAxis = halfAxes
  .map((axis) => ({
    axis,
    north: ecefToEnuOffset(
      center.clone().add(axis).applyMatrix4(transform),
      centerEcef
    ).north,
  }))
  .sort((a, b) => Math.abs(b.north) - Math.abs(a.north))[0];
const northHalfAxis = northAxis.axis
  .clone()
  .multiplyScalar(Math.sign(northAxis.north));
const rootCartographic = ecefToCartographic(origin);
const rootMercatorScale = getMercatorScaleFactorAtLatitudeRad(
  rootCartographic.latitude
);

const presetAt = (label: string, ecef: Vector3): MeshMountPreset => {
  const cartographic = ecefToCartographic(ecef);
  const offset = ecefToEnuOffset(ecef, origin);
  return {
    label,
    lngLat: [
      radToDegNumeric(cartographic.longitude),
      radToDegNumeric(cartographic.latitude),
    ],
    ecef: [ecef.x, ecef.y, ecef.z],
    wgs84HeightMeters: cartographic.altitude,
    northOfRootMeters: offset.north,
    horizontalDistanceFromRootMeters: Math.hypot(offset.east, offset.north),
    mercatorScaleFromRoot:
      getMercatorScaleFactorAtLatitudeRad(cartographic.latitude) /
      rootMercatorScale,
  };
};

/** Five percent of the north HALF-extent: 431.025 m inward from each face. */
export const MESH_MOUNT_EDGE_FRACTION = 0.95;

const farthestModelCorner = Array.from({ length: 8 }, (_, index) => {
  const corner = center.clone();
  halfAxes.forEach((axis, axisIndex) =>
    corner.addScaledVector(
      axis,
      (index & (1 << axisIndex) ? 1 : -1) * MESH_MOUNT_EDGE_FRACTION
    )
  );
  return presetAt(
    "Farthest inset OBB corner · model only",
    corner.applyMatrix4(transform)
  );
}).sort(
  (a, b) =>
    b.horizontalDistanceFromRootMeters - a.horizontalDistanceFromRootMeters
)[0];

export const MESH_MOUNT_MODEL_PROBES: Record<MeshMountView, MeshMountPreset> = {
  [MESH_MOUNT_VIEW.FAR]: farthestModelCorner,
  [MESH_MOUNT_VIEW.ROOT]: presetAt("Root matrix origin", origin),
  [MESH_MOUNT_VIEW.NORTH]: presetAt(
    "North root extent · 5% inset",
    center
      .clone()
      .addScaledVector(northHalfAxis, MESH_MOUNT_EDGE_FRACTION)
      .applyMatrix4(transform)
  ),
  [MESH_MOUNT_VIEW.SOUTH]: presetAt(
    "South root extent · 5% inset",
    center
      .clone()
      .addScaledVector(northHalfAxis, -MESH_MOUNT_EDGE_FRACTION)
      .applyMatrix4(transform)
  ),
};

/**
 * Built-up comparison locations, not claims of the farthest covered mesh edge.
 * Paul-Flocke-Weg: camera coordinate supplied by the user (2026-09-14).
 * Cronenberg: LVR KuLaDig historic centre coordinate (retrieved 2026-09-14).
 * Height zero is used ONLY to derive a view position; it is not a ground survey.
 * The separate OBB model probes above retain their original regression values.
 * These coordinates do not certify the position of a dataset coverage edge.
 */
export const MESH_MOUNT_PRESETS: Record<MeshMountView, MeshMountPreset> = {
  [MESH_MOUNT_VIEW.FAR]: {
    ...presetAt(
      "Stoffelsberg · building comparison",
      cartographicToEcef(
        degToRadNumeric(7.301936111),
        degToRadNumeric(51.23815),
        0
      )
    ),
    locationSource: "https://de.wikipedia.org/wiki/Stoffelsberg",
  },
  [MESH_MOUNT_VIEW.ROOT]: MESH_MOUNT_MODEL_PROBES[MESH_MOUNT_VIEW.ROOT],
  [MESH_MOUNT_VIEW.NORTH]: {
    ...presetAt(
      "Paul-Flocke-Weg · north end",
      cartographicToEcef(
        degToRadNumeric(7.2496096),
        degToRadNumeric(51.314393),
        0
      )
    ),
    locationSource:
      "https://www.google.com/maps/@51.314393,7.2496096,53m/data=!3m1!1e3",
  },
  [MESH_MOUNT_VIEW.SOUTH]: {
    ...presetAt(
      "Cronenberg · historic centre",
      cartographicToEcef(degToRadNumeric(7.12825), degToRadNumeric(51.20561), 0)
    ),
    locationSource: "https://www.kuladig.de/Objektansicht/O-63310-20130329-14",
  },
};

/** Row-major layout. FAR retains its stable key but now names Stoffelsberg. */
export const MESH_MOUNT_COMPARISON_VIEWS = [
  MESH_MOUNT_VIEW.ROOT,
  MESH_MOUNT_VIEW.NORTH,
  MESH_MOUNT_VIEW.FAR,
  MESH_MOUNT_VIEW.SOUTH,
] as const;

const corners = Array.from({ length: 8 }, (_, index) => {
  const corner = center.clone();
  halfAxes.forEach((axis, axisIndex) =>
    corner.addScaledVector(axis, index & (1 << axisIndex) ? 1 : -1)
  );
  return presetAt("Root bounding-box corner", corner.applyMatrix4(transform));
});

/** Geographic envelope of the root OBB; it does not promise content everywhere. */
export const MESH_MOUNT_BOUNDS: BBox2d = [
  Math.min(...corners.map((corner) => corner.lngLat[0])),
  Math.min(...corners.map((corner) => corner.lngLat[1])),
  Math.max(...corners.map((corner) => corner.lngLat[0])),
  Math.max(...corners.map((corner) => corner.lngLat[1])),
];

/**
 * Coordinate-model samples, NOT measured mesh/image errors or citywide maxima.
 * Compare the SAME WGS84-interpreted point and ellipsoidal height in exact
 * MapLibre Mercator versus rigid ECEF/ENU at the root lon/lat, h=0. The OBB
 * mid-height probes are not surveyed ground or rooftop vertices.
 *
 * Preset     horizontal (m)   planar minus rigid up (m)
 * Root       0.000000         0.000000
 * North      2.061747         5.695818
 * South     10.852445         4.834070
 *
 * The local Mercator scale ratio above is a separate diagnostic, not an error.
 */
export const MESH_MOUNT_MODEL_RESIDUALS = (() => {
  const root = MESH_MOUNT_MODEL_PROBES[MESH_MOUNT_VIEW.ROOT];
  const reference = MercatorCoordinate.fromLngLat(root.lngLat, 0);
  const unitsPerMeter = reference.meterInMercatorCoordinateUnits();
  const referenceEcef = cartographicToEcef(
    degToRadNumeric(root.lngLat[0]),
    degToRadNumeric(root.lngLat[1]),
    0
  );
  return Object.fromEntries(
    Object.entries(MESH_MOUNT_MODEL_PROBES).map(([view, preset]) => {
      const projected = MercatorCoordinate.fromLngLat(
        preset.lngLat,
        preset.wgs84HeightMeters
      );
      const rigid = ecefToEnuOffset(
        new Vector3().fromArray(preset.ecef),
        referenceEcef
      );
      const east = (projected.x - reference.x) / unitsPerMeter - rigid.east;
      const north = -(projected.y - reference.y) / unitsPerMeter - rigid.north;
      return [
        view,
        {
          eastMeters: east,
          northMeters: north,
          horizontalMeters: Math.hypot(east, north),
          upMeters: (projected.z - reference.z) / unitsPerMeter - rigid.up,
        },
      ];
    })
  ) as Record<
    MeshMountView,
    {
      eastMeters: number;
      northMeters: number;
      horizontalMeters: number;
      upMeters: number;
    }
  >;
})();

/** MapLibre clamps its public perspective FOV to at least 0.1 degrees. */
export const MESH_MOUNT_REFERENCE_FOV_DEGREES = 0.1;

/**
 * Top-down pinhole-camera diagnostic; not a true orthographic projection.
 * For a point in the z=0 footprint at radius r and |z| <= reliefEnvelopeMeters,
 * radial relief displacement is bounded by r * envelope / (cameraHeight-envelope).
 * The 1000 m envelope is an explicit assumption, NOT a certified mesh datum.
 * Moving the camera target elevation alone cannot make both z=0 imagery and
 * elevated mesh vertices share one projection plane.
 */
export const getMeshMountProjectionDiagnostics = ({
  width,
  height,
  groundMetersPerPixel,
  verticalFovDegrees,
  reliefEnvelopeMeters = 1000,
}: {
  width: number;
  height: number;
  groundMetersPerPixel: number;
  verticalFovDegrees: number;
  reliefEnvelopeMeters?: number;
}) => {
  const cameraHeightMeters =
    (height * groundMetersPerPixel) /
    (2 * Math.tan(degToRadNumeric(verticalFovDegrees) / 2));
  const radiusPixels = Math.hypot(width, height) / 2;
  const reliefParallaxBoundPixels =
    cameraHeightMeters > reliefEnvelopeMeters
      ? (radiusPixels * reliefEnvelopeMeters) /
        (cameraHeightMeters - reliefEnvelopeMeters)
      : null;
  return {
    verticalFovDegrees,
    groundMetersPerPixel,
    footprintWidthMeters: width * groundMetersPerPixel,
    footprintHeightMeters: height * groundMetersPerPixel,
    cameraHeightMeters,
    reliefEnvelopeMeters,
    reliefParallaxBoundPixels,
    reliefParallaxBoundMeters:
      reliefParallaxBoundPixels === null
        ? null
        : reliefParallaxBoundPixels * groundMetersPerPixel,
  };
};
