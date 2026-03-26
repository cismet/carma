import type { ViewState } from "@carma-mapping/engines-interop/view-state";
import type { Radians } from "@carma/units/types";
import type { ThreePart, ThreePartSize } from "../../common/create-part";

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

export type ViewStateVisualizerOverviewOptions = {
  /** Horizontal overview orbit angle in radians. */
  orbitTheta?: number;
  /** Vertical overview orbit angle in radians. */
  orbitPhi?: number;
  /** Overview camera FOV in degrees, clamped to the open perspective range `(0, 180)`. */
  fovDeg?: number;
  /** Use orthographic projection for the overview camera. */
  orthographic?: boolean;
};

export type ViewStateVisualizerVisualizedOptions = {
  maxPitch?: Radians;
  imagePlaneDistance?: number;
};

export type ViewStateVisualizerSurfaceDisplayOptions = {
  /** Show graticule meridians and parallels. */
  showGraticule?: boolean;
  /** Show sphere surface fill. */
  show?: boolean;
  /** If true, sphere mesh is rotated from pose bearing/pitch for globe-like drag feedback. */
  rotateWithPose?: boolean;
  /**
   * Polar cap angle in radians for the sphere surface:
   * - PI/2: upper hemisphere (default)
   * - PI: full sphere
   */
  sphereCapRad?: number;
  /** Sphere surface opacity in [0..1]. */
  sphereOpacity?: number;
};

export type ViewStateVisualizerAxisDisplayOptions = {
  show?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerAngleCueDisplayOptions = {
  show?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerCameraViewImagePlaneDisplayOptions = {
  show?: boolean;
  showOffset?: boolean;
  frameLineWidthPx?: number;
};

export type ViewStateVisualizerCameraViewAxesDisplayOptions = {
  show?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerCameraViewFrustumDisplayOptions = {
  show?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerCameraViewMarkerDisplayOptions = {
  show?: boolean;
};

export type ViewStateVisualizerCameraViewLinkDisplayOptions = {
  show?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerCameraViewDisplayOptions = {
  imagePlane?: ViewStateVisualizerCameraViewImagePlaneDisplayOptions;
  axes?: ViewStateVisualizerCameraViewAxesDisplayOptions;
  frustum?: ViewStateVisualizerCameraViewFrustumDisplayOptions;
  marker?: ViewStateVisualizerCameraViewMarkerDisplayOptions;
  link?: ViewStateVisualizerCameraViewLinkDisplayOptions;
};

export type ViewStateVisualizerAltitudeDisplayOptions = {
  show?: boolean;
  showScaleBreak?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerLabelDisplayOptions = {
  showAxes?: boolean;
  showAngles?: boolean;
  showImagePlane?: boolean;
  fontSizePx?: number;
};

export type ViewStateVisualizerCueColorOptions = Partial<
  Record<ViewStateVisualizerCueKey, string>
>;

export type ViewStateVisualizerDisplayOptions = {
  surface?: ViewStateVisualizerSurfaceDisplayOptions;
  worldAxes?: ViewStateVisualizerAxisDisplayOptions;
  angleCues?: ViewStateVisualizerAngleCueDisplayOptions;
  cameraView?: ViewStateVisualizerCameraViewDisplayOptions;
  altitude?: ViewStateVisualizerAltitudeDisplayOptions;
  labels?: ViewStateVisualizerLabelDisplayOptions;
  cueColors?: ViewStateVisualizerCueColorOptions;
};

export type ResolvedViewStateVisualizerOverviewOptions = {
  orbitTheta?: number;
  orbitPhi?: number;
  fovDeg: number;
  orthographic: boolean;
};

export type ResolvedViewStateVisualizerVisualizedOptions = {
  maxPitch: Radians | null;
  imagePlaneDistance: number | null;
};

export type ResolvedViewStateVisualizerSurfaceDisplayOptions = {
  showGraticule: boolean;
  show: boolean;
  rotateWithPose: boolean;
  sphereCapRad: number;
  sphereOpacity: number;
};

export type ResolvedViewStateVisualizerAxisDisplayOptions = {
  show: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerAngleCueDisplayOptions = {
  show: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerCameraViewImagePlaneDisplayOptions = {
  show: boolean;
  showOffset: boolean;
  frameLineWidthPx: number;
};

export type ResolvedViewStateVisualizerCameraViewAxesDisplayOptions = {
  show: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerCameraViewFrustumDisplayOptions = {
  show: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerCameraViewMarkerDisplayOptions = {
  show: boolean;
};

export type ResolvedViewStateVisualizerCameraViewLinkDisplayOptions = {
  show: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerCameraViewDisplayOptions = {
  imagePlane: ResolvedViewStateVisualizerCameraViewImagePlaneDisplayOptions;
  axes: ResolvedViewStateVisualizerCameraViewAxesDisplayOptions;
  frustum: ResolvedViewStateVisualizerCameraViewFrustumDisplayOptions;
  marker: ResolvedViewStateVisualizerCameraViewMarkerDisplayOptions;
  link: ResolvedViewStateVisualizerCameraViewLinkDisplayOptions;
};

export type ResolvedViewStateVisualizerAltitudeDisplayOptions = {
  show: boolean;
  showScaleBreak: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerLabelDisplayOptions = {
  showAxes: boolean;
  showAngles: boolean;
  showImagePlane: boolean;
  fontSizePx: number;
};

export type ResolvedViewStateVisualizerDisplayOptions = {
  surface: ResolvedViewStateVisualizerSurfaceDisplayOptions;
  worldAxes: ResolvedViewStateVisualizerAxisDisplayOptions;
  angleCues: ResolvedViewStateVisualizerAngleCueDisplayOptions;
  cameraView: ResolvedViewStateVisualizerCameraViewDisplayOptions;
  altitude: ResolvedViewStateVisualizerAltitudeDisplayOptions;
  labels: ResolvedViewStateVisualizerLabelDisplayOptions;
  cueColors: Record<ViewStateVisualizerCueKey, string>;
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

export type ViewStateVisualizerSize = ThreePartSize;

export type ViewStateVisualizerOptions = {
  size?: ViewStateVisualizerSize;
  overview?: ViewStateVisualizerOverviewOptions;
  /** Enable mouse orbit dragging. */
  interactive?: boolean;
  visualized?: ViewStateVisualizerVisualizedOptions;
  display?: ViewStateVisualizerDisplayOptions;
  onInteraction?: (labelAnchors: ViewStateVisualizerLabelAnchors) => void;
  /** Called when the user drags the camera cube to change bearing/pitch (radians). */
  onPoseChange?: (bearing: number, pitch: number) => void;
};

export type ViewStateVisualizerPart<UpdateInput, DisplayInput> = ThreePart<
  UpdateInput,
  DisplayInput
>;

export type ViewStateVisualizerPrimitive = {
  update: (viewState: ViewState) => ViewStateVisualizerLabelAnchors;
  resize: (
    size: ViewStateVisualizerSize
  ) => ViewStateVisualizerLabelAnchors | null;
  setOverview: (
    options: ViewStateVisualizerOverviewOptions
  ) => ViewStateVisualizerLabelAnchors | null;
  setVisualized: (
    options: ViewStateVisualizerVisualizedOptions
  ) => ViewStateVisualizerLabelAnchors | null;
  setDisplay: (
    options: ViewStateVisualizerDisplayOptions
  ) => ViewStateVisualizerLabelAnchors | null;
  setInteractive: (interactive: boolean) => void;
  readLabelAnchors: () => ViewStateVisualizerLabelAnchors | null;
  dispose: () => void;
};
