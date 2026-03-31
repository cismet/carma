import type { Milliseconds } from "@carma/units/types";

export const NAVIGATION_ZOOM_MODES = {
  AUTO: "auto",
  RANGE: "range",
  FOV: "fov",
  DOLLY: "dolly",
} as const;

export const DEFAULT_NAVIGATION_HOME_DURATION_MS = 900;
export const DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC = 30;

export const NAVIGATION_ORBIT_TARGETS = {
  CURRENT_VIEW: "current-view",
} as const;

export const NAVIGATION_ORBIT_DIRECTIONS = {
  CW: "cw",
  CCW: "ccw",
} as const;

export const NAVIGATION_COMPASS_CURSORS = {
  DEFAULT: "default",
  POINTER: "pointer",
  GRAB: "grab",
  GRABBING: "grabbing",
} as const;

export type NavigationZoomMode =
  (typeof NAVIGATION_ZOOM_MODES)[keyof typeof NAVIGATION_ZOOM_MODES];

export type NavigationNeedleOrientationDeg = {
  // MapLibre-style pitch convention: 0 = nadir / top-down, 90 = horizon.
  pitchDeg: number;
  headingDeg: number;
};

export type NavigationTransitionLifecycle = {
  onStarted?: () => void;
  onCompleted?: () => void;
  onCanceled?: () => void;
};

export type NavigationTransitionTiming = {
  duration?: Milliseconds;
};

export type NavigationTransitionOptions = NavigationTransitionTiming &
  NavigationTransitionLifecycle;

export type NavigationZoomOptions = NavigationTransitionOptions & {
  animate?: boolean;
  mode?: NavigationZoomMode;
  zoomDelta?: number;
  minimumFovRad?: number;
  maximumFovRad?: number;
};

export type NavigationOrbitTarget =
  | (typeof NAVIGATION_ORBIT_TARGETS)[keyof typeof NAVIGATION_ORBIT_TARGETS]
  | {
      longitudeDeg: number;
      latitudeDeg: number;
      altitudeM?: number;
    };

export type NavigationOrbitDirection =
  (typeof NAVIGATION_ORBIT_DIRECTIONS)[keyof typeof NAVIGATION_ORBIT_DIRECTIONS];

export type NavigationOrbitOptions = NavigationTransitionOptions & {
  target?: NavigationOrbitTarget;
  direction?: NavigationOrbitDirection;
  bearingDeltaDeg?: number;
  rangeM?: number;
  revolutionDurationSec?: number;
  speedDegPerSecond?: number;
  minPitchDeg?: number;
};

export type NavigationCompassCursor =
  (typeof NAVIGATION_COMPASS_CURSORS)[keyof typeof NAVIGATION_COMPASS_CURSORS];

export type NavigationNeedleOrientationSink = (
  orientation: NavigationNeedleOrientationDeg
) => void;

export type NavigationOrbitActiveSink = (active: boolean) => void;

export type NavigationMethods<TView = unknown, TPosition = unknown> = {
  showCompass?: boolean;
  canOrbit?: boolean;
  compassDisabled?: boolean;
  compassCursor?: NavigationCompassCursor;
  maxCompassPitchDeg?: number;
  setView: (state: TView) => void;
  flyTo: (state: TView, options?: NavigationTransitionOptions) => void;
  zoomIn: (options?: NavigationZoomOptions) => void;
  zoomOut: (options?: NavigationZoomOptions) => void;
  goHome: (options?: NavigationTransitionOptions) => void;
  orbit: (options?: NavigationOrbitOptions) => void;
  getPosition?: () => TPosition;
  beginCompassDrag?: () => void;
  setCompassBearingPitch?: (
    orientation: NavigationNeedleOrientationDeg
  ) => void;
  endCompassDrag?: () => void;
  alignNorth?: (options?: NavigationTransitionOptions) => void;
  alignNorthNadir?: (options?: NavigationTransitionOptions) => void;
  subscribeCompassOrientation?: (
    sink: NavigationNeedleOrientationSink
  ) => () => void;
  subscribeOrbitActive?: (sink: NavigationOrbitActiveSink) => () => void;
  destroy?: () => void;
};
