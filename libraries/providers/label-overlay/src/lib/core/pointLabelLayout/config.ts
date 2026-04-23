import {
  clamp,
  PI,
  MINUS_PI,
  MINUS_PI_OVER_TWO,
  PI_OVER_FOUR,
  negativePiToPi,
} from "@carma-commons/math";
import { clampUnitRangeRatio } from "@carma-units";

import {
  POINT_LABEL_ATTACHES,
  type PointLabelAttach,
} from "../pointLabelAttach";
import type {
  DynamicLabelPlacementConfig,
  LabelPlacement,
  PointLabelLayoutConfig,
  PointLabelLayoutConfigOverrides,
} from "./types";
const DEFAULT_STEM_ANGLE_RAD = PI_OVER_FOUR;
const ALL_ATTACHES: readonly PointLabelAttach[] = POINT_LABEL_ATTACHES;
const DEFAULT_PLACEMENT_ORDER: PointLabelAttach[] = ["left", "right", "center"];
const DEFAULT_STEM_DISTANCE_SCALE_ORDER = [1, 0.75, 0.5, 0.25, 0, 1.125, 1.25];

export const DEFAULT_DYNAMIC_LABEL_PLACEMENT_CONFIG: DynamicLabelPlacementConfig =
  {
    mode: "fallback",
    avoidStemCrossing: true,
    iterations: 14,
    step: 0.38,
    maxDelta: 14,
    springStrength: 0.12,
    repulsionBase: 2.2,
    minDistance: 20,
    maxDistance: 140,
    viewportAdjustmentStep: 8,
  };

export const DEFAULT_POINT_LABEL_LAYOUT_CONFIG: PointLabelLayoutConfig = {
  placementOrder: DEFAULT_PLACEMENT_ORDER,
  stemDistance: 20,
  stemDistanceScaleOrder: DEFAULT_STEM_DISTANCE_SCALE_ORDER,
  dynamicLabelPlacement: true,
  allowEarlyRemoval: true,
  dynamicLabelPlacementConfig: DEFAULT_DYNAMIC_LABEL_PLACEMENT_CONFIG,
  pitchResponsiveAngle: true,
  pitchResponseStrength: 1,
  // Full perspective mimic default: 45deg max when camera is side-on.
  pitchResponseClampRad: PI_OVER_FOUR,
  transitionDurationMs: 300,
};

const normalizeAngle = (angleRad: number): number => {
  const normalized = negativePiToPi(angleRad);
  return normalized === MINUS_PI ? PI : normalized;
};

const normalizePlacementOrder = (
  placementOrder?: PointLabelAttach[]
): PointLabelAttach[] => {
  const sourceOrder =
    placementOrder && placementOrder.length > 0
      ? placementOrder
      : DEFAULT_PLACEMENT_ORDER;
  const deduped = sourceOrder.reduce<PointLabelAttach[]>(
    (accumulator, attach) =>
      ALL_ATTACHES.includes(attach) && !accumulator.includes(attach)
        ? [...accumulator, attach]
        : accumulator,
    []
  );
  return deduped.length > 0 ? deduped : DEFAULT_PLACEMENT_ORDER;
};

const resolveDynamicLabelPlacementConfig = (
  overrides?: Partial<DynamicLabelPlacementConfig>
): DynamicLabelPlacementConfig => ({
  ...DEFAULT_DYNAMIC_LABEL_PLACEMENT_CONFIG,
  ...overrides,
});

const normalizeStemDistanceScaleOrder = (
  stemDistanceScaleOrder?: number[]
): number[] => {
  const sourceOrder =
    stemDistanceScaleOrder && stemDistanceScaleOrder.length > 0
      ? stemDistanceScaleOrder
      : DEFAULT_STEM_DISTANCE_SCALE_ORDER;
  const normalized = sourceOrder.reduce<number[]>((accumulator, value) => {
    if (!Number.isFinite(value) || value < 0 || accumulator.includes(value)) {
      return accumulator;
    }

    return [...accumulator, value];
  }, []);

  return normalized.length > 0 ? normalized : DEFAULT_STEM_DISTANCE_SCALE_ORDER;
};

