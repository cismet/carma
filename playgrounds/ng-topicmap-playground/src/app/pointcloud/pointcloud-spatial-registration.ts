export interface CopcRigidRegistration {
  anchor: {
    easting: number;
    northing: number;
    height: number;
  };
  rotationEastDegrees: number;
  rotationNorthDegrees: number;
  translationUpMeters: number;
}

export interface CopcSourcePosition {
  easting: number;
  northing: number;
  height: number;
}

export interface CopcEnuVector {
  east: number;
  north: number;
  up: number;
}

/**
 * Complete scale-free mount pose in the source ENU frame.
 *
 * A position and an orthonormal basis encode the rigid transform without the
 * unused scale and homogeneous row of a 4x4 matrix.
 */
export interface CopcRigidMountPose {
  /** Pivot used for source-coordinate deltas. */
  sourceAnchor: CopcSourcePosition;
  /** Transformed position of sourceAnchor. */
  mountedAnchor: CopcSourcePosition;
  /** Source east, north and up axes expressed in the mounted ENU frame. */
  axes: {
    east: CopcEnuVector;
    north: CopcEnuVector;
    up: CopcEnuVector;
  };
}

/** Converts geographic ENU metres to MapLibre's X-east/Y-up/Z-south axes. */
export const mapEnuOffsetToScene = (
  eastMeters: number,
  northMeters: number,
  upMeters: number
): [x: number, y: number, z: number] => [eastMeters, upMeters, -northMeters];

/** Returns the exact rigid pose used by applyCopcRigidRegistration. */
export const deriveCopcRigidMountPose = (
  sourceOrigin: CopcSourcePosition,
  registration?: CopcRigidRegistration
): CopcRigidMountPose => {
  if (!registration) {
    return {
      sourceAnchor: { ...sourceOrigin },
      mountedAnchor: { ...sourceOrigin },
      axes: {
        east: { east: 1, north: 0, up: 0 },
        north: { east: 0, north: 1, up: 0 },
        up: { east: 0, north: 0, up: 1 },
      },
    };
  }

  const eastRadians = (registration.rotationEastDegrees * Math.PI) / 180;
  const northRadians = (registration.rotationNorthDegrees * Math.PI) / 180;
  const cosineEast = Math.cos(eastRadians);
  const sineEast = Math.sin(eastRadians);
  const cosineNorth = Math.cos(northRadians);
  const sineNorth = Math.sin(northRadians);

  return {
    sourceAnchor: { ...registration.anchor },
    mountedAnchor: {
      easting: registration.anchor.easting,
      northing: registration.anchor.northing,
      height: registration.anchor.height + registration.translationUpMeters,
    },
    // Columns of R_north * R_east. The order matches the point transform.
    axes: {
      east: {
        east: cosineNorth,
        north: 0,
        up: -sineNorth,
      },
      north: {
        east: sineNorth * sineEast,
        north: cosineEast,
        up: cosineNorth * sineEast,
      },
      up: {
        east: sineNorth * cosineEast,
        north: -sineEast,
        up: cosineNorth * cosineEast,
      },
    },
  };
};

/** Resolves a source ENU position into the mounted ENU frame. */
export const resolveCopcSourcePosition = (
  position: CopcSourcePosition,
  registration: CopcRigidRegistration
): CopcSourcePosition => {
  const pose = deriveCopcRigidMountPose(registration.anchor, registration);
  const east = position.easting - pose.sourceAnchor.easting;
  const north = position.northing - pose.sourceAnchor.northing;
  const up = position.height - pose.sourceAnchor.height;

  return {
    easting:
      pose.mountedAnchor.easting +
      pose.axes.east.east * east +
      pose.axes.north.east * north +
      pose.axes.up.east * up,
    northing:
      pose.mountedAnchor.northing +
      pose.axes.east.north * east +
      pose.axes.north.north * north +
      pose.axes.up.north * up,
    height:
      pose.mountedAnchor.height +
      pose.axes.east.up * east +
      pose.axes.north.up * north +
      pose.axes.up.up * up,
  };
};

