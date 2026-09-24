// @vitest-environment jsdom
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // MapLibre's module bootstrap constructs a worker URL; no worker is used by
  // these numerical tests. Keep the actual projection and solar math intact.
  URL.createObjectURL = () => "blob:reference-test";
});

import { getSolarPosition } from "@carma-mapping/shadow-simulation";
import { NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";

import {
  REFERENCE_CAMERA_PRESET,
  REFERENCE_PHYSICAL_CAMERA_POSES,
  TERRAIN_GEOMETRY_MODE,
  WGS84_REFERENCE_AXES,
  createReferenceFrame,
  localUpAt,
  projectGeodeticToScene,
  projectMercatorToScene,
} from "./maplibre-three-reference-surfaces";

const directionAngles = (
  frame: ReturnType<typeof createReferenceFrame>,
  eye: readonly [longitude: number, latitude: number, heightMeters: number],
  target: readonly [longitude: number, latitude: number, heightMeters: number]
) => {
  const eyePosition = projectGeodeticToScene(
    frame,
    eye[0],
    eye[1],
    eye[2],
    TERRAIN_GEOMETRY_MODE.WGS84_ECEF
  );
  const targetPosition = projectGeodeticToScene(
    frame,
    target[0],
    target[1],
    target[2],
    TERRAIN_GEOMETRY_MODE.WGS84_ECEF
  );
  const direction = targetPosition.sub(eyePosition);
  return {
    bearingDegrees:
      (THREE.MathUtils.radToDeg(Math.atan2(direction.x, -direction.z)) + 360) %
      360,
    elevationDegrees: THREE.MathUtils.radToDeg(
      Math.atan2(direction.y, Math.hypot(direction.x, direction.z))
    ),
  };
};

describe("reference-surface physical coordinates", () => {
  it("uses the sourced Langenberg mast top without a fictitious summit height", () => {
    const pose =
      REFERENCE_PHYSICAL_CAMERA_POSES[
        REFERENCE_CAMERA_PRESET.TOELLETURM_TO_LANGENBERG
      ];
    expect(pose.targetNormalHeightMeters).toBeCloseTo(540.25, 2);
    expect(pose.distanceMeters).toBeGreaterThan(11_000);
    expect(pose.distanceMeters).toBeLessThan(13_000);
    const angles = directionAngles(
      createReferenceFrame(
        pose.eyeLngLat,
        WGS84_REFERENCE_AXES.defaultLocalSphereRadiusMeters
      ),
      [...pose.eyeLngLat, pose.eyeNormalHeightMeters],
      [...pose.targetLngLat, pose.targetNormalHeightMeters]
    );
    expect(angles.elevationDegrees).toBeGreaterThan(0.7);
    expect(angles.elevationDegrees).toBeLessThan(1);
  });
  it("keeps the Toelleturm observer three metres above the measured DOM top", () => {
    const pose =
      REFERENCE_PHYSICAL_CAMERA_POSES[
        REFERENCE_CAMERA_PRESET.TOELLETURM_TO_NORDHELLE
      ];

    expect(pose.eyeNormalHeightMeters - 358.3477).toBeCloseTo(3, 6);
  });

  it("derives the expected ECEF line-of-sight angles in both directions", () => {
    const forward =
      REFERENCE_PHYSICAL_CAMERA_POSES[
        REFERENCE_CAMERA_PRESET.TOELLETURM_TO_NORDHELLE
      ];
    const forwardFrame = createReferenceFrame(
      forward.eyeLngLat,
      WGS84_REFERENCE_AXES.defaultLocalSphereRadiusMeters
    );
    const forwardAngles = directionAngles(
      forwardFrame,
      [...forward.eyeLngLat, forward.eyeNormalHeightMeters],
      [...forward.targetLngLat, forward.targetNormalHeightMeters]
    );

    expect(forwardAngles.bearingDegrees).toBeCloseTo(107.15345, 4);
    expect(forwardAngles.elevationDegrees).toBeCloseTo(0.27826, 4);

    const reverse =
      REFERENCE_PHYSICAL_CAMERA_POSES[
        REFERENCE_CAMERA_PRESET.NORDHELLE_TO_TOELLETURM
      ];
    const reverseFrame = createReferenceFrame(
      reverse.eyeLngLat,
      WGS84_REFERENCE_AXES.defaultLocalSphereRadiusMeters
    );
    const reverseAngles = directionAngles(
      reverseFrame,
      [...reverse.eyeLngLat, reverse.eyeNormalHeightMeters],
      [...reverse.targetLngLat, reverse.targetNormalHeightMeters]
    );

    expect(reverseAngles.bearingDegrees).toBeCloseTo(287.58441, 4);
    expect(reverseAngles.elevationDegrees).toBeCloseTo(-0.92853, 4);
  });

  it("keeps raw Mercator height separate from ellipsoidal datum correction", () => {
    const pose =
      REFERENCE_PHYSICAL_CAMERA_POSES[
        REFERENCE_CAMERA_PRESET.TOELLETURM_TO_NORDHELLE
      ];
    const frame = createReferenceFrame(
      pose.eyeLngLat,
      WGS84_REFERENCE_AXES.defaultLocalSphereRadiusMeters
    );
    const normalHeightMeters = 500;
    const undulationMeters = 46;
    const raw = projectMercatorToScene(
      frame,
      pose.targetLngLat[0],
      pose.targetLngLat[1],
      normalHeightMeters
    );
    const correctedNormal = projectGeodeticToScene(
      frame,
      pose.targetLngLat[0],
      pose.targetLngLat[1],
      normalHeightMeters,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF
    );
    const correctedEllipsoidal = projectGeodeticToScene(
      frame,
      pose.targetLngLat[0],
      pose.targetLngLat[1],
      normalHeightMeters + undulationMeters,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF
    );
    const localUp = localUpAt(
      frame,
      pose.targetLngLat[0],
      pose.targetLngLat[1]
    );

    expect(raw.y).toBeCloseTo(
      (normalHeightMeters *
        Math.cos(THREE.MathUtils.degToRad(pose.eyeLngLat[1]))) /
        Math.cos(THREE.MathUtils.degToRad(pose.targetLngLat[1])),
      5
    );
    expect(
      correctedEllipsoidal.clone().sub(correctedNormal).dot(localUp)
    ).toBeCloseTo(undulationMeters, 5);
    expect(correctedNormal.y).toBeLessThan(raw.y);
  });

  it("keeps the sampled NRW flat-to-curved displacement inside the story padding", () => {
    const [west, south, east, north] =
      NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN.bounds;
    const origins = [
      [7.1999207, 51.2725716],
      REFERENCE_PHYSICAL_CAMERA_POSES[
        REFERENCE_CAMERA_PRESET.TOELLETURM_TO_NORDHELLE
      ].eyeLngLat,
      REFERENCE_PHYSICAL_CAMERA_POSES[
        REFERENCE_CAMERA_PRESET.NORDHELLE_TO_TOELLETURM
      ].eyeLngLat,
    ] as const;
    const modes = [
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
      TERRAIN_GEOMETRY_MODE.LOCAL_SPHERE,
    ] as const;
    const maximumDisplacement = new THREE.Vector3();
    const divisions = 64;
    const conservativeHeightCorrectionMeters = 64;
    const normalHeightsMeters = [38.95, 722.3] as const;

    for (const origin of origins) {
      const frame = createReferenceFrame(
        origin,
        WGS84_REFERENCE_AXES.defaultLocalSphereRadiusMeters
      );
      for (const mode of modes) {
        for (let row = 0; row <= divisions; row += 1) {
          const latitude = south + ((north - south) * row) / divisions;
          for (let column = 0; column <= divisions; column += 1) {
            const longitude = west + ((east - west) * column) / divisions;
            for (const normalHeightMeters of normalHeightsMeters) {
              const raw = projectMercatorToScene(
                frame,
                longitude,
                latitude,
                normalHeightMeters
              );
              const curved = projectGeodeticToScene(
                frame,
                longitude,
                latitude,
                normalHeightMeters + conservativeHeightCorrectionMeters,
                mode
              );
              const displacement = curved.sub(raw);
              maximumDisplacement.set(
                Math.max(maximumDisplacement.x, Math.abs(displacement.x)),
                Math.max(maximumDisplacement.y, Math.abs(displacement.y)),
                Math.max(maximumDisplacement.z, Math.abs(displacement.z))
              );
            }
          }
        }
      }
    }

    // This is a deterministic 65 x 65 fixture over the declared source box,
    // not an analytic proof of the continuous extrema. It deliberately covers
    // both corrected models and the three origins used by the stories.
    expect(maximumDisplacement.toArray()).toEqual([
      expect.closeTo(886.626, 3),
      expect.closeTo(747.006, 3),
      expect.closeTo(769.356, 3),
    ]);
    expect(Math.max(...maximumDisplacement.toArray())).toBeLessThan(1_500);
  });
});

describe("reference-surface horizon sun presets", () => {
  it.each([
    {
      label: "sunrise",
      dayOfYear: 52,
      minutes: 7 * 60 + 40,
      location: { latitude: 51.25656, longitude: 7.20158 },
      expectedAzimuthDegrees: 107.3,
    },
    {
      label: "sunset",
      dayOfYear: 235,
      minutes: 20 * 60 + 27,
      location: { latitude: 51.1478994995, longitude: 7.7545505762 },
      expectedAzimuthDegrees: 287.78,
    },
  ])(
    "places the $label sun just above the intended horizon",
    ({ dayOfYear, minutes, location, expectedAzimuthDegrees }) => {
      const solarPosition = getSolarPosition(
        {
          year: 2026,
          dayOfYear,
          minutes,
          timeZone: "Europe/Berlin",
        },
        location
      );

      expect(solarPosition.azimuthDegrees).toBeCloseTo(
        expectedAzimuthDegrees,
        1
      );
      expect(solarPosition.elevationDegrees).toBeGreaterThan(0.1);
      expect(solarPosition.elevationDegrees).toBeLessThan(0.4);
    }
  );
});