export const resolvePointLabelLayoutConfig = (
  overrides?: PointLabelLayoutConfigOverrides
): PointLabelLayoutConfig => {
  const {
    placementOrder,
    transitionDurationMs,
    anchorSwitchTransitionMs,
    dynamicLabelPlacementConfig,
    dynamicLabelPlacement,
    forceDirectedPlacement,
    forceEnabled,
    forceLayoutOnTop,
    regularDistance,
    stemDistanceScaleOrder,
    distanceScaleOrder,
    stemDistance: stemDistanceOverride,
    ...restOverrides
  } = overrides ?? {};

  const stemDistance =
    stemDistanceOverride ??
    regularDistance ??
    DEFAULT_POINT_LABEL_LAYOUT_CONFIG.stemDistance;

  const legacyDynamicLabelPlacement =
    forceDirectedPlacement?.enabled ?? forceEnabled;
  const legacyDynamicLabelPlacementConfig = forceDirectedPlacement
    ? (Object.fromEntries(
        Object.entries(forceDirectedPlacement).filter(
          ([key]) => key !== "enabled"
        )
      ) as Partial<DynamicLabelPlacementConfig>)
    : undefined;
  const dynamicLabelPlacementConfigOverrides: Partial<DynamicLabelPlacementConfig> =
    {
      ...legacyDynamicLabelPlacementConfig,
      ...(forceLayoutOnTop !== undefined &&
      dynamicLabelPlacementConfig?.mode === undefined &&
      legacyDynamicLabelPlacementConfig?.mode === undefined
        ? {
            mode: forceLayoutOnTop ? "always" : "fallback",
          }
        : {}),
      ...dynamicLabelPlacementConfig,
    };
  const resolvedTransitionDurationMs =
    transitionDurationMs ??
    anchorSwitchTransitionMs ??
    DEFAULT_POINT_LABEL_LAYOUT_CONFIG.transitionDurationMs;

  return {
    ...DEFAULT_POINT_LABEL_LAYOUT_CONFIG,
    ...restOverrides,
    transitionDurationMs: resolvedTransitionDurationMs,
    stemDistance,
    stemDistanceScaleOrder: normalizeStemDistanceScaleOrder(
      stemDistanceScaleOrder ?? distanceScaleOrder
    ),
    placementOrder: normalizePlacementOrder(placementOrder),
    dynamicLabelPlacement:
      dynamicLabelPlacement ??
      legacyDynamicLabelPlacement ??
      DEFAULT_POINT_LABEL_LAYOUT_CONFIG.dynamicLabelPlacement,
    dynamicLabelPlacementConfig: resolveDynamicLabelPlacementConfig(
      dynamicLabelPlacementConfigOverrides
    ),
  };
};

/**
 * Compute the perspective-dependent stem angle magnitude for label placement.
 *
 * `cameraPitch` uses the view-sync convention:
 *   0 = nadir (looking straight down), π/2 = horizon (looking sideways).
 */
export const getPerspectiveStemAngleMagnitude = (
  cameraPitch: number,
  config: PointLabelLayoutConfig
): number => {
  if (!config.pitchResponsiveAngle) return DEFAULT_STEM_ANGLE_RAD;

  // 0 at nadir, 1 near horizon — uses sin because view-sync pitch
  // starts at 0 (nadir) and increases toward π/2 (horizon).
  const pitchFactor = clampUnitRangeRatio(Math.abs(Math.sin(cameraPitch)));
  const rawMagnitude =
    DEFAULT_STEM_ANGLE_RAD * pitchFactor * config.pitchResponseStrength;

  return clamp(rawMagnitude, 0, config.pitchResponseClampRad);
};

const getPlacementAngleForAttach = (
  attach: PointLabelAttach,
  angleMagnitudeRad: number
): number => {
  switch (attach) {
    case "left":
      return -angleMagnitudeRad;
    case "right":
      return MINUS_PI + angleMagnitudeRad;
    case "center":
      return MINUS_PI_OVER_TWO;
    default:
      return MINUS_PI_OVER_TWO;
  }
};

export const createPlacement = (
  attach: PointLabelAttach,
  distance: number,
  angleMagnitudeRad: number,
  id?: string
): LabelPlacement => ({
  id: id ?? `${attach}:${distance.toFixed(3)}`,
  attach,
  distance,
  angleRad: normalizeAngle(
    getPlacementAngleForAttach(attach, angleMagnitudeRad)
  ),
});
