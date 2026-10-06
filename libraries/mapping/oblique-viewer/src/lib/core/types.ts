import type { Easing, Matrix3RowMajor, Vector3Arr } from "@carma-commons/math";
import type { FeatureCollection, Polygon } from "geojson";
import type { CardinalDirectionClockwise } from "@carma-geo/data-structures";
import type { ObliqueDownloadWatermark } from "../runtime/utils/tiff-download-types";

import type { PreviewQualityLevel } from "./constants";
import type { Radians, Ratio } from "@carma-units";

/** the four flight-strip sectors, clockwise from north */
export type CardinalDirection = CardinalDirectionClockwise;

type Row3 = [number, number, number];

/** one exterior orientation as served: x, y, z, then the three matrix rows */
export type ExteriorOrientationDataArray = [
  number,
  number,
  number,
  Row3,
  Row3,
  Row3
];

export type ExteriorOrientations = Record<string, ExteriorOrientationDataArray>;

/** what the id `line_waypoint_cameraIdPhoto` says about an image */
export type ObliqueImageIdInfo = {
  cameraId: string;
  photoIndex?: number;
  lineIndex?: number;
  waypointIndex?: number;
  stationId?: string;
};

export type BasicObliqueImageRecord = ObliqueImageIdInfo & {
  /** Collision-safe key used by state and indexes. Never an asset filename. */
  id: string;
  seriesId: string;
  sourceId: string;
  /** perspective centre in the dataset's CRS */
  x: number;
  y: number;
  z: number;
  /** rotation matrix, row major, as served */
  m: Matrix3RowMajor;
  assets?: ObliqueMetadataImage["assets"];
};

/**
 * A pose the MapLibre camera can take: where the camera stands and where it
 * looks. Bearing and pitch are MapLibre's (degrees, pitch from nadir); the
 * roll is what the preview image has to be turned by, since the map itself
 * stays unrolled.
 */
export type ObliquePose = {
  longitude: number;
  latitude: number;
  /** the served z, before any datum handling */
  z: number;
  bearingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** the view direction in true-north ENU, unit length */
  direction: Vector3Arr;
  /** the image's up in true-north ENU, unit length */
  up: Vector3Arr;
  utmConvergenceRad: number;
};

export type ObliqueImageRecord = BasicObliqueImageRecord & {
  /** perspective centre in WGS84: lon, lat, z as served */
  centerWGS84: [number, number, number];
  /** the strip's nominal heading for this sector, radians */
  fallbackHeading: number;
  sector: CardinalDirection;
  /** Computed from the calibrated image axes, not the filename sector. */
  pose?: ObliquePose;
  /** Optional delivered or approximate ground polygon, in WGS84. */
  footprint?: [number, number][];
  footprintApproximate?: boolean;
};

export type ObliqueImageRecordMap = Map<string, ObliqueImageRecord>;

/** a footprint's centre, in both frames, with the sector it was flown in */
export type PointWithSector = {
  id: string;
  x: number;
  y: number;
  longitude: number;
  latitude: number;
  cardinal: CardinalDirection;
};

export type NearestObliqueImageRecord = {
  record: ObliqueImageRecord;
  /** metres from the search point to the footprint centre */
  distanceOnGround: number;
  /** metres from the search point to the perspective centre's ground point */
  distanceToCamera: number;
  imageCenter: Omit<PointWithSector, "id">;
  /** Dimensionless lower-is-better angular + coverage + distance cost. */
  score?: number;
  coversTarget?: boolean;
  coverageApproximate?: boolean;
};

export type AnimationConfig = {
  /** ms, for lining up independent animations */
  delay?: number;
  /** ms; also the cap for a duration derived from the distance */
  duration?: number;
  easingFunction?: Easing;
};

export type ObliqueAnimationsConfig = {
  /** tilting into the oblique view */
  enterObliqueMode?: AnimationConfig;
  /** the flight from wherever the camera is to the image's pose */
  flyToExteriorOrientation?: AnimationConfig;
  /** the hop to a sibling image */
  flyToNextImage?: AnimationConfig;
  /** turning to another sector while the preview is up */
  flyToRotatedImage?: AnimationConfig;
  /** turning to another sector without a preview */
  rotateCamera?: AnimationConfig;
  /** tilting back out */
  leaveObliqueMode?: AnimationConfig;
  outlineFadeOut?: AnimationConfig;
};

export type ObliqueFootprintsStyle = {
  /** any CSS colour */
  outlineColor?: string;
  outlineWidth?: number;
  outlineOpacity?: number;
  /** Active footprint fill; capped at 8%. */
  fillOpacity?: number;
  /** Previous centre outline at the start of its trail; capped at 20%. */
  inactiveOpacity?: number;
};