/** Applies an X-east, Y-north, Z-up rigid correction around its anchor. */
export const applyCopcRigidRegistration = (
  position: CopcSourcePosition,
  registration: CopcRigidRegistration
): CopcSourcePosition => resolveCopcSourcePosition(position, registration);

/**
 * GCG2016 quasigeoid height at the AWG2 fit anchor.
 *
 * This is the datum transformation term `h_ellipsoidal = H_DHHN2016 + zeta`,
 * not an empirical point-cloud registration offset.
 */
export const AWG2_GCG2016_UNDULATION_METERS = 46.499918254;

/**
 * AWG2 mount correction fitted to class-2 points against DGM1 transformed to
 * ellipsoidal heights. It operates in source ENU before map projection.
 */
export const AWG2_DGM1_RIGID_REGISTRATION = {
  anchor: {
    easting: 370_327.584,
    northing: 5_680_082.375,
    height: 200.265,
  },
  rotationEastDegrees: 5.103344567,
  rotationNorthDegrees: 4.281994042,
  translationUpMeters: -11.042280815,
} as const satisfies CopcRigidRegistration;

/**
 * Empirical fine alignment of the registered AWG2 cloud against Mesh 2024.
 *
 * This remains separate from the DGM fit and the GCG2016 datum conversion so
 * preprocessing and the interactive mount controls can report every term.
 */
export const AWG2_MESH_2024_MICRO_CORRECTION = {
  offsetEast: 1.7,
  offsetNorth: -1,
  offsetUp: 3.7,
} as const;

export const AWG2_REGISTRATION_PROVENANCE = {
  sourceSha256:
    "2518e5dca78afd1369a18de2d165070655a7b416aa7e9b7bc2e1781b347a0ace",
  sourcePointCount: 14_720_114,
  sourceHorizontalCrs: "EPSG:25832 (assumed; COPC WKT VLR is empty)",
  sourceVerticalDatum:
    "ellipsoidal height (inferred from DGM1/GCG2016 fit; not embedded)",
  referenceHorizontalCrs: "EPSG:25832",
  referenceVerticalDatum: "EPSG:7837 DHHN2016 (provider confirmation open)",
  targetHorizontalFrame: "EPSG:3857 with a local ENU meter frame",
  targetVerticalDatum: "EPSG:7837 DHHN2016 terrain-provider height semantics",
  verticalDatumTransformAtAnchor: {
    source: "ellipsoidal height",
    target: "EPSG:7837 DHHN2016",
    model: "GCG2016",
    operation: "H_DHHN2016 = h_ellipsoidal - zeta_GCG2016",
    undulationMeters: AWG2_GCG2016_UNDULATION_METERS,
  },
  sampledGroundPoints: 63_723,
  fittedGroundPoints: 63_660,
  residualMeters: {
    rawPointMinusDhhn2016Terrain: { median: 55.593609 },
    afterTerrainDatumTransform: { median: 9.093691 },
    afterRigidRegistration: {
      median: -0.075561,
      mad: 1.560017,
      rmse: 2.163486,
    },
  },
  mesh2024MicroCorrectionEnuMeters: {
    east: AWG2_MESH_2024_MICRO_CORRECTION.offsetEast,
    north: AWG2_MESH_2024_MICRO_CORRECTION.offsetNorth,
    up: AWG2_MESH_2024_MICRO_CORRECTION.offsetUp,
  },
} as const;

/**
 * Candidate KWH terrain/mesh alignment offsets inferred from the current
 * interactive scene. This is intentionally documented as a testable candidate,
 * not a proven survey correction.
 */
export const KWH_TERRAIN_MESH_ALIGNMENT_CANDIDATE = {
  offsetEast: 1.8,
  offsetNorth: 1.9,
  offsetUp: 0,
} as const;

export interface SurfaceRegistrationFit {
  translationEastMeters: number;
  translationNorthMeters: number;
  translationUpMeters: number;
  rotationEastDegrees: number;
  rotationNorthDegrees: number;
  meanAbsoluteErrorMeters: number;
}

