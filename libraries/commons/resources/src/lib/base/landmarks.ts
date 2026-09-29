/** Authored approximate axial frustum; dimensions are not a survey claim. */
export type LandmarkSilhouettePart = {
  readonly baseHeightMeters: number;
  readonly heightMeters: number;
  readonly radiusBottomMeters: number;
  readonly radiusTopMeters: number;
  readonly radialSegments: number;
  readonly color: string;
};

export const LANDMARK_POSITION_STATUS = {
  MAPPED_NOT_SURVEYED: "mapped-not-surveyed",
} as const;

export type LandmarkPositionStatus =
  (typeof LANDMARK_POSITION_STATUS)[keyof typeof LANDMARK_POSITION_STATUS];

export const LANDMARK_POSITION_METHOD = {
  NODE: "node",
  WAY_BOUNDS_CENTER: "way-bounds-center",
} as const;

export type LandmarkPositionMethod =
  (typeof LANDMARK_POSITION_METHOD)[keyof typeof LANDMARK_POSITION_METHOD];

export const LANDMARK_HEIGHT_STATUS = {
  MAPPED: "mapped",
  MUNICIPALITY_PUBLISHED: "municipality-published",
} as const;

export type LandmarkHeightStatus =
  (typeof LANDMARK_HEIGHT_STATUS)[keyof typeof LANDMARK_HEIGHT_STATUS];

export const LANDMARK_GROUND_STATUS = {
  APPROXIMATE_TERRAIN: "approximate-terrain",
} as const;

export type LandmarkGroundStatus =
  (typeof LANDMARK_GROUND_STATUS)[keyof typeof LANDMARK_GROUND_STATUS];

export const LANDMARK_GROUND_SOURCE = {
  NRW_DGM1_WCS: "nrw-dgm1-wcs",
} as const;

export type LandmarkGroundSource =
  (typeof LANDMARK_GROUND_SOURCE)[keyof typeof LANDMARK_GROUND_SOURCE];

export const LANDMARK_GROUND_SAMPLE_METHOD = {
  CONTAINING_1M_PIXEL_CENTER: "containing-1m-pixel-center",
} as const;

export type LandmarkGroundSampleMethod =
  (typeof LANDMARK_GROUND_SAMPLE_METHOD)[keyof typeof LANDMARK_GROUND_SAMPLE_METHOD];

export const LANDMARK_GEOMETRY_EVIDENCE = {
  AUTHORED_APPROXIMATE_SILHOUETTE: "authored-approximate-silhouette",
} as const;

export type LandmarkGeometryEvidence =
  (typeof LANDMARK_GEOMETRY_EVIDENCE)[keyof typeof LANDMARK_GEOMETRY_EVIDENCE];

/** Immutable georeferenced silhouette with independent per-field evidence. */
export type GeoreferencedLandmark = {
  readonly id: string;
  readonly name: string;
  readonly longitudeDegrees: number;
  readonly latitudeDegrees: number;
  readonly heightMeters: number;
  readonly groundNormalHeightMeters: number;
  readonly positionEvidence: {
    readonly status: LandmarkPositionStatus;
    readonly sourceUrl: string;
    readonly osmVersion: number;
    readonly osmEditedAt: string;
    readonly method: LandmarkPositionMethod;
  };
  readonly heightEvidence: {
    readonly status: LandmarkHeightStatus;
    readonly sourceUrl: string;
    readonly conflictingHeightMeters?: number;
    readonly conflictingSourceUrl?: string;
  };
  readonly groundEvidence: {
    readonly status: LandmarkGroundStatus;
    readonly source: LandmarkGroundSource;
    readonly verticalDatum: "DHHN2016";
    readonly horizontalCrs: "EPSG:25832";
    readonly sampleMethod: LandmarkGroundSampleMethod;
    /** West, south, east, north of the native 10 x 10 pixel WCS window. */
    readonly requestBoundsUtm32Meters: readonly [
      number,
      number,
      number,
      number
    ];
    readonly sampleCenterUtm32Meters: readonly [number, number];
    readonly sourceUrl: string;
  };
  readonly geometryEvidence: LandmarkGeometryEvidence;
  /** Axial frusta, with metre offsets along the local geodetic up direction. */
  readonly parts: readonly LandmarkSilhouettePart[];
};
