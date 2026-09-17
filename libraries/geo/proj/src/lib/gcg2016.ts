import {
  GCG2016_PROVENANCE,
  GCG2016_TILE_LOADERS,
} from "@carma-geo/gcg2016";
import type {
  Latitude,
  LngLatArray,
  Longitude,
  Meters,
} from "@carma-geo/data-structures";

import { createTiledVerticalOffsetModel } from "./tiled-vertical-offset";

const [west, south, east, north] = GCG2016_PROVENANCE.supportedRegion;

export const gcg2016Model = createTiledVerticalOffsetModel({
  supportedRegion: { west, south, east, north },
  rootTileSizeDegrees: GCG2016_PROVENANCE.rootTileSizeDegrees,
  tileLoaders: GCG2016_TILE_LOADERS,
});

export { GCG2016_PROVENANCE };

export const GCG2016_INTERPOLATION_METHOD = {
  id: "bkg-natural-bicubic-spline-5x5",
  name: "BKG-compatible natural bicubic spline",
  stencil: { longitudeSamples: 5, latitudeSamples: 5 },
  evaluationOrder: ["longitude", "latitude"],
  boundaryCondition: "natural",
  sourceSamples: "GCG2016 grid values on the payload lattice",
} as const;

/**
 * How far a value this package returns can sit from what the official BKG
 * program would print for the same coordinate. It adds the payload lattice
 * step to the observed agreement with that program, so it is a bound, not an
 * observation, and it is the same for every coordinate.
 *
 * It describes this software only. It says nothing about how well GCG2016
 * itself models the real quasigeoid — see `physicalModelAccuracyMeters`.
 */
export const GCG2016_SOFTWARE_BOUND_METERS = (GCG2016_PROVENANCE.sampleEncoding
  .quantumMeters +
  GCG2016_PROVENANCE.officialReferenceValidation
    .maximumDistanceToRoundedOfficialOutputMeters) as Meters;

export const GCG2016_VALIDATION_METRICS = {
  /** The single figure to surface in a UI; the entries below explain it. */
  softwareBoundMeters: GCG2016_SOFTWARE_BOUND_METERS,
  sampleEncoding: {
    kind: "lattice-quantisation-of-the-source-samples",
    quantumMeters: GCG2016_PROVENANCE.sampleEncoding.quantumMeters,
    maximumSampleDeviationMeters:
      GCG2016_PROVENANCE.sampleEncoding
        .maximumDeviationFromSourceFloat32Meters,
  },
  officialReferenceAgreement: {
    kind: "observed-distance-to-millimetre-rounded-official-output",
    pointCount: GCG2016_PROVENANCE.officialReferenceValidation.pointCount,
    maximumDistanceMeters:
      GCG2016_PROVENANCE.officialReferenceValidation
        .maximumDistanceToRoundedOfficialOutputMeters,
    officialOutputResolutionMeters:
      GCG2016_PROVENANCE.officialReferenceValidation
        .officialOutputResolutionMeters,
  },
  tiledResourceAgreement: {
    kind: "observed-distance-to-complete-source-grid-evaluation",
    pointCount: GCG2016_PROVENANCE.totalSupportedVerificationPointCount,
    maximumDistanceMeters: GCG2016_PROVENANCE.maximumVerifiedDifferenceMeters,
  },
  bilinearComparison: {
    kind: "comparison-only-not-an-error-estimate",
    pointCount: GCG2016_PROVENANCE.bilinearComparison.pointCount,
    maximumAbsoluteDifferenceMeters:
      GCG2016_PROVENANCE.bilinearComparison.maximumAbsoluteDifferenceMeters,
    rmseMeters: GCG2016_PROVENANCE.bilinearComparison.rmseMeters,
  },
  physicalModelAccuracyMeters: null,
} as const;

export interface Gcg2016UndulationQueryResult {
  coordinate: {
    longitude: Longitude.deg;
    latitude: Latitude.deg;
    horizontalCrs: string;
  };
  undulationMeters: Meters;
  /** Constant bound; see `GCG2016_SOFTWARE_BOUND_METERS`. */
  softwareBoundMeters: Meters;
  resourceTileIds: readonly string[];
  method: typeof GCG2016_INTERPOLATION_METHOD;
  validation: typeof GCG2016_VALIDATION_METRICS;
}

export const queryGcg2016Undulation = async (
  longitude: Longitude.deg,
  latitude: Latitude.deg
): Promise<Gcg2016UndulationQueryResult> => {
  const query = await gcg2016Model.queryOffset(longitude, latitude);
  return {
    coordinate: {
      longitude,
      latitude,
      horizontalCrs: GCG2016_PROVENANCE.source.horizontalCrs,
    },
    undulationMeters: query.offset as Meters,
    softwareBoundMeters: GCG2016_SOFTWARE_BOUND_METERS,
    resourceTileIds: query.tileIds,
    method: GCG2016_INTERPOLATION_METHOD,
    validation: GCG2016_VALIDATION_METRICS,
  };
};

export const queryGcg2016Undulations = (
  coordinates: readonly LngLatArray.deg[]
) =>
  Promise.all(
    coordinates.map(([longitude, latitude]) =>
      queryGcg2016Undulation(longitude, latitude)
    )
  );

export const getGcg2016Undulation = async (
  longitude: Longitude.deg,
  latitude: Latitude.deg
) => (await queryGcg2016Undulation(longitude, latitude)).undulationMeters;

export const getGcg2016Undulations = async (
  coordinates: readonly LngLatArray.deg[]
) =>
  (await queryGcg2016Undulations(coordinates)).map(
    ({ undulationMeters }) => undulationMeters
  );

export const prefetchGcg2016Tiles = (
  longitude: Longitude.deg,
  latitude: Latitude.deg,
  radius = 1
) => gcg2016Model.prefetch(longitude, latitude, radius);