export type ObliqueImagePreviewStyle = {
  backdropColor?: string;
  border?: string;
  boxShadow?: string;
};

/** how the backdrop behind the preview treats the map showing through */
export type ObliqueBackdropLook = {
  /** percent */
  brightness: number;
  /** percent */
  contrast: number;
  /** percent */
  saturation: number;
};

/** which frame the served z counts from */
export type ObliqueHeightDatum = "dhhn2016" | "ellipsoidal" | "unknown";

export type InteriorOrientationOffset = { xOffset: number; yOffset: number };

/** which row of the rotation matrix is the image's up, and whether to flip it */
export type UpVectorMapping = { rowIndex: 0 | 1 | 2; negate: boolean };

/**
 * One flight's worth of oblique images: where the metadata and the previews
 * are, how the cameras were mounted, and how the viewer should move.
 */
export type ObliqueDirectionalCatalog = {
  id: string;
  sector: "N" | "E" | "S" | "W" | "nadir";
  cameraIds: readonly string[];
  /** Producer-validated source-ID aliases; never inferred from rig export folders. */
  cameraPrefixes?: readonly string[];
  /** Measured world optical-axis azimuth; camera labels do not define bearing. */
  meanHeadingRad: Radians;
  imageCount: number;
  /** Exact oblique-only full-group totals, excluding nadir. */
  obliquePitch?: { pitchSumRad: Radians; imageCount: number };
  exteriorOrientationsURI: string;
  compressedCatalogURI?: string;
};

export type ObliqueDataset = {
  id: string;
  label: string;
  /** Compact series identity used on the footprint. */
  shortLabel?: string;
  /** Verified acquisition month, 1 through 12; processing dates do not qualify. */
  acquisitionMonth?: number;
  /** Calendar year of image acquisition, when known; never inferred from a label. */
  acquisitionYear?: number;
  enabledByDefault?: boolean;
  metadataFormat: "legacy-array-map" | "inpho-v1";
  /** Source z datum; unknown forbids an aligned camera flight. */
  heightDatum: ObliqueHeightDatum;
  sourceConventions: ObliqueMetadataConventions;
  cameras: Record<string, ObliqueCameraCalibration>;
  /** Delivered camera views; 2024 has no served nadir imagery. */
  availableCameraViews?: readonly string[];
  /** Height of the approximation plane when terrain/footprints are unavailable. */
  referenceGroundHeightMeters?: number;
  exteriorOrientationsURI: string;
  /** Optional gzip JSON transport of the exact canonical catalog document. */
  compressedCatalogURI?: string;
  /** Independent, disjoint camera groups; canonical URI remains the fallback. */
  directionalCatalogs?: readonly ObliqueDirectionalCatalog[];
  /** Exact source routing only; never an input to physical pose or sector geometry. */
  directionalCatalogPriority?: {
    cameraLineParity: {
      EVEN: Record<string, string>;
      ODD: Record<string, string>;
    };
    imageGroups: Record<string, string>;
  };
  footprintsURI?: string;
  /** the CRS of the exterior orientations' x, y */
  crs: "EPSG:25832";
  previewPath: string;
  /** Canonical downloadable JPEG directory, with no quality level appended. */
  downloadPath?: string;
  /** Range-readable original TIFF; {imageId} receives the encoded source ID. */
  originalImageUrlTemplate?: string;
  /** Optional packed AVIF pyramid; per-record assets.pyramid.href takes precedence. */
  avifPyramidTemplate?: string;
  /** Verified publisher artwork and placement for converting original TIFF downloads. */
  downloadWatermark?: ObliqueDownloadWatermark;
  /** Explicit development-only source-Z inspection; the source datum remains unknown. */
  allowUnverifiedSourceHeight?: boolean;
  previewQualityLevel: PreviewQualityLevel;
  /** Finest published preview level; lower-numbered files are not requested. */
  minimumPreviewQualityLevel?: PreviewQualityLevel;
  /** Published higher-quality JPEG preview level from series metadata. */
  hqQualityLevel: PreviewQualityLevel;
  downloadQualityLevel: PreviewQualityLevel;
  /** the tilt the map takes while browsing, degrees from nadir */
  pitchDeg: number;
  /** metres above the map centre the camera sits at while browsing */
  cameraHeightAboveCenter: number;
  /** vertical field of view bounds for the wheel zoom, degrees */
  minFovDeg: number;
  maxFovDeg: number;
  /** vertical field of view the map takes on entering, degrees */
  enterFovDeg: number;
  /** the flight strips' rotation against north, degrees clockwise */
  headingOffsetDeg: number;
  /** camera id -> sector, for even and odd flight lines */
  cameraIdToDirection: {
    EVEN: Record<string, CardinalDirection>;
    ODD: Record<string, CardinalDirection>;
  };
  cameraIdToUpVector: Record<string, UpVectorMapping>;
  /** principal point offset per camera, in unit image space */
  interiorOrientationOffsets: Record<string, InteriorOrientationOffset>;
  /** how many images the nearest search ranks */
  numNearestImages: number;
  /** images further than this from the search point are dropped, metres */
  maxDistanceMeters: number;
  animations: ObliqueAnimationsConfig;
  footprintsStyle: ObliqueFootprintsStyle;
  imagePreviewStyle: ObliqueImagePreviewStyle;
};

