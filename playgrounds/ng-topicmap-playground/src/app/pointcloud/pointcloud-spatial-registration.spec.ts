import { describe, expect, it } from "vitest";

import type { Coordinates } from "@carma-geo/data-structures";
import { getGcg2016UndulationFromUtm } from "@carma-geo/proj";

import {
  applyCopcRigidRegistration,
  AWG2_DGM1_RIGID_REGISTRATION,
  AWG2_GCG2016_UNDULATION_METERS,
  AWG2_MESH_2024_MICRO_CORRECTION,
  AWG2_REGISTRATION_PROVENANCE,
  deriveCopcRigidMountPose,
  estimateRegistrationAgainstReferenceSurface,
  KWH_TERRAIN_MESH_ALIGNMENT_CANDIDATE,
  mapEnuOffsetToScene,
  resolveCopcSourcePosition,
} from "./pointcloud-spatial-registration";

describe("AWG2 spatial registration", () => {
  it("only translates the registration anchor vertically", () => {
    const result = applyCopcRigidRegistration(
      AWG2_DGM1_RIGID_REGISTRATION.anchor,
      AWG2_DGM1_RIGID_REGISTRATION
    );

    expect(result.easting).toBeCloseTo(
      AWG2_DGM1_RIGID_REGISTRATION.anchor.easting,
      9
    );
    expect(result.northing).toBeCloseTo(
      AWG2_DGM1_RIGID_REGISTRATION.anchor.northing,
      9
    );
    expect(result.height).toBeCloseTo(
      AWG2_DGM1_RIGID_REGISTRATION.anchor.height +
        AWG2_DGM1_RIGID_REGISTRATION.translationUpMeters,
      9
    );
  });

  it("raises the north side and lowers the east side", () => {
    const anchor = AWG2_DGM1_RIGID_REGISTRATION.anchor;
    const north = applyCopcRigidRegistration(
      { ...anchor, northing: anchor.northing + 100 },
      AWG2_DGM1_RIGID_REGISTRATION
    );
    const east = applyCopcRigidRegistration(
      { ...anchor, easting: anchor.easting + 100 },
      AWG2_DGM1_RIGID_REGISTRATION
    );
    const registeredAnchor = applyCopcRigidRegistration(
      anchor,
      AWG2_DGM1_RIGID_REGISTRATION
    );

    expect(north.height).toBeGreaterThan(registeredAnchor.height + 8);
    expect(east.height).toBeLessThan(registeredAnchor.height - 7);
  });

  it("exposes the registration as a point and orthonormal ENU basis", () => {
    const pose = deriveCopcRigidMountPose(
      AWG2_DGM1_RIGID_REGISTRATION.anchor,
      AWG2_DGM1_RIGID_REGISTRATION
    );
    const vectors = Object.values(pose.axes);
    const dot = (a: (typeof vectors)[number], b: (typeof vectors)[number]) =>
      a.east * b.east + a.north * b.north + a.up * b.up;

    expect(pose.mountedAnchor.height).toBeCloseTo(
      pose.sourceAnchor.height +
        AWG2_DGM1_RIGID_REGISTRATION.translationUpMeters,
      9
    );
    vectors.forEach((vector) => expect(dot(vector, vector)).toBeCloseTo(1, 12));
    expect(dot(vectors[0], vectors[1])).toBeCloseTo(0, 12);
    expect(dot(vectors[0], vectors[2])).toBeCloseTo(0, 12);
    expect(dot(vectors[1], vectors[2])).toBeCloseTo(0, 12);
  });

  it("maps ENU correction into MapLibre scene axes", () => {
    expect(mapEnuOffsetToScene(2.5, -3.25, 4.75)).toEqual([2.5, 4.75, 3.25]);
  });

  it("resolves the registered anchor without mutating the source position", () => {
    const sourcePosition = {
      easting: 370_000,
      northing: 5_680_000,
      height: 200,
    };
    const result = resolveCopcSourcePosition(
      sourcePosition,
      AWG2_DGM1_RIGID_REGISTRATION
    );

    expect(result).toEqual(
      applyCopcRigidRegistration(sourcePosition, AWG2_DGM1_RIGID_REGISTRATION)
    );
    expect(sourcePosition).toEqual({
      easting: 370_000,
      northing: 5_680_000,
      height: 200,
    });
  });

  it("keeps the Mesh 2024 fine alignment explicit and reproducible", () => {
    expect(AWG2_MESH_2024_MICRO_CORRECTION).toEqual({
      offsetEast: 1.7,
      offsetNorth: -1,
      offsetUp: 3.7,
    });
    expect(
      AWG2_REGISTRATION_PROVENANCE.mesh2024MicroCorrectionEnuMeters
    ).toEqual({ east: 1.7, north: -1, up: 3.7 });
  });

  it("keeps the DHHN2016-to-ellipsoid term separate from registration", async () => {
    const { easting, northing } = AWG2_DGM1_RIGID_REGISTRATION.anchor;
    const undulation = await getGcg2016UndulationFromUtm({
      east: easting as Coordinates.ETRS89UTMEastingMeters,
      north: northing as Coordinates.ETRS89UTMNorthingMeters,
      zone: 32,
    });

    expect(undulation).toBeCloseTo(AWG2_GCG2016_UNDULATION_METERS, 8);
    expect(
      AWG2_REGISTRATION_PROVENANCE.verticalDatumTransformAtAnchor
        .undulationMeters
    ).toBe(AWG2_GCG2016_UNDULATION_METERS);
    expect(
      AWG2_REGISTRATION_PROVENANCE.residualMeters.afterTerrainDatumTransform
        .median
    ).toBeCloseTo(
      AWG2_REGISTRATION_PROVENANCE.residualMeters.rawPointMinusDhhn2016Terrain
        .median - AWG2_GCG2016_UNDULATION_METERS,
      6
    );
  });

  it("documents a candidate KWH terrain-mesh alignment offset", () => {
    expect(KWH_TERRAIN_MESH_ALIGNMENT_CANDIDATE).toEqual({
      offsetEast: 1.8,
      offsetNorth: 1.9,
      offsetUp: 0,
    });
    expect(KWH_TERRAIN_MESH_ALIGNMENT_CANDIDATE.offsetEast).toBeCloseTo(1.8, 9);
    expect(KWH_TERRAIN_MESH_ALIGNMENT_CANDIDATE.offsetNorth).toBeCloseTo(1.9, 9);
    expect(KWH_TERRAIN_MESH_ALIGNMENT_CANDIDATE.offsetUp).toBeCloseTo(0, 9);
  });

  it("prefers a tilt-aware fit when the reference surface is sloped", () => {
    const anchor = { easting: 370_000, northing: 5_680_000, height: 200 };
    const trueRegistration = {
      anchor,
      rotationEastDegrees: 2.25,
      rotationNorthDegrees: 1.5,
      translationUpMeters: 0.4,
    };
    const sourceSamples = [
      { easting: anchor.easting + 4, northing: anchor.northing + 3, height: 210 },
      { easting: anchor.easting - 3, northing: anchor.northing + 5, height: 205 },
      { easting: anchor.easting + 2, northing: anchor.northing - 4, height: 208 },
      { easting: anchor.easting - 5, northing: anchor.northing - 2, height: 202 },
    ];
    const transformedSamples = sourceSamples.map((sample) =>
      applyCopcRigidRegistration(sample, trueRegistration)
    );

    const referenceSurface = (easting: number, northing: number) => {
      const bestFit = transformedSamples[0];
      return (
        bestFit.height +
        0.01 * (easting - bestFit.easting) -
        0.012 * (northing - bestFit.northing)
      );
    };

    const tiltFreeFit = estimateRegistrationAgainstReferenceSurface(
      sourceSamples,
      referenceSurface,
      { searchRadiusMeters: 2, searchStepMeters: 0.4, enableRotation: false, anchor }
    );
    const tiltAwareFit = estimateRegistrationAgainstReferenceSurface(
      sourceSamples,
      referenceSurface,
      {
        searchRadiusMeters: 2,
        searchStepMeters: 0.4,
        enableRotation: true,
        anchor,
        rotationSeedDegrees: { east: 2.25, north: 1.5 },
        rotationSearchWindowDegrees: 0.75,
        rotationStepDegrees: 0.25,
      }
    );

    expect(tiltFreeFit.meanAbsoluteErrorMeters).toBeGreaterThan(
      tiltAwareFit.meanAbsoluteErrorMeters
    );
    expect(tiltAwareFit.rotationEastDegrees).toBeCloseTo(2.25, 0);
    expect(tiltAwareFit.rotationNorthDegrees).toBeCloseTo(1.5, 0);
  });
});
