import * as THREE from "three";

import { getFromUTM32ToWGS84 } from "@carma-geo/proj";

/**
 * The panorama poses and images are published next to the other investigation
 * data, so the stories work without a machine-specific .env.local. Set
 * VITE_PANORAMA_BASE_URL to point at another mirror.
 */
const PUBLISHED_PANORAMA_BASE_URL =
  "https://wupp-3d-data.cismet.de/mesh2024/panorama";

const PANORAMA_BASE_URL = (
  import.meta.env.VITE_PANORAMA_BASE_URL ?? PUBLISHED_PANORAMA_BASE_URL
).replace(/\/$/, "");

export const PANORAMA_REFERENCE_URL = PANORAMA_BASE_URL
  ? `${PANORAMA_BASE_URL}/reference.csv`
  : "";

/**
 * Resource-wide pose correction requested from an operator-observed common
 * bias against the 2024 photogrammetry mesh. It is deliberately not modelled
 * as UTM grid convergence: PROJ returns -1.4573° to -1.4491° over the survey
 * bounds, which neither has the observed magnitude nor the applied sign. The
 * upstream sensor/export convention remains unverified, so this bias must
 * stay traceable and separate from per-panorama micro-corrections.
 */
export const PANORAMA_RESOURCE_ORIENTATION_CORRECTION = {
  id: "PANO-HEADING-2024-v1",
  bearingDegrees: 2.3,
  pitchDegrees: 0,
  rollDegrees: 0,
  basis: "operator-observed-empirical-registration-against-mesh-2024",
  evidenceStatus: "not-independently-surveyed",
  documentedAt: "2026-07-17",
  source: PANORAMA_REFERENCE_URL,
  appliesTo: "all-poses-in-panorama-reference",
} as const;

export type ImagePose = {
  id: string;
  kind: "pano";
  utm: [number, number, number];
  lngLat: [number, number];
  headingRad: number;
  rollRad: number;
  pitchRad: number;
  resourceOrientationCorrection: typeof PANORAMA_RESOURCE_ORIENTATION_CORRECTION;
  imageUrl: string;
  sourceHeights: {
    ellipsoidal: number;
    projectedDhhN: number;
  };
};

export const loadPanoPoses = async (): Promise<ImagePose[]> => {
  if (!PANORAMA_REFERENCE_URL) {
    throw new Error("VITE_PANORAMA_BASE_URL is not configured");
  }
  const response = await fetch(PANORAMA_REFERENCE_URL);
  if (!response.ok) {
    throw new Error(
      `Panorama-Posen konnten nicht geladen werden: ${response.status} ${response.statusText}`
    );
  }
  const text = await response.text();
  const poses: ImagePose[] = [];
  for (const line of text.trim().split("\n").slice(1)) {
    const columns = line.split("\t");
    if (columns.length < 11) continue;
    const id = columns[1].trim();
    const ellipsoidalHeight = Number(columns[4]);
    const roll = Number(columns[5]);
    const pitch = Number(columns[6]);
    const heading = Number(columns[7]);
    const east = Number(columns[8]);
    const north = Number(columns[9]);
    const projectedDhhNHeight = Number(columns[10]);
    if (
      !id ||
      ![
        ellipsoidalHeight,
        roll,
        pitch,
        heading,
        east,
        north,
        projectedDhhNHeight,
      ].every(Number.isFinite)
    )
      continue;
    poses.push({
      id,
      kind: "pano",
      // The scene uses ETRS89 ellipsoidal heights. Keep projectedZ from the
      // primary source alongside it for DHHN2016 comparisons and exports.
      utm: [east, north, ellipsoidalHeight],
      lngLat: getFromUTM32ToWGS84([east, north]) as [number, number],
      headingRad: THREE.MathUtils.degToRad(heading),
      rollRad: THREE.MathUtils.degToRad(roll),
      pitchRad: THREE.MathUtils.degToRad(pitch),
      resourceOrientationCorrection: PANORAMA_RESOURCE_ORIENTATION_CORRECTION,
      imageUrl: `${PANORAMA_BASE_URL}/${id}.jpg`,
      sourceHeights: {
        ellipsoidal: ellipsoidalHeight,
        projectedDhhN: projectedDhhNHeight,
      },
    });
  }
  return poses;
};