/** The source image-mm frame is camera X/Y; the affine produces top-left pixels. */
export type ImageMmToPixelAffine = [
  [number, number, number],
  [number, number, number]
];

export type ObliqueMetadataConventions = {
  horizontalCrs: string;
  verticalDatum: ObliqueHeightDatum;
  positionUnit: "m";
  rotationLayout: "row-major";
  rotationTransform: "world-to-camera";
  opticalAxis: "-z";
  pixelOrigin: "top-left";
  pixelReference: "pixel-center";
  worldAxes: ["easting", "northing", "up"];
  cameraAxes: "source-image-mm";
  pixelAxes: { x: "right"; y: "down" };
};

export type ObliqueMetadataCamera = {
  widthPx: number;
  heightPx: number;
  focalLengthMm: number;
  imageMmToPixelAffine: ImageMmToPixelAffine;
  /** Source mounting value, retained for audit; never applied twice. */
  mountRotationDeg: number;
  sourceId?: string;
  view?: string;
};

export type ObliqueCameraCalibration = {
  widthPx: number;
  heightPx: number;
  focalLengthMm: number;
  principalPointPx: [number, number];
  /** tan(half-FOV) along the delivered image's long edge. */
  halfFovTan: number;
  upMapping: UpVectorMapping;
  /** Calibrated top-of-image axis in the camera frame for INPHO sources. */
  imageUpInCamera?: Vector3Arr;
  imageMmToPixelAffine?: ImageMmToPixelAffine;
  mountRotationDeg?: number;
  sourceId?: string;
  view?: string;
};

export type ObliqueMetadataImage = {
  cameraId: string;
  positionM: [number, number, number];
  rotationMatrixRows: Matrix3RowMajor;
  stationId?: string;
  lineIndex?: number;
  waypointIndex?: number;
  /** STAC-compatible asset fields; href identifies an actual delivered file. */
  assets?: Record<string, { href: string; type?: string; roles?: string[] }>;
};

/** Normalized INPHO interchange; source image IDs are the map keys. */
export type ObliqueMetadata = {
  schemaVersion: 1;
  seriesId: string;
  conventions: ObliqueMetadataConventions;
  cameras: Record<string, ObliqueMetadataCamera>;
  images: Record<string, ObliqueMetadataImage>;
};

/** URL-restorable image window; pan is image-centre displacement in long-edge fractions. */
export type ObliquePreviewState = {
  seriesId: string;
  imageId: string;
  panX: Ratio;
  panY: Ratio;
  /** Image short edge divided by viewport short edge. */
  zoom: Ratio;
};

export type ObliqueSelectionData = {
  /** Worker-derived angle totals for enabled-series browsing; nadir is excluded. */
  obliquePitchBySeries?: Map<
    string,
    { pitchSumRad: Radians; imageCount: number }
  >;
  imageRecords: ObliqueImageRecordMap;
  datasets: Map<string, ObliqueDataset>;
  centers: Map<string, PointWithSector>;
};

export type ObliqueGroundTarget = {
  longitude: number;
  latitude: number;
  /** Same vertical datum as the candidate's position. */
  heightMeters?: number;
  heightDatum?: ObliqueHeightDatum;
};

export type ObliqueViewMode = "oblique" | "nadir" | "objectCoverage";

export type ObliqueViewQuery = {
  target: ObliqueGroundTarget;
  /** Continuous clockwise bearing from true north. */
  headingRad: number;
  /** Angle from nadir, matching the map's camera convention. */
  pitchRad: number;
  /** Optional explicit camera capability; continuous bearing ranking is unchanged. */
  cameraView?: "nadir";
  enabledSeriesIds?: readonly string[];
  /** Native resolution at the ground target can replace centre-distance ranking. */
  selectionStrategy?: "nearest-axis" | "best-resolution";
  numCandidates?: number;
  maxDistanceMeters?: number;
  /** Exact caller-normalized ground heights for series with a different z datum. */
  perSeriesTargetHeightMeters?: ReadonlyMap<string, number>;
};

export type ObliqueFootprintCollection = FeatureCollection<
  Polygon,
  {
    FILENAME: string;
    ORI?: string;
    [key: string]: string | number | boolean | undefined;
  }
>;
