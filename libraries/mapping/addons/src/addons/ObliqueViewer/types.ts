import type { Easing } from "@carma-commons/math";
import type { Matrix3RowMajor, Vector3Arr } from "@carma-commons/math";
import type { CardinalDirectionClockwise } from "@carma-geo/data-structures";

import type { PreviewQualityLevel } from "./constants";

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
  photoIndex: number;
  lineIndex: number;
  waypointIndex: number;
  stationId: string;
};

export type BasicObliqueImageRecord = ObliqueImageIdInfo & {
  id: string;
  /** perspective centre in the dataset's CRS */
  x: number;
  y: number;
  z: number;
  /** rotation matrix, row major, as served */
  m: Matrix3RowMajor;
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
  /** computed on first use */
  pose?: ObliquePose;
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
export type ObliqueHeightDatum = "dhhn2016" | "ellipsoidal";

export type InteriorOrientationOffset = { xOffset: number; yOffset: number };

/** which row of the rotation matrix is the image's up, and whether to flip it */
export type UpVectorMapping = { rowIndex: 0 | 1 | 2; negate: boolean };

/**
 * One flight's worth of oblique images: where the metadata and the previews
 * are, how the cameras were mounted, and how the viewer should move.
 */
export type ObliqueDataset = {
  exteriorOrientationsURI: string;
  footprintsURI: string;
  /** the CRS of the exterior orientations' x, y */
  crs: "EPSG:25832";
  previewPath: string;
  previewQualityLevel: PreviewQualityLevel;
  /** one step sharper than the preview, for the ribbon's "HQ" */
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
