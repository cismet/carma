/** Authored approximate axial frustum; dimensions are not a survey claim. */
export type LandmarkSilhouettePart = {
  readonly baseHeightMeters: number;
  readonly heightMeters: number;
  readonly radiusBottomMeters: number;
  readonly radiusTopMeters: number;
  readonly radialSegments: number;
  readonly color: string;
};

/** Immutable georeferenced silhouette with independent per-field evidence. */
export type GeoreferencedLandmark = {
  readonly id: string;
  readonly name: string;
  readonly longitudeDegrees: number;
  readonly latitudeDegrees: number;
  readonly heightMeters: number;
  readonly groundNormalHeightMeters: number;
  readonly positionEvidence: {
    readonly status: "mapped-not-surveyed";
    readonly sourceUrl: string;
    readonly osmVersion: number;
    readonly osmEditedAt: string;
    readonly method: "node" | "way-bounds-center";
  };
  readonly heightEvidence: {
    readonly status: "mapped" | "municipality-published";
    readonly sourceUrl: string;
    readonly conflictingHeightMeters?: number;
    readonly conflictingSourceUrl?: string;
  };
  readonly groundEvidence: {
    readonly status: "approximate-terrain";
    readonly source: "nrw-dgm1-wcs";
    readonly verticalDatum: "DHHN2016";
    readonly horizontalCrs: "EPSG:25832";
    readonly sampleMethod: "containing-1m-pixel-center";
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
  readonly geometryEvidence: "authored-approximate-silhouette";
  /** Axial frusta, with metre offsets along the local geodetic up direction. */
  readonly parts: readonly LandmarkSilhouettePart[];
};
