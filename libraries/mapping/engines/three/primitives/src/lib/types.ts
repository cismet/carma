import type {
  CameraBasis,
  CameraIntrinsics,
  CameraPose,
} from "@carma-commons/camera/model";
import type { Meters, Radians } from "@carma/units/types";

export type ViewStateVisualizerPose = Pick<
  CameraPose,
  | "matrixWorld"
  | "matrixWorldInverse"
  | "basisMatrix"
  | "position"
  | "direction"
  | "up"
  | "right"
  | "quaternion"
  | "basis"
> & {
  anchor: {
    altitude: Meters;
  };
  bearing: Radians;
  pitch: Radians;
  range: Meters;
  roll?: Radians;
  basis?: CameraBasis;
};

export type ViewStateVisualizerIntrinsics = Pick<
  CameraIntrinsics,
  "type" | "projectionMatrix" | "fov" | "fovHorizontal" | "viewOffset"
>;

export type ViewStateVisualizerSpecification = {
  pose: ViewStateVisualizerPose;
  intrinsics?: ViewStateVisualizerIntrinsics;
  limits?: {
    maxPitch?: Radians;
  };
  display?: {
    imagePlaneDistance?: number;
  };
};

export type ViewStateVisualizerCueKey =
  | "bearing"
  | "pitch"
  | "range"
  | "altitude"
  | "east"
  | "north"
  | "up"
  | "imageX"
  | "imageY";

export type ViewStateVisualizerDebugVector = {
  x: number;
  y: number;
  z: number;
};

export type ViewStateVisualizerDisplayOptions = {
  /** Horizontal orbit angle in radians */
  orbitTheta?: number;
  /** Vertical orbit angle in radians (from Y axis, ~1.28 default) */
  orbitPhi?: number;
  /** Display camera FOV in degrees */
  fovDeg?: number;
  /** Use orthographic projection */
  orthographic?: boolean;
  /** Enable mouse orbit dragging */
  interactive?: boolean;

  /** Show graticule meridians and parallels */
  showGraticule?: boolean;
  /** Show sphere surface fill */
  showSurface?: boolean;
  /** Show E/N/U world axes */
  showAxes?: boolean;
  /** Show bearing/pitch angle arcs and max-pitch ring */
  showAngleArcs?: boolean;
  /** Show camera image plane, origin marker, and basis vectors */
  showImagePlane?: boolean;
  /** Show frustum edge lines from camera to image plane corners */
  showFrustum?: boolean;
  /** Show altitude stem, disc, and overflow markers */
  showAltitudeStem?: boolean;
  /** If the altitude stem is out of scale, render the center section as dashed */
  showAltitudeScaleBreak?: boolean;
  /** Show camera marker cube */
  showCameraMarker?: boolean;
  /** Show line from origin to camera position on hemisphere */
  showCameraLink?: boolean;
  /** If true, sphere mesh is rotated from pose bearing/pitch for globe-like drag feedback. */
  rotateSphereWithPose?: boolean;

  /**
   * Polar cap angle in radians for the sphere surface:
   * - PI/2: upper hemisphere (default)
   * - PI: full sphere
   */
  sphereCapRad?: number;
  /** Sphere surface opacity in [0..1]. */
  sphereOpacity?: number;

  /** Optional screen-arcball debug vectors rendered directly in the scene. */
  debugArcballVectors?: {
    start?: ViewStateVisualizerDebugVector | null;
    current?: ViewStateVisualizerDebugVector | null;
  };

  /** Show E/N/U axis text labels */
  showAxisLabels?: boolean;
  /** Show bearing/pitch angle text labels */
  showAngleLabels?: boolean;
  /** Show image plane x/y text labels */
  showImagePlaneLabels?: boolean;
  /** Overlay label font size in real output CSS pixels */
  labelFontSizePx?: number;

  /** Shared rendered width in CSS px for important lines (bearing/pitch/range/altitude cues). */
  lineWidthPx?: number;
  /** Rendered width in CSS px for ENU axis lines. Defaults to 66% of lineWidthPx. */
  axisLineWidthPx?: number;
  /** Rendered width in CSS px for bearing/pitch/elevation/radial arc cues. Defaults to lineWidthPx. */
  arcLineWidthPx?: number;
  /** Rendered width in CSS px for frustum edge lines. Defaults to lineWidthPx. */
  frustumLineWidthPx?: number;
  /** Rendered width in CSS px for the origin-to-camera link line. Defaults to lineWidthPx. */
  cameraLinkLineWidthPx?: number;
  /** Rendered width in CSS px for altitude stem and related markers. Defaults to lineWidthPx. */
  altitudeLineWidthPx?: number;
  /** Target rendered width in CSS px for all remaining hairline geometry. */
  hairlineWidthPx?: number;

  /** Cue colors for labels and corresponding scene lines where applicable. */
  cueColors?: Partial<Record<ViewStateVisualizerCueKey, string>>;
};

export type ViewStateVisualizerLabelAnchor = {
  leftPx: number;
  topPx: number;
};

export type ViewStateVisualizerLabelAnchors = {
  bearing: ViewStateVisualizerLabelAnchor;
  pitch: ViewStateVisualizerLabelAnchor;
  range: ViewStateVisualizerLabelAnchor;
  altitude: ViewStateVisualizerLabelAnchor;
  east: ViewStateVisualizerLabelAnchor;
  north: ViewStateVisualizerLabelAnchor;
  up: ViewStateVisualizerLabelAnchor;
  imageX: ViewStateVisualizerLabelAnchor;
  imageY: ViewStateVisualizerLabelAnchor;
};

export type ViewStateVisualizerSize = {
  widthPx: number;
  heightPx: number;
};

export type ViewStateVisualizerCamera = {
  fovDeg: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
};

export type ViewStateVisualizerOptions = {
  size?: ViewStateVisualizerSize;
  camera?: Partial<ViewStateVisualizerCamera>;
  display?: ViewStateVisualizerDisplayOptions;
  onInteraction?: (labelAnchors: ViewStateVisualizerLabelAnchors) => void;
  /** Called when the user drags the camera cube to change bearing/pitch (radians). */
  onPoseChange?: (bearing: number, pitch: number) => void;
};

export type ViewStateVisualizerPrimitive = {
  update: (
    cameraModel: ViewStateVisualizerSpecification
  ) => ViewStateVisualizerLabelAnchors;
  resize: (size: ViewStateVisualizerSize) => void;
  setDisplay: (
    options: ViewStateVisualizerDisplayOptions
  ) => ViewStateVisualizerLabelAnchors | null;
  dispose: () => void;
};
