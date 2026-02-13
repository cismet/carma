import type { PointLabelAttach } from "../components/PointLabel";

export type ScreenPoint = { x: number; y: number };

export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type LabelPlacement = {
  id: string;
  angleRad: number;
  distance: number;
  attach: PointLabelAttach;
};

export type CandidateEvaluation = {
  placement: LabelPlacement;
  rect: Rect;
  score: number;
  orderIndex: number;
  intersectsLabel: boolean;
  intersectsOtherAnchor: boolean;
  viewportPenalty: number;
  collisionFree: boolean;
};

export type DynamicLabelPlacementConfig = {
  iterations: number;
  step: number;
  maxDelta: number;
  springStrength: number;
  repulsionBase: number;
  minDistance: number;
  maxDistance: number;
  viewportAdjustmentStep: number;
};

export type PointLabelLayoutConfig = {
  placementOrder: PointLabelAttach[];
  stemDistance: number;
  dynamicLabelPlacement: boolean;
  dynamicLabelPlacementConfig: DynamicLabelPlacementConfig;
  pitchResponsiveAngle: boolean;
  pitchResponseStrength: number;
  // Maximum connector angle away from horizontal when pitch responsiveness is enabled.
  pitchResponseClampRad: number;
  transitionDurationMs: number;
};

export type PointLabelLayoutConfigOverrides = Partial<
  Omit<PointLabelLayoutConfig, "dynamicLabelPlacementConfig">
> & {
  dynamicLabelPlacementConfig?: Partial<DynamicLabelPlacementConfig>;
  // Backward compatibility for previous option name.
  anchorSwitchTransitionMs?: number;
  // Backward compatibility for older option shape.
  forceDirectedPlacement?: Partial<DynamicLabelPlacementConfig> & {
    enabled?: boolean;
  };
  // Backward compatibility for older option names.
  regularDistance?: number;
  forceEnabled?: boolean;
};

export type LayoutPointInput = {
  id: string;
  anchor: ScreenPoint;
  text: string;
  index: number;
  layoutPriority?: number;
  lockPreferredPlacement?: boolean;
};

export type PointLabelLayoutResult = {
  placements: Record<string, LabelPlacement>;
  hiddenByLayout: Set<string>;
};
