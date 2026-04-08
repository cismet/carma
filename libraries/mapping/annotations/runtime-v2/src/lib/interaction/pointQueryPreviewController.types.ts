import type { RingMaterialPreset } from "@carma-mapping/engines/cesium/core";

import type { PointQueryPreviewDiscPlacementMode } from "./pointQueryPreviewDiscPlacementMode";

export type PointQueryPreviewControllerOptions = {
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
  tangentDiscVisualizerPlacementMode?: PointQueryPreviewDiscPlacementMode;
  tangentDiscVisualizerShowNormalLine?: boolean;
  tangentDiscVisualizerTrailSampleCount?: number;
  tangentDiscVisualizerWeightDecayGamma?: number;
};

export const POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS = {
  MISSING_SCREEN_POSITION: "missing-screen-position",
  MISSING_TRUE_DISC_POINT: "missing-true-disc-point",
  MISSING_TRUE_DISC_NORMAL: "missing-true-disc-normal",
  TRUE_SAMPLE_MISS: "true-sample-miss",
  TRUE_NORMAL_MISS: "true-normal-miss",
  REPROJECTION_MISS: "reprojection-miss",
} as const;

export type PointQueryPreviewTangentPlaneFailureReason =
  (typeof POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS)[keyof typeof POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS];

export type PointQueryPreviewTangentPlaneFailure = {
  t: number;
  inputVersion: number;
  reason: PointQueryPreviewTangentPlaneFailureReason;
  requestedAtMs: number;
  placementMode: PointQueryPreviewDiscPlacementMode;
  clientPosition: { x: number; y: number } | null;
  screenPosition: { x: number; y: number } | null;
  hasLatestTrueDiscWorldPosition: boolean;
  hasLatestDiscNormal: boolean;
  hasSampledPoint: boolean;
  hasSampledSurfaceNormal: boolean;
};

export type PointQueryPreviewDiscOriginJump = {
  t: number;
  inputVersion: number;
  requestedAtMs: number;
  placementMode: PointQueryPreviewDiscPlacementMode;
  distanceMeters: number;
  thresholdMeters: number;
  metersPerPixel: number;
  thresholdPixelResolutionMultiplier: number;
  source: "true-sample" | "fast-reproject";
  previousClientPosition: { x: number; y: number } | null;
  nextClientPosition: { x: number; y: number } | null;
};

export type PointQueryPreviewDiscScaleChange = {
  t: number;
  inputVersion: number;
  requestedAtMs: number;
  placementMode: PointQueryPreviewDiscPlacementMode;
  source: "true-sample" | "fast-reproject";
  previousScaleFactor: number;
  nextScaleFactor: number;
  relativeChange: number;
  thresholdRelativeChange: number;
};

export type PointQueryPreviewTelemetryEntry = {
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

export type PointQueryPreviewControllerTelemetrySnapshot = {
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
    PointQueryPreviewTangentPlaneFailureReason,
    number
  >;
  latestTangentPlaneFailure: PointQueryPreviewTangentPlaneFailure | null;
  discOriginJumpCount: number;
  latestDiscOriginJump: PointQueryPreviewDiscOriginJump | null;
  discScaleChangeCount: number;
  latestDiscScaleChange: PointQueryPreviewDiscScaleChange | null;
  entries: PointQueryPreviewTelemetryEntry[];
  tangentPlaneFailures: PointQueryPreviewTangentPlaneFailure[];
  discOriginJumps: PointQueryPreviewDiscOriginJump[];
  discScaleChanges: PointQueryPreviewDiscScaleChange[];
};

export type PointQueryPreviewController = {
  updateOptions: (options: PointQueryPreviewControllerOptions) => void;
  getTelemetrySnapshot: () => PointQueryPreviewControllerTelemetrySnapshot;
  destroy: () => void;
};
