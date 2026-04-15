import type { RingMaterialPreset } from "@carma-mapping/engines/cesium/core";

import type { PointQueryDiscPlacementMode } from "./point-query-disc-placement-mode";

export type PointQueryControllerOptions = {
  queryEnabled: boolean;
  debugTelemetryEnabled?: boolean;
  showCursor: boolean;
  showDisc?: boolean;
  tangentDiscVisualizerEnabled?: boolean;
  hideNativeCursor: boolean;
  discRadiusMeters: number;
  discScalingMode: "screen" | "world";
  innerHoleRadiusRatio?: number;
  targetScreenRadiusCssPx?: number;
  discOpacity: number;
  discMaterialPreset: RingMaterialPreset;
  discColor: string;
  tangentDiscVisualizerPlacementMode?: PointQueryDiscPlacementMode;
  tangentDiscVisualizerShowNormalLine?: boolean;
  tangentDiscVisualizerTrailSampleCount?: number;
  tangentDiscVisualizerWeightDecayGamma?: number;
};

export const POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS = {
  MISSING_SCREEN_POSITION: "missing-screen-position",
  MISSING_TRUE_DISC_POINT: "missing-true-disc-point",
  MISSING_TRUE_DISC_NORMAL: "missing-true-disc-normal",
  TRUE_SAMPLE_MISS: "true-sample-miss",
  TRUE_NORMAL_MISS: "true-normal-miss",
  REPROJECTION_MISS: "reprojection-miss",
} as const;

export type PointQueryTangentPlaneFailureReason =
  (typeof POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS)[keyof typeof POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS];

export type PointQueryTangentPlaneFailure = {
  t: number;
  inputVersion: number;
  reason: PointQueryTangentPlaneFailureReason;
  requestedAtMs: number;
  placementMode: PointQueryDiscPlacementMode;
  clientPosition: { x: number; y: number } | null;
  screenPosition: { x: number; y: number } | null;
  hasLatestTrueDiscWorldPosition: boolean;
  hasLatestDiscNormal: boolean;
  hasSampledPoint: boolean;
  hasSampledSurfaceNormal: boolean;
};

export type PointQueryDiscOriginJump = {
  t: number;
  inputVersion: number;
  requestedAtMs: number;
  placementMode: PointQueryDiscPlacementMode;
  distanceMeters: number;
  thresholdMeters: number;
  metersPerPixel: number;
  thresholdPixelResolutionMultiplier: number;
  source: "true-sample" | "fast-reproject";
  previousClientPosition: { x: number; y: number } | null;
  nextClientPosition: { x: number; y: number } | null;
};

export type PointQueryDiscScaleChange = {
  t: number;
  inputVersion: number;
  requestedAtMs: number;
  placementMode: PointQueryDiscPlacementMode;
  source: "true-sample" | "fast-reproject";
  previousScaleFactor: number;
  nextScaleFactor: number;
  relativeChange: number;
  thresholdRelativeChange: number;
};

export type PointQueryTelemetryEntry = {
  t: number;
  mouseHz: number;
  renderHz: number;
  sampleHz: number;
  discHz: number;
  skipHz: number;
  inputVersion: number;
  processedVersion: number;
  requestedAtMs: number;
  renderedAtMs: number;
  requestToDiscLatencyMs: number;
  measuredLagSource: "none" | "live" | "offset";
  measuredLagPx: number;
  liveLagPx: number;
  sampleOffsetPx: number;
  clientX: number | null;
  clientY: number | null;
  renderedClientX: number | null;
  renderedClientY: number | null;
  discClientX: number | null;
  discClientY: number | null;
  sampleClientX: number | null;
  sampleClientY: number | null;
  requestClientX: number | null;
  requestClientY: number | null;
  requestSampleClientX: number | null;
  requestSampleClientY: number | null;
};

export type PointQueryControllerTelemetrySnapshot = {
  capturedAt: string;
  maxRenderRequestRateHz: number;
  latestRatesHz: {
    mouse: number;
    render: number;
    sample: number;
    disc: number;
    skip: number;
  };
  latestInputVersion: number;
  lastProcessedInputVersion: number;
  latestRequestedAtMs: number;
  latestRenderedAtMs: number;
  latestRequestToDiscLatencyMs: number;
  latestMeasuredLagSource: "none" | "live" | "offset";
  latestMeasuredLagPx: number;
  latestLiveLagPx: number;
  latestSampleOffsetPx: number;
  latestClientPosition: { x: number; y: number } | null;
  latestRenderedClientPosition: { x: number; y: number } | null;
  latestDiscClientPosition: { x: number; y: number } | null;
  latestSampleClientPosition: { x: number; y: number } | null;
  latestRequestedClientPosition: { x: number; y: number } | null;
  latestRequestedSampleClientPosition: { x: number; y: number } | null;
  tangentPlaneFailureCount: number;
  tangentPlaneFailureCounts: Record<
    PointQueryTangentPlaneFailureReason,
    number
  >;
  latestTangentPlaneFailure: PointQueryTangentPlaneFailure | null;
  discOriginJumpCount: number;
  latestDiscOriginJump: PointQueryDiscOriginJump | null;
  discScaleChangeCount: number;
  latestDiscScaleChange: PointQueryDiscScaleChange | null;
  entries: PointQueryTelemetryEntry[];
  tangentPlaneFailures: PointQueryTangentPlaneFailure[];
  discOriginJumps: PointQueryDiscOriginJump[];
  discScaleChanges: PointQueryDiscScaleChange[];
};

export type PointQueryController = {
  updateOptions: (options: PointQueryControllerOptions) => void;
  getTelemetrySnapshot: () => PointQueryControllerTelemetrySnapshot;
  destroy: () => void;
};
