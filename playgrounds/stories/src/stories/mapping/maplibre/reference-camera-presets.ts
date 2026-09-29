import * as THREE from "three";

import { LANGENBERG_LANDMARKS } from "@carma-commons/resources";
import { cartographicToEcef, ecefToEnuOffset } from "@carma-geo/proj";

export const REFERENCE_CAMERA_PRESET = {
  MAP_TARGET: "map-target",
  TOELLETURM_TO_NORDHELLE: "toelleturm-to-nordhelle",
  NORDHELLE_TO_TOELLETURM: "nordhelle-to-toelleturm",
  TOELLETURM_TO_LANGENBERG: "toelleturm-to-langenberg",
} as const;

export type ReferenceCameraPreset =
  (typeof REFERENCE_CAMERA_PRESET)[keyof typeof REFERENCE_CAMERA_PRESET];

export type ReferencePhysicalCameraPose = Readonly<{
  label: string;
  eyeLngLat: readonly [longitude: number, latitude: number];
  targetLngLat: readonly [longitude: number, latitude: number];
  eyeNormalHeightMeters: number;
  targetNormalHeightMeters: number;
  bearingDegrees: number;
  pitchDegrees: number;
  distanceMeters: number;
}>;

/**
 * A measured, real-world line of sight used by the horizon presets.
 *
 * The Wuppertal DOM1 resolves the Toelleturm top at 358.35 m DHHN2016. The
 * clipped Nordhelle tile reaches 662.94 m in DGM1 and 686.36 m in DOM1. The
 * camera targets the latter surface pixel: its 40.38 km corridor has at least
 * 24.86 m geometric clearance over the sampled DOM1 profile. The Robert-Kolb
 * and WDR towers are beyond the published coverage polygon and are deliberately
 * not claimed as covered geometry.
 */
export const REFERENCE_PHYSICAL_CAMERA_POSES: Readonly<
  Record<
    Exclude<ReferenceCameraPreset, typeof REFERENCE_CAMERA_PRESET.MAP_TARGET>,
    ReferencePhysicalCameraPose
  >
> = {
  [REFERENCE_CAMERA_PRESET.TOELLETURM_TO_LANGENBERG]: (() => {
    const mast = LANGENBERG_LANDMARKS[0];
    const eyeLngLat = [7.20158, 51.25656] as const;
    const eyeNormalHeightMeters = 361.3477;
    const targetNormalHeightMeters =
      mast.groundNormalHeightMeters + mast.heightMeters;
    const offset = ecefToEnuOffset(
      cartographicToEcef(
        THREE.MathUtils.degToRad(mast.longitudeDegrees),
        THREE.MathUtils.degToRad(mast.latitudeDegrees),
        targetNormalHeightMeters
      ),
      cartographicToEcef(
        THREE.MathUtils.degToRad(eyeLngLat[0]),
        THREE.MathUtils.degToRad(eyeLngLat[1]),
        eyeNormalHeightMeters
      )
    );
    // Approximate heading/distance labels only; the camera recomputes its
    // physical direction with per-location GCG2016 before rendering.
    return {
      label: "Toelleturm DOM top +3 m → Langenberg Hordt mast",
      eyeLngLat,
      eyeNormalHeightMeters,
      targetLngLat: [mast.longitudeDegrees, mast.latitudeDegrees] as const,
      targetNormalHeightMeters,
      bearingDegrees:
        (THREE.MathUtils.radToDeg(Math.atan2(offset.east, offset.north)) +
          360) %
        360,
      pitchDegrees: 89.9,
      distanceMeters: Math.hypot(offset.east, offset.north),
    };
  })(),
  [REFERENCE_CAMERA_PRESET.TOELLETURM_TO_NORDHELLE]: {
    label: "Toelleturm DOM top +3 m → highest covered Nordhelle DOM",
    eyeLngLat: [7.20158, 51.25656],
    targetLngLat: [7.7545505762, 51.1478994995],
    eyeNormalHeightMeters: 361.3477,
    targetNormalHeightMeters: 686.3633,
    bearingDegrees: 107.1966,
    pitchDegrees: 87,
    distanceMeters: 40_376.6,
  },
  [REFERENCE_CAMERA_PRESET.NORDHELLE_TO_TOELLETURM]: {
    label: "Covered Nordhelle DOM +200 m → Toelleturm / Wuppertal",
    eyeLngLat: [7.7545505762, 51.1478994995],
    targetLngLat: [7.20158, 51.25656],
    eyeNormalHeightMeters: 886.3633,
    targetNormalHeightMeters: 358.3477,
    bearingDegrees: 287.6276,
    pitchDegrees: 87,
    distanceMeters: 40_376.6,
  },
};
