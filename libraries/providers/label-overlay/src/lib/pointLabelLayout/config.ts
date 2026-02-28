import type { PointLabelAttach } from "../components/PointLabel";

import type {
  DynamicLabelPlacementConfig,
  LabelPlacement,
  PointLabelLayoutConfig,
  PointLabelLayoutConfigOverrides,
} from "./types";

const DEFAULT_STEM_ANGLE_RAD = Math.PI / 4;
const ALL_ATTACHES: PointLabelAttach[] = ["left", "right", "center"];
const DEFAULT_PLACEMENT_ORDER: PointLabelAttach[] = ["left", "right"];

export const DEFAULT_DYNAMIC_LABEL_PLACEMENT_CONFIG: DynamicLabelPlacementConfig =
  {
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
  dynamicLabelPlacement: true,
  dynamicLabelPlacementConfig: DEFAULT_DYNAMIC_LABEL_PLACEMENT_CONFIG,
  pitchResponsiveAngle: true,
  pitchResponseStrength: 1,
  // Full perspective mimic default: 45deg max when camera is side-on.
  pitchResponseClampRad: Math.PI / 4,
  transitionDurationMs: 300,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeAngle = (angleRad: number): number => {
  let normalized = angleRad;
  while (normalized <= -Math.PI) normalized += 2 * Math.PI;
  while (normalized > Math.PI) normalized -= 2 * Math.PI;
  return normalized;
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
    regularDistance,
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
  const resolvedTransitionDurationMs =
    transitionDurationMs ??
    anchorSwitchTransitionMs ??
    DEFAULT_POINT_LABEL_LAYOUT_CONFIG.transitionDurationMs;

  return {
    ...DEFAULT_POINT_LABEL_LAYOUT_CONFIG,
    ...restOverrides,
    transitionDurationMs: resolvedTransitionDurationMs,
    stemDistance,
    placementOrder: normalizePlacementOrder(placementOrder),
    dynamicLabelPlacement:
      dynamicLabelPlacement ??
      legacyDynamicLabelPlacement ??
      DEFAULT_POINT_LABEL_LAYOUT_CONFIG.dynamicLabelPlacement,
    dynamicLabelPlacementConfig: resolveDynamicLabelPlacementConfig(
      dynamicLabelPlacementConfig ?? legacyDynamicLabelPlacementConfig
    ),
  };
};

export const getPerspectiveStemAngleMagnitude = (
  cameraPitch: number,
  config: PointLabelLayoutConfig
): number => {
  if (!config.pitchResponsiveAngle) return DEFAULT_STEM_ANGLE_RAD;

  // 0 at nadir (flat/horizontal), 1 near side view.
  const pitchFactor = clamp(Math.abs(Math.cos(cameraPitch)), 0, 1);
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
      return -Math.PI + angleMagnitudeRad;
    case "center":
      return -Math.PI / 2;
    default:
      return -Math.PI / 2;
  }
};

export const createPlacement = (
  attach: PointLabelAttach,
  distance: number,
  angleMagnitudeRad: number
): LabelPlacement => ({
  id: attach,
  attach,
  distance,
  angleRad: normalizeAngle(
    getPlacementAngleForAttach(attach, angleMagnitudeRad)
  ),
});
