import type { CssPixelPosition } from "@carma/units/types";
import type { PointLabelAnchorKind } from "../pointLabelAnchorSemantics";
import type { PointLabelAttach } from "../pointLabelAttach";
export type { CssPixelPosition } from "@carma/units/types";

export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type StemSegment = {
  start: CssPixelPosition;
  end: CssPixelPosition;
};

export type LabelPlacement = {
  id: string;
  angleRad: number;
  distance: number;
  attach: PointLabelAttach;
};

export type DynamicLabelPlacementMode = "fallback" | "always";

export type CandidateEvaluation = {
  placement: LabelPlacement;
  rect: Rect;
  stemSegment: StemSegment;
  score: number;
  orderIndex: number;
  intersectsLabel: boolean;
  intersectsOtherAnchor: boolean;
  crossesStem: boolean;
  viewportPenalty: number;
  collisionFree: boolean;
};

export type DynamicLabelPlacementConfig = {
  mode: DynamicLabelPlacementMode;
  avoidStemCrossing: boolean;
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
  stemDistanceScaleOrder: number[];
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
  forceLayoutOnTop?: boolean;
  distanceScaleOrder?: number[];
};

export type LayoutPointInput = {
  id: string;
  anchor: CssPixelPosition;
  anchorKind?: PointLabelAnchorKind;
  text: string;
  compactText?: string;
  index: number;
  layoutPriority?: number;
  lockPreferredPlacement?: boolean;
  preferredAttach?: PointLabelAttach;
  preferredStemDistance?: number;
};

export type PointLabelLayoutResult = {
  placements: Record<string, LabelPlacement>;
  hiddenByLayout: Set<string>;
  collapsedToCompact: Set<string>;
};
