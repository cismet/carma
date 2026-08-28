import { CAMERA_TYPE } from "@carma-commons/camera/model";
import type { ViewState } from "@carma-mapping/engines-interop/view-state";
import type { Radians } from "@carma-units";

import type { ThreePart, ThreePartSize } from "../../common/create-part";
export const VIEW_STATE_VISUALIZER_CAMERA_MODEL = {
  PERSPECTIVE: CAMERA_TYPE.PERSPECTIVE,
  ORTHOGRAPHIC: CAMERA_TYPE.ORTHOGRAPHIC,
} as const;

export type ViewStateVisualizerCameraModel =
  (typeof VIEW_STATE_VISUALIZER_CAMERA_MODEL)[keyof typeof VIEW_STATE_VISUALIZER_CAMERA_MODEL];

export type ViewStateVisualizerInput = ViewState | readonly ViewState[];

export type ViewStateVisualizerVolumeBox = Readonly<{
  minimum: readonly [number, number, number];
  maximum: readonly [number, number, number];
}>;

export type ViewStateVisualizerVolumeBoxesOptions = Readonly<{
  boxes: readonly ViewStateVisualizerVolumeBox[];
  visible?: boolean;
  color?: string;
  opacity?: number;
}>;

export type ViewStateVisualizerCueKey =
  | "bearing"
  | "pitch"
  | "range"
  | "altitude"
  | "east"
  | "north"
  | "up"
  | "cameraForward"
  | "cameraRight"
  | "cameraUp"
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
  /** Keep the horizontal orthographic extent fixed instead of the vertical extent. */
  fitOrthographicWidth?: boolean;
};

export type ViewStateVisualizerVisualizedOptions = {
  maxPitch?: Radians;
  imagePlaneDistance?: number;
  /** Place the marker from the stored ECEF camera position, not orbit angles. */
  useCameraPosition?: boolean;
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
  showUp?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerAngleCueDisplayOptions = {
  show?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerCameraViewImagePlaneDisplayOptions = {
  show?: boolean;
  showOffset?: boolean;
};

export type ViewStateVisualizerCameraViewAxesDisplayOptions = {
  show?: boolean;
  showInactive?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerCameraViewFrustumDisplayOptions = {
  show?: boolean;
  showInactive?: boolean;
  lineWidthPx?: number;
};

export type ViewStateVisualizerCameraViewProjectionPlaneDisplayOptions = {
  show?: boolean;
};

export type ViewStateVisualizerCameraViewMarkerDisplayOptions = {
  show?: boolean;
};

export type ViewStateVisualizerCameraViewDisplayOptions = {
  imagePlane?: ViewStateVisualizerCameraViewImagePlaneDisplayOptions;
  axes?: ViewStateVisualizerCameraViewAxesDisplayOptions;
  frustum?: ViewStateVisualizerCameraViewFrustumDisplayOptions;
  projectionPlane?: ViewStateVisualizerCameraViewProjectionPlaneDisplayOptions;
  marker?: ViewStateVisualizerCameraViewMarkerDisplayOptions;
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
  fitOrthographicWidth: boolean;
};

export type ResolvedViewStateVisualizerVisualizedOptions = {
  maxPitch: Radians | null;
  imagePlaneDistance: number | null;
  useCameraPosition: boolean;
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
  showUp: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerAngleCueDisplayOptions = {
  show: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerCameraViewImagePlaneDisplayOptions = {
  show: boolean;
  showOffset: boolean;
};

export type ResolvedViewStateVisualizerCameraViewAxesDisplayOptions = {
  show: boolean;
  showInactive: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerCameraViewFrustumDisplayOptions = {
  show: boolean;
  showInactive: boolean;
  lineWidthPx: number;
};

export type ResolvedViewStateVisualizerCameraViewProjectionPlaneDisplayOptions =
  {
    show: boolean;
  };

export type ResolvedViewStateVisualizerCameraViewMarkerDisplayOptions = {
  show: boolean;
};

export type ResolvedViewStateVisualizerCameraViewDisplayOptions = {
  imagePlane: ResolvedViewStateVisualizerCameraViewImagePlaneDisplayOptions;
  axes: ResolvedViewStateVisualizerCameraViewAxesDisplayOptions;
  frustum: ResolvedViewStateVisualizerCameraViewFrustumDisplayOptions;
  projectionPlane: ResolvedViewStateVisualizerCameraViewProjectionPlaneDisplayOptions;
  marker: ResolvedViewStateVisualizerCameraViewMarkerDisplayOptions;
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
  cameraForward: ViewStateVisualizerLabelAnchor;
  cameraRight: ViewStateVisualizerLabelAnchor;
  cameraUp: ViewStateVisualizerLabelAnchor;
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
  volumeBoxes?: ViewStateVisualizerVolumeBoxesOptions;
  activeCameraIndex?: number;
  onInteraction?: (labelAnchors: ViewStateVisualizerLabelAnchors) => void;
  /** Called when the user drags the camera cube to change bearing/pitch (radians). */
  onPoseChange?: (bearing: number, pitch: number) => void;
  /** Called when the user drags any camera cube in a multi-camera visualizer. */
  onCameraPoseChange?: (
    cameraIndex: number,
    bearing: number,
    pitch: number
  ) => void;
  /** Called when camera pose dragging starts or ends. */
  onCameraPoseDragStateChange?: (dragging: boolean) => void;
  /** Called when overview/sphere orbit dragging starts or ends. */
  onOrbitDragStateChange?: (dragging: boolean) => void;
  /** Called when the visualizer focus switches to a different camera. */
  onActiveCameraChange?: (cameraIndex: number) => void;
};

export type ViewStateVisualizerPart<UpdateInput, DisplayInput> = ThreePart<
  UpdateInput,
  DisplayInput
>;

export type ViewStateVisualizerPrimitive = {
  update: (
    viewState: ViewStateVisualizerInput
  ) => ViewStateVisualizerLabelAnchors;
  resize: (
    size: ViewStateVisualizerSize
  ) => ViewStateVisualizerLabelAnchors | null;
  setActiveCameraIndex: (
    cameraIndex: number
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
  setVolumeBoxes: (
    options: ViewStateVisualizerVolumeBoxesOptions
  ) => ViewStateVisualizerLabelAnchors | null;
  setInteractive: (interactive: boolean) => void;
  readLabelAnchors: () => ViewStateVisualizerLabelAnchors | null;
  dispose: () => void;
};