export interface RegistrationFitOptions {
  searchRadiusMeters: number;
  searchStepMeters: number;
  enableRotation: boolean;
  anchor?: CopcSourcePosition;
  rotationSeedDegrees?: {
    east: number;
    north: number;
  };
  rotationSearchWindowDegrees?: number;
  rotationStepDegrees?: number;
}

export interface RegistrationSample {
  easting: number;
  northing: number;
  height: number;
}

export const estimateRegistrationAgainstReferenceSurface = (
  samples: readonly RegistrationSample[],
  referenceSurface: (easting: number, northing: number) => number,
  options: RegistrationFitOptions = {
    searchRadiusMeters: 2,
    searchStepMeters: 0.1,
    enableRotation: true,
  }
): SurfaceRegistrationFit => {
  const anchor =
    options.anchor ??
    ((samples.length > 0
      ? {
          easting:
            samples.reduce((sum, sample) => sum + sample.easting, 0) /
            samples.length,
          northing:
            samples.reduce((sum, sample) => sum + sample.northing, 0) /
            samples.length,
          height:
            samples.reduce((sum, sample) => sum + sample.height, 0) /
            samples.length,
        }
      : { easting: 0, northing: 0, height: 0 }) as CopcSourcePosition);

  const steps = Math.max(
    1,
    Math.round(options.searchRadiusMeters / options.searchStepMeters)
  );
  const searchRange = steps * options.searchStepMeters;
  const rotationWindow = options.rotationSearchWindowDegrees ?? 2.5;
  const rotationStep = options.rotationStepDegrees ?? 0.25;
  const rotationSeed = options.rotationSeedDegrees ?? {
    east: 0,
    north: 0,
  };

  const rotationCandidates = options.enableRotation
    ? Array.from(
        new Map(
          Array.from(
            {
              length: Math.max(
                1,
                Math.floor((rotationWindow * 2) / rotationStep) + 1
              ),
            },
            (_, index) => {
              const east = rotationSeed.east - rotationWindow + index * rotationStep;
              return Array.from(
                {
                  length: Math.max(
                    1,
                    Math.floor((rotationWindow * 2) / rotationStep) + 1
                  ),
                },
                (_, northIndex) => {
                  const north =
                    rotationSeed.north - rotationWindow + northIndex * rotationStep;
                  return [`${east}:${north}`, { east, north }];
                }
              );
            }
          )
            .flat()
        ).values()
      )
    : [{ east: 0, north: 0 }];

  const candidateFits: SurfaceRegistrationFit[] = [];
  for (const { east: rotationEastDegrees, north: rotationNorthDegrees } of rotationCandidates) {
    for (let eastOffset = -searchRange; eastOffset <= searchRange; eastOffset += options.searchStepMeters) {
      for (let northOffset = -searchRange; northOffset <= searchRange; northOffset += options.searchStepMeters) {
        for (let upOffset = -searchRange; upOffset <= searchRange; upOffset += options.searchStepMeters) {
          const transformedErrors = samples.map((sample) => {
            const registered = applyCopcRigidRegistration(
              sample,
              {
                anchor,
                rotationEastDegrees,
                rotationNorthDegrees,
                translationUpMeters: upOffset,
              }
            );
            const displaced = {
              easting: registered.easting + eastOffset,
              northing: registered.northing + northOffset,
              height: registered.height,
            };
            const targetHeight = referenceSurface(
              displaced.easting,
              displaced.northing
            );
            return Math.abs(targetHeight - displaced.height);
          });
          const meanAbsoluteError =
            transformedErrors.reduce((sum, value) => sum + value, 0) /
            Math.max(1, transformedErrors.length);
          candidateFits.push({
            translationEastMeters: eastOffset,
            translationNorthMeters: northOffset,
            translationUpMeters: upOffset,
            rotationEastDegrees,
            rotationNorthDegrees,
            meanAbsoluteErrorMeters: meanAbsoluteError,
          });
        }
      }
    }
  }

  return candidateFits.reduce((best, candidate) =>
    candidate.meanAbsoluteErrorMeters < best.meanAbsoluteErrorMeters
      ? candidate
      : best
  );
};
