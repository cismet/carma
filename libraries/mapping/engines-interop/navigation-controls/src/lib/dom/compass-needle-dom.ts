import { Easing, type Easing as EasingFunction } from "@carma-commons/math";
import { clamp, PI_OVER_TWO } from "@carma/math";
import { degToRadNumeric } from "@carma/units/helpers";

import type { NavigationNeedleOrientationDeg } from "../contracts";
const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_COMPASS_PITCH_DEG = 90;
const ABSOLUTE_MAX_VISUAL_COMPASS_PITCH_DEG = 89;
const DEFAULT_PITCH_LIMIT_START_DEG = 45;
const DEFAULT_MAX_VISUAL_COMPASS_PITCH_DEG = 70;

export const COMPASS_NEEDLE_PITCH_LIMIT_EASINGS = {
  LINEAR: "linear",
  QUADRATIC_OUT: "quadratic-out",
  CUBIC_OUT: "cubic-out",
  SINUSOIDAL_OUT: "sinusoidal-out",
} as const;

export type CompassNeedlePitchLimitEasingName =
  (typeof COMPASS_NEEDLE_PITCH_LIMIT_EASINGS)[keyof typeof COMPASS_NEEDLE_PITCH_LIMIT_EASINGS];

export type CompassNeedlePitchLimitOptions = {
  startPitchDeg?: number;
  maxVisualPitchDeg?: number;
  easing?: EasingFunction;
};

export type CompassNeedleOptions = {
  northColor?: string;
  neutralColor?: string;
  pitchLimit?: CompassNeedlePitchLimitOptions;
};

const COMPASS_NEEDLE_PITCH_LIMIT_EASING_FUNCTIONS: Record<
  CompassNeedlePitchLimitEasingName,
  EasingFunction
> = {
  [COMPASS_NEEDLE_PITCH_LIMIT_EASINGS.LINEAR]: Easing.LINEAR_NONE,
  [COMPASS_NEEDLE_PITCH_LIMIT_EASINGS.QUADRATIC_OUT]: Easing.QUADRATIC_OUT,
  [COMPASS_NEEDLE_PITCH_LIMIT_EASINGS.CUBIC_OUT]: Easing.CUBIC_OUT,
  [COMPASS_NEEDLE_PITCH_LIMIT_EASINGS.SINUSOIDAL_OUT]: Easing.SINUSOIDAL_OUT,
};

export const readCompassNeedlePitchLimitEasing = (
  easingName: CompassNeedlePitchLimitEasingName
): EasingFunction => COMPASS_NEEDLE_PITCH_LIMIT_EASING_FUNCTIONS[easingName];

export const readCompassNeedleVisualPitchDeg = (
  pitchDeg: number,
  options: CompassNeedlePitchLimitOptions = {}
) => {
  const normalizedPitchDeg = clamp(pitchDeg, 0, MAX_COMPASS_PITCH_DEG);
  const startPitchDeg = clamp(
    options.startPitchDeg ?? DEFAULT_PITCH_LIMIT_START_DEG,
    0,
    MAX_COMPASS_PITCH_DEG
  );
  const maxVisualPitchDeg = clamp(
    options.maxVisualPitchDeg ?? DEFAULT_MAX_VISUAL_COMPASS_PITCH_DEG,
    startPitchDeg,
    ABSOLUTE_MAX_VISUAL_COMPASS_PITCH_DEG
  );

  if (normalizedPitchDeg <= startPitchDeg) {
    return normalizedPitchDeg;
  }

  const easing = options.easing ?? Easing.SINUSOIDAL_OUT;
  const limitingProgress = clamp(
    (normalizedPitchDeg - startPitchDeg) /
      Math.max(MAX_COMPASS_PITCH_DEG - startPitchDeg, Number.EPSILON),
    0,
    1
  );
  const easedProgress = clamp(easing(limitingProgress), 0, 1);

  return startPitchDeg + (maxVisualPitchDeg - startPitchDeg) * easedProgress;
};

export const computeCompassNeedleTransformDeg = (
  orientation: NavigationNeedleOrientationDeg = {
    pitchDeg: 0,
    headingDeg: 0,
  },
  options: CompassNeedleOptions = {}
): string => {
  const normalizedHeadingRad = -degToRadNumeric(orientation.headingDeg)!;
  const limitedPitchRad = degToRadNumeric(
    readCompassNeedleVisualPitchDeg(orientation.pitchDeg, options.pitchLimit)
  )!;
  const normalizedPitchRad = clamp(limitedPitchRad, 0, PI_OVER_TWO);

  return `scale(${Math.pow(
    1 + normalizedPitchRad * 0.1,
    3
  )}) rotateX(${normalizedPitchRad}rad) rotateZ(${normalizedHeadingRad}rad)`;
};

const createNeedlePath = (d: string, fill?: string) => {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  if (fill) {
    path.setAttribute("fill", fill);
  }
  return path;
};

export const createCompassNeedleElement = ({
  northColor = "#333",
  neutralColor = "#ccc",
}: CompassNeedleOptions = {}) => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", "29");
  svg.setAttribute("height", "29");
  svg.setAttribute("viewBox", "0 0 29 29");
  svg.setAttribute("fill", northColor);
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.transformOrigin = "center";
  svg.style.transformStyle = "preserve-3d";

  svg.append(createNeedlePath("m10.5 14 4-8 4 8z"));
  svg.append(createNeedlePath("m10.5 16 4 8 4-8z", neutralColor));

  return svg;
};

export const createCompassNeedleController = (
  svg: SVGSVGElement,
  options: CompassNeedleOptions = {}
) => {
  let frameId: number | null = null;
  let pendingOrientation: NavigationNeedleOrientationDeg = {
    pitchDeg: 0,
    headingDeg: 0,
  };

  const applyPendingOrientation = () => {
    frameId = null;
    svg.style.transform = computeCompassNeedleTransformDeg(
      pendingOrientation,
      options
    );
  };

  const setOrientation = (orientation: NavigationNeedleOrientationDeg) => {
    pendingOrientation = orientation;
    if (frameId !== null) {
      return;
    }

    frameId = window.requestAnimationFrame(applyPendingOrientation);
  };

  applyPendingOrientation();

  return {
    setOrientation,
    destroy: () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
  };
};
