import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";

import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  NAVIGATION_ORBIT_DIRECTIONS,
} from "@carma-mapping/engines-interop/navigation-controls";
import {
  RING_MATERIAL_PRESETS,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";
import {
  createPointQueryPreviewController,
  POINT_QUERY_PREVIEW_DISC_PLACEMENT_MODES,
  type PointQueryPreviewController,
  type PointQueryPreviewDiscPlacementMode,
} from "@carma-mapping/annotations/runtime-v2";
import { type CesiumWidget } from "@carma-cesium";

import { setupCesium } from "../map-engine-switcher/helpers/cesium-setup";
import { requestStoryCesiumRender } from "../shared/cesiumRuntimeGuards";
import { ViewSyncRuntimeNavigationControls } from "../mapping/view-sync/controls/view-sync-runtime-navigation-controls";
import {
  buildOrbitOptions,
  buildZoomOptions,
  DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
  DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
  ZOOM_DELTA_PRESETS,
} from "../mapping/view-sync/framework-controls.story-helpers";
import { CARMA_STORY_MAPPING_ENGINES } from "../mapping/view-sync/mappingEngines";
import { useContainerResize } from "../mapping/view-sync/viewSyncStoryHooks";
import {
  applyViewStateToCesiumWidget,
  createStoryTargetState,
  type CesiumRuntimeHandle,
} from "../mapping/view-sync/viewSyncStoryShared";

import "cesium/Build/Cesium/Widgets/widgets.css";

type CursorOverlaySamplerStoryProps = {
  queryEnabled: boolean;
  showCursor: boolean;
  showDisc?: boolean;
  tangentDiscVisualizerEnabled?: boolean;
  hideNativeCursor: boolean;
  discRadiusMeters: number;
  discScalingMode: "screen" | "world";
  discInnerHoleRadiusRatio: number;
  discTargetRadiusCssPx: number;
  discOpacity: number;
  discMaterialPreset: RingMaterialPreset;
  discColor: string;
  tangentDiscVisualizerPlacementMode?: PointQueryPreviewDiscPlacementMode;
  tangentDiscVisualizerShowNormalLine?: boolean;
  tangentDiscVisualizerTrailSampleCount?: number;
  tangentDiscVisualizerWeightDecayGamma?: number;
};

type CursorOverlayComparisonRunSummary = {
  mode: PointQueryPreviewDiscPlacementMode;
  sampleCount: number;
  meanLagPx: number;
  p95LagPx: number;
  maxLagPx: number;
  meanLiveLagPx: number;
  maxLiveLagPx: number;
  meanSampleOffsetPx: number;
  maxSampleOffsetPx: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
};

type CursorOverlayComparisonSummary = {
  capturedAt: string;
  pathPointCount: number;
  pointIntervalMs: number;
  runs: CursorOverlayComparisonRunSummary[];
};

const FIGURE_SPACE = "\u2007";

const TOP_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1800,
  pointerEvents: "none",
};

const BOTTOM_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1800,
  pointerEvents: "none",
};

const STATUS_BAR_HEIGHT_PX = 24;
const NAVIGATION_CONTROL_MARGIN_PX = 10;
const NAVIGATION_CONTROLS_TOP_OFFSET_PX =
  STATUS_BAR_HEIGHT_PX + NAVIGATION_CONTROL_MARGIN_PX;
const STATUS_ACTION_STYLE: CSSProperties = {
  pointerEvents: "auto",
  appearance: "none",
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.14)",
  color: "#ffffff",
  fontSize: 12,
  lineHeight: 1.2,
  padding: "2px 8px",
  cursor: "pointer",
};
const STATUS_NUMERIC_TEXT_STYLE: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
  whiteSpace: "pre",
};

const formatFixedStatusNumber = (
  value: number,
  {
    minimumIntegerDigits,
    fractionDigits,
  }: {
    minimumIntegerDigits: number;
    fractionDigits: number;
  }
) => {
  const [integerPart, fractionPart = ""] = value
    .toFixed(fractionDigits)
    .split(".");
  const paddedIntegerPart = integerPart.padStart(
    minimumIntegerDigits,
    FIGURE_SPACE
  );

  return fractionDigits > 0
    ? `${paddedIntegerPart}.${fractionPart}`
    : paddedIntegerPart;
};

const AUTOMATED_COMPARISON_POINT_INTERVAL_MS = 4;
const AUTOMATED_COMPARISON_SETTLE_MS = 160;

const computeMean = (values: number[]) =>
  values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const computeMax = (values: number[]) =>
  values.length > 0 ? Math.max(...values) : 0;

const computePercentile = (values: number[], percentile: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const clampedPercentile = Math.min(Math.max(percentile, 0), 1);
  const index = Math.min(
    sortedValues.length - 1,
    Math.floor((sortedValues.length - 1) * clampedPercentile)
  );

  return sortedValues[index] ?? 0;
};

const buildAutomatedComparisonPath = (canvasRect: DOMRect) => {
  const anchorPoints = [
    { x: 0.18, y: 0.28 },
    { x: 0.82, y: 0.24 },
    { x: 0.76, y: 0.52 },
    { x: 0.24, y: 0.48 },
    { x: 0.3, y: 0.78 },
    { x: 0.86, y: 0.74 },
  ].map((anchor) => ({
    x: canvasRect.left + canvasRect.width * anchor.x,
    y: canvasRect.top + canvasRect.height * anchor.y,
  }));
  const path: Array<{ x: number; y: number }> = [];

  for (
    let anchorIndex = 0;
    anchorIndex < anchorPoints.length - 1;
    anchorIndex += 1
  ) {
    const start = anchorPoints[anchorIndex];
    const end = anchorPoints[anchorIndex + 1];
    const segmentPointCount = 18;

    for (let stepIndex = 0; stepIndex < segmentPointCount; stepIndex += 1) {
      const t = stepIndex / segmentPointCount;
      path.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
    }
  }

  const finalPoint = anchorPoints[anchorPoints.length - 1];
  if (finalPoint) {
    path.push(finalPoint);
  }

  return path;
};

const formatDiscPlacementModeLabel = (
  placementMode: PointQueryPreviewDiscPlacementMode
) => placementMode;

const summarizeTelemetryRun = ({
  telemetry,
  mode,
  startedAtMs,
}: {
  telemetry: NonNullable<
    ReturnType<PointQueryPreviewController["getTelemetrySnapshot"]>
  >;
  mode: PointQueryPreviewDiscPlacementMode;
  startedAtMs: number;
}): CursorOverlayComparisonRunSummary => {
  const runEntries = telemetry.entries.filter(
    (entry) =>
      entry.t >= startedAtMs && entry.clientX !== null && entry.clientY !== null
  );
  const lagValues = runEntries.map((entry) => entry.measuredLagPx);
  const liveLagValues = runEntries.map((entry) => entry.liveLagPx);
  const sampleOffsetValues = runEntries.map((entry) => entry.sampleOffsetPx);
  const latencyValues = runEntries
    .map((entry) => entry.requestToDiscLatencyMs)
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    mode,
    sampleCount: runEntries.length,
    meanLagPx: computeMean(lagValues),
    p95LagPx: computePercentile(lagValues, 0.95),
    maxLagPx: computeMax(lagValues),
    meanLiveLagPx: computeMean(liveLagValues),
    maxLiveLagPx: computeMax(liveLagValues),
    meanSampleOffsetPx: computeMean(sampleOffsetValues),
    maxSampleOffsetPx: computeMax(sampleOffsetValues),
    meanLatencyMs: computeMean(latencyValues),
    p95LatencyMs: computePercentile(latencyValues, 0.95),
    maxLatencyMs: computeMax(latencyValues),
  };
};

const serializeComparisonSummaryToTsv = (
  comparison: CursorOverlayComparisonSummary
) => {
  const summaryRows = [
    ["metric", "value"],
    ["capturedAt", comparison.capturedAt],
    ["pathPointCount", String(comparison.pathPointCount)],
    ["pointIntervalMs", String(comparison.pointIntervalMs)],
  ];
  const runHeader = [
    "mode",
    "sampleCount",
    "meanLagPx",
    "p95LagPx",
    "maxLagPx",
    "meanLiveLagPx",
    "maxLiveLagPx",
    "meanSampleOffsetPx",
    "maxSampleOffsetPx",
    "meanLatencyMs",
    "p95LatencyMs",
    "maxLatencyMs",
  ];
  const runRows = comparison.runs.map((run) => [
    run.mode,
    String(run.sampleCount),
    String(run.meanLagPx),
    String(run.p95LagPx),
    String(run.maxLagPx),
    String(run.meanLiveLagPx),
    String(run.maxLiveLagPx),
    String(run.meanSampleOffsetPx),
    String(run.maxSampleOffsetPx),
    String(run.meanLatencyMs),
    String(run.p95LatencyMs),
    String(run.maxLatencyMs),
  ]);

  return [summaryRows, [runHeader, ...runRows]]
    .map((sectionRows) => sectionRows.map((row) => row.join("\t")).join("\n"))
    .join("\n\n");
};

const serializeTelemetrySnapshotToTsv = (
  telemetry: NonNullable<
    ReturnType<PointQueryPreviewController["getTelemetrySnapshot"]>
  >
) => {
  const summaryRows = [
    ["metric", "value"],
    ["capturedAt", telemetry.capturedAt],
    ["maxRenderRequestRateHz", String(telemetry.maxRenderRequestRateHz)],
    ["latestMouseHz", String(telemetry.latestRatesHz.mouse)],
    ["latestRenderHz", String(telemetry.latestRatesHz.render)],
    ["latestSampleHz", String(telemetry.latestRatesHz.sample)],
    ["latestDiscHz", String(telemetry.latestRatesHz.disc)],
    ["latestSkipHz", String(telemetry.latestRatesHz.skip)],
    ["latestInputVersion", String(telemetry.latestInputVersion)],
    ["lastProcessedInputVersion", String(telemetry.lastProcessedInputVersion)],
    ["latestRequestedAtMs", String(telemetry.latestRequestedAtMs)],
    ["latestRenderedAtMs", String(telemetry.latestRenderedAtMs)],
    [
      "latestRequestToDiscLatencyMs",
      String(telemetry.latestRequestToDiscLatencyMs),
    ],
    ["latestMeasuredLagSource", String(telemetry.latestMeasuredLagSource)],
    ["latestMeasuredLagPx", String(telemetry.latestMeasuredLagPx)],
    ["latestLiveLagPx", String(telemetry.latestLiveLagPx)],
    ["latestSampleOffsetPx", String(telemetry.latestSampleOffsetPx)],
    ["latestClientX", String(telemetry.latestClientPosition?.x ?? "")],
    ["latestClientY", String(telemetry.latestClientPosition?.y ?? "")],
    [
      "latestRenderedClientX",
      String(telemetry.latestRenderedClientPosition?.x ?? ""),
    ],
    [
      "latestRenderedClientY",
      String(telemetry.latestRenderedClientPosition?.y ?? ""),
    ],
    ["latestDiscClientX", String(telemetry.latestDiscClientPosition?.x ?? "")],
    ["latestDiscClientY", String(telemetry.latestDiscClientPosition?.y ?? "")],
    [
      "latestSampleClientX",
      String(telemetry.latestSampleClientPosition?.x ?? ""),
    ],
    [
      "latestSampleClientY",
      String(telemetry.latestSampleClientPosition?.y ?? ""),
    ],
    [
      "latestRequestClientX",
      String(telemetry.latestRequestedClientPosition?.x ?? ""),
    ],
    [
      "latestRequestClientY",
      String(telemetry.latestRequestedClientPosition?.y ?? ""),
    ],
    [
      "latestRequestSampleClientX",
      String(telemetry.latestRequestedSampleClientPosition?.x ?? ""),
    ],
    [
      "latestRequestSampleClientY",
      String(telemetry.latestRequestedSampleClientPosition?.y ?? ""),
    ],
    ["tangentPlaneFailureCount", String(telemetry.tangentPlaneFailureCount)],
    [
      "latestTangentPlaneFailureReason",
      String(telemetry.latestTangentPlaneFailure?.reason ?? ""),
    ],
    [
      "latestTangentPlaneFailureInputVersion",
      String(telemetry.latestTangentPlaneFailure?.inputVersion ?? ""),
    ],
    [
      "latestTangentPlaneFailureRequestedAtMs",
      String(telemetry.latestTangentPlaneFailure?.requestedAtMs ?? ""),
    ],
    [
      "latestTangentPlaneFailureScreenX",
      String(telemetry.latestTangentPlaneFailure?.screenPosition?.x ?? ""),
    ],
    [
      "latestTangentPlaneFailureScreenY",
      String(telemetry.latestTangentPlaneFailure?.screenPosition?.y ?? ""),
    ],
    [
      "failureCount.missing-screen-position",
      String(telemetry.tangentPlaneFailureCounts["missing-screen-position"]),
    ],
    [
      "failureCount.missing-true-disc-point",
      String(telemetry.tangentPlaneFailureCounts["missing-true-disc-point"]),
    ],
    [
      "failureCount.missing-true-disc-normal",
      String(telemetry.tangentPlaneFailureCounts["missing-true-disc-normal"]),
    ],
    [
      "failureCount.true-sample-miss",
      String(telemetry.tangentPlaneFailureCounts["true-sample-miss"]),
    ],
    [
      "failureCount.true-normal-miss",
      String(telemetry.tangentPlaneFailureCounts["true-normal-miss"]),
    ],
    [
      "failureCount.reprojection-miss",
      String(telemetry.tangentPlaneFailureCounts["reprojection-miss"]),
    ],
    ["discOriginJumpCount", String(telemetry.discOriginJumpCount)],
    [
      "latestDiscOriginJumpSource",
      String(telemetry.latestDiscOriginJump?.source ?? ""),
    ],
    [
      "latestDiscOriginJumpInputVersion",
      String(telemetry.latestDiscOriginJump?.inputVersion ?? ""),
    ],
    [
      "latestDiscOriginJumpDistanceMeters",
      String(telemetry.latestDiscOriginJump?.distanceMeters ?? ""),
    ],
    [
      "latestDiscOriginJumpThresholdMeters",
      String(telemetry.latestDiscOriginJump?.thresholdMeters ?? ""),
    ],
    ["discScaleChangeCount", String(telemetry.discScaleChangeCount)],
    [
      "latestDiscScaleChangeSource",
      String(telemetry.latestDiscScaleChange?.source ?? ""),
    ],
    [
      "latestDiscScaleChangePreviousScaleFactor",
      String(telemetry.latestDiscScaleChange?.previousScaleFactor ?? ""),
    ],
    [
      "latestDiscScaleChangeNextScaleFactor",
      String(telemetry.latestDiscScaleChange?.nextScaleFactor ?? ""),
    ],
    [
      "latestDiscScaleChangeRelativeChange",
      String(telemetry.latestDiscScaleChange?.relativeChange ?? ""),
    ],
  ];
  const entryHeader = [
    "t",
    "mouseHz",
    "renderHz",
    "sampleHz",
    "discHz",
    "skipHz",
    "inputVersion",
    "processedVersion",
    "requestedAtMs",
    "renderedAtMs",
    "requestToDiscLatencyMs",
    "measuredLagSource",
    "measuredLagPx",
    "liveLagPx",
    "sampleOffsetPx",
    "clientX",
    "clientY",
    "renderedClientX",
    "renderedClientY",
    "discClientX",
    "discClientY",
    "sampleClientX",
    "sampleClientY",
    "requestClientX",
    "requestClientY",
    "requestSampleClientX",
    "requestSampleClientY",
  ];
  const entryRows = telemetry.entries.map((entry) => [
    String(entry.t),
    String(entry.mouseHz),
    String(entry.renderHz),
    String(entry.sampleHz),
    String(entry.discHz),
    String(entry.skipHz),
    String(entry.inputVersion),
    String(entry.processedVersion),
    String(entry.requestedAtMs),
    String(entry.renderedAtMs),
    String(entry.requestToDiscLatencyMs),
    String(entry.measuredLagSource),
    String(entry.measuredLagPx),
    String(entry.liveLagPx),
    String(entry.sampleOffsetPx),
    String(entry.clientX ?? ""),
    String(entry.clientY ?? ""),
    String(entry.renderedClientX ?? ""),
    String(entry.renderedClientY ?? ""),
    String(entry.discClientX ?? ""),
    String(entry.discClientY ?? ""),
    String(entry.sampleClientX ?? ""),
    String(entry.sampleClientY ?? ""),
    String(entry.requestClientX ?? ""),
    String(entry.requestClientY ?? ""),
    String(entry.requestSampleClientX ?? ""),
    String(entry.requestSampleClientY ?? ""),
  ]);
  const failureHeader = [
    "t",
    "inputVersion",
    "reason",
    "requestedAtMs",
    "placementMode",
    "clientX",
    "clientY",
    "screenX",
    "screenY",
    "hasLatestTrueDiscWorldPosition",
    "hasLatestDiscNormal",
    "hasSampledPoint",
    "hasSampledSurfaceNormal",
  ];
  const failureRows = telemetry.tangentPlaneFailures.map((failure) => [
    String(failure.t),
    String(failure.inputVersion),
    String(failure.reason),
    String(failure.requestedAtMs),
    String(failure.placementMode),
    String(failure.clientPosition?.x ?? ""),
    String(failure.clientPosition?.y ?? ""),
    String(failure.screenPosition?.x ?? ""),
    String(failure.screenPosition?.y ?? ""),
    String(failure.hasLatestTrueDiscWorldPosition),
    String(failure.hasLatestDiscNormal),
    String(failure.hasSampledPoint),
    String(failure.hasSampledSurfaceNormal),
  ]);
  const jumpHeader = [
    "t",
    "inputVersion",
    "source",
    "requestedAtMs",
    "distanceMeters",
    "thresholdMeters",
    "metersPerPixel",
    "previousClientX",
    "previousClientY",
    "nextClientX",
    "nextClientY",
  ];
  const jumpRows = telemetry.discOriginJumps.map((jump) => [
    String(jump.t),
    String(jump.inputVersion),
    String(jump.source),
    String(jump.requestedAtMs),
    String(jump.distanceMeters),
    String(jump.thresholdMeters),
    String(jump.metersPerPixel),
    String(jump.previousClientPosition?.x ?? ""),
    String(jump.previousClientPosition?.y ?? ""),
    String(jump.nextClientPosition.x),
    String(jump.nextClientPosition.y),
  ]);
  const scaleHeader = [
    "t",
    "inputVersion",
    "source",
    "requestedAtMs",
    "previousScaleFactor",
    "nextScaleFactor",
    "relativeChange",
    "thresholdRelativeChange",
  ];
  const scaleRows = telemetry.discScaleChanges.map((scaleChange) => [
    String(scaleChange.t),
    String(scaleChange.inputVersion),
    String(scaleChange.source),
    String(scaleChange.requestedAtMs),
    String(scaleChange.previousScaleFactor),
    String(scaleChange.nextScaleFactor),
    String(scaleChange.relativeChange),
    String(scaleChange.thresholdRelativeChange),
  ]);

  return [
    summaryRows,
    [entryHeader, ...entryRows],
    [failureHeader, ...failureRows],
    [jumpHeader, ...jumpRows],
    [scaleHeader, ...scaleRows],
  ]
    .map((sectionRows) => sectionRows.map((row) => row.join("\t")).join("\n"))
    .join("\n\n");
};

const CursorOverlaySamplerSandbox = ({
  queryEnabled,
  showCursor,
  showDisc,
  tangentDiscVisualizerEnabled,
  hideNativeCursor,
  discRadiusMeters,
  discScalingMode,
  discInnerHoleRadiusRatio,
  discTargetRadiusCssPx,
  discOpacity,
  discMaterialPreset,
  discColor,
  tangentDiscVisualizerPlacementMode,
  tangentDiscVisualizerTrailSampleCount = 90,
  tangentDiscVisualizerWeightDecayGamma = 2,
}: CursorOverlaySamplerStoryProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const comparisonRunningRef = useRef(false);
  const [runtimeHandle, setRuntimeHandle] =
    useState<CesiumRuntimeHandle | null>(null);
  const [comparisonSummary, setComparisonSummary] =
    useState<CursorOverlayComparisonSummary | null>(null);
  const [comparisonStatusText, setComparisonStatusText] = useState("cmp idle");
  const controllerRef = useRef<PointQueryPreviewController | null>(null);
  const tilesetStatusRef = useRef<HTMLSpanElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const mousePositionRateRef = useRef<HTMLSpanElement | null>(null);
  const renderRequestRateRef = useRef<HTMLSpanElement | null>(null);
  const sampleRateRef = useRef<HTMLSpanElement | null>(null);
  const discUpdateRateRef = useRef<HTMLSpanElement | null>(null);
  const skippedInputRateRef = useRef<HTMLSpanElement | null>(null);
  const lagReadoutRef = useRef<HTMLSpanElement | null>(null);
  const syncReadoutRef = useRef<HTMLSpanElement | null>(null);
  const requestTimingReadoutRef = useRef<HTMLSpanElement | null>(null);
  const tangentPlaneFailureReadoutRef = useRef<HTMLSpanElement | null>(null);
  const discOriginJumpReadoutRef = useRef<HTMLSpanElement | null>(null);
  const discScaleChangeReadoutRef = useRef<HTMLSpanElement | null>(null);
  const homeTarget = useMemo(
    () =>
      createStoryTargetState({
        fovVerticalDeg: 60,
      }),
    []
  );
  const orbitOptions = useMemo(
    () =>
      buildOrbitOptions({
        direction: NAVIGATION_ORBIT_DIRECTIONS.CW,
        revolutionDurationSec: DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
        minPitchDeg: 30,
      }),
    []
  );
  const zoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta: ZOOM_DELTA_PRESETS.ONE,
        animate: true,
        durationMs: 250,
        minimumFovDeg: DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
        maximumFovDeg: DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
      }),
    []
  );
  const fovZoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta: ZOOM_DELTA_PRESETS.ONE,
        animate: true,
        durationMs: 250,
        minimumFovDeg: DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
        maximumFovDeg: DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
      }),
    []
  );
  const dollyZoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta: ZOOM_DELTA_PRESETS.ONE,
        animate: true,
        durationMs: 2000,
        minimumFovDeg: DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
        maximumFovDeg: DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
      }),
    []
  );
  const buildControllerOptions = useCallback(
    (placementModeOverride?: PointQueryPreviewDiscPlacementMode) => {
      const resolvedTangentDiscVisualizerEnabled =
        tangentDiscVisualizerEnabled ?? showDisc ?? true;
      const resolvedTangentDiscVisualizerPlacementMode =
        placementModeOverride ??
        tangentDiscVisualizerPlacementMode ??
        POINT_QUERY_PREVIEW_DISC_PLACEMENT_MODES.TRUE_SAMPLE;

      return {
        queryEnabled,
        showCursor,
        showDisc: resolvedTangentDiscVisualizerEnabled,
        tangentDiscVisualizerEnabled: resolvedTangentDiscVisualizerEnabled,
        hideNativeCursor,
        discRadiusMeters,
        discScalingMode,
        innerHoleRadiusRatio: discInnerHoleRadiusRatio,
        targetScreenRadiusCssPx: discTargetRadiusCssPx,
        discOpacity,
        discMaterialPreset,
        discColor,
        tangentDiscVisualizerPlacementMode:
          resolvedTangentDiscVisualizerPlacementMode,
        tangentDiscVisualizerShowNormalLine,
        tangentDiscVisualizerTrailSampleCount,
        tangentDiscVisualizerWeightDecayGamma,
      };
    },
    [
      discColor,
      discInnerHoleRadiusRatio,
      discMaterialPreset,
      discOpacity,
      discRadiusMeters,
      discScalingMode,
      discTargetRadiusCssPx,
      hideNativeCursor,
      queryEnabled,
      showCursor,
      showDisc,
      tangentDiscVisualizerEnabled,
      tangentDiscVisualizerPlacementMode,
      tangentDiscVisualizerShowNormalLine,
      tangentDiscVisualizerTrailSampleCount,
      tangentDiscVisualizerWeightDecayGamma,
    ]
  );
  const handleCopyTelemetry = useCallback(async () => {
    const telemetry = controllerRef.current?.getTelemetrySnapshot();
    if (!telemetry) {
      return;
    }

    const text = serializeTelemetrySnapshotToTsv(telemetry);
    await navigator.clipboard.writeText(text);
  }, []);
  const handleCopyComparison = useCallback(async () => {
    if (!comparisonSummary) {
      return;
    }

    const text = serializeComparisonSummaryToTsv(comparisonSummary);
    await navigator.clipboard.writeText(text);
  }, [comparisonSummary]);
  const runAutomatedComparison = useCallback(async () => {
    const controller = controllerRef.current;
    const widget = runtimeHandle?.widget ?? widgetRef.current;
    if (
      !controller ||
      !widget ||
      widget.isDestroyed() ||
      comparisonRunningRef.current
    ) {
      return null;
    }

    const canvas = widget.scene.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) {
      return null;
    }

    const comparisonPath = buildAutomatedComparisonPath(canvasRect);
    const sleep = (delayMs: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs);
      });
    const dispatchPointerEvent = (
      type: string,
      point: { x: number; y: number }
    ) => {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          clientX: point.x,
          clientY: point.y,
        })
      );
    };
    const dispatchSyntheticPointerSample = (point: {
      x: number;
      y: number;
    }) => {
      if ("onpointerrawupdate" in window) {
        dispatchPointerEvent("pointerrawupdate", point);
      }
      dispatchPointerEvent("pointermove", point);
    };
    const runMode = async (
      mode: PointQueryPreviewDiscPlacementMode
    ): Promise<CursorOverlayComparisonRunSummary> => {
      controller.updateOptions(buildControllerOptions(mode));
      requestStoryCesiumRender(widget);
      await sleep(80);

      const startPoint = comparisonPath[0] ?? {
        x: canvasRect.left + canvasRect.width * 0.5,
        y: canvasRect.top + canvasRect.height * 0.5,
      };
      const startedAtMs = performance.now();

      dispatchSyntheticPointerSample(startPoint);
      await sleep(AUTOMATED_COMPARISON_POINT_INTERVAL_MS);

      for (const point of comparisonPath) {
        dispatchSyntheticPointerSample(point);
        await sleep(AUTOMATED_COMPARISON_POINT_INTERVAL_MS);
      }

      await sleep(AUTOMATED_COMPARISON_SETTLE_MS);
      const telemetry = controller.getTelemetrySnapshot();
      const endPoint = comparisonPath[comparisonPath.length - 1] ?? startPoint;

      dispatchPointerEvent("pointerleave", endPoint);
      await sleep(48);

      return summarizeTelemetryRun({
        telemetry,
        mode,
        startedAtMs,
      });
    };

    comparisonRunningRef.current = true;
    setComparisonSummary(null);
    setComparisonStatusText("cmp running");

    try {
      const trueSampleRun = await runMode(
        POINT_QUERY_PREVIEW_DISC_PLACEMENT_MODES.TRUE_SAMPLE
      );
      const reprojectRun = await runMode(
        POINT_QUERY_PREVIEW_DISC_PLACEMENT_MODES.CAMERA_PLANE_REPROJECT
      );
      const nextSummary: CursorOverlayComparisonSummary = {
        capturedAt: new Date().toISOString(),
        pathPointCount: comparisonPath.length,
        pointIntervalMs: AUTOMATED_COMPARISON_POINT_INTERVAL_MS,
        runs: [trueSampleRun, reprojectRun],
      };
      const trueLag = trueSampleRun.meanLagPx;
      const reprojectLag = reprojectRun.meanLagPx;
      const reprojectOffset = reprojectRun.meanSampleOffsetPx;
      const trueLatency = trueSampleRun.meanLatencyMs;
      const reprojectLatency = reprojectRun.meanLatencyMs;

      setComparisonSummary(nextSummary);
      setComparisonStatusText(
        `cmp lag ${trueLag.toFixed(1)}->${reprojectLag.toFixed(
          1
        )} px | drift ${reprojectOffset.toFixed(
          1
        )} px | sync ${trueLatency.toFixed(1)}->${reprojectLatency.toFixed(
          1
        )} ms`
      );

      return nextSummary;
    } finally {
      controller.updateOptions(buildControllerOptions());
      requestStoryCesiumRender(widget);
      comparisonRunningRef.current = false;
    }
  }, [buildControllerOptions, runtimeHandle]);
  const resolvedTangentDiscVisualizerEnabled =
    tangentDiscVisualizerEnabled ?? showDisc ?? true;
  const resolvedTangentDiscVisualizerPlacementMode =
    tangentDiscVisualizerPlacementMode ??
    POINT_QUERY_PREVIEW_DISC_PLACEMENT_MODES.TRUE_SAMPLE;
  const discPlacementStatusLabel = formatDiscPlacementModeLabel(
    resolvedTangentDiscVisualizerPlacementMode
  );
  const statusValues = [
    <span key="tileset-status" ref={tilesetStatusRef}>
      tileset loading
    </span>,
    `query ${queryEnabled ? "on" : "off"}`,
    `cursor ${showCursor ? "on" : "off"}`,
    `tangent-disc-visualizer ${
      resolvedTangentDiscVisualizerEnabled ? "on" : "off"
    }`,
    `place ${discPlacementStatusLabel}`,
    `scale ${discScalingMode}`,
    <span key="disc-hole-ratio" style={STATUS_NUMERIC_TEXT_STYLE}>
      {`hole ${formatFixedStatusNumber(discInnerHoleRadiusRatio, {
        minimumIntegerDigits: 1,
        fractionDigits: 2,
      })}`}
    </span>,
    discScalingMode === "screen" ? (
      <span key="disc-target-radius" style={STATUS_NUMERIC_TEXT_STYLE}>
        {`target ${formatFixedStatusNumber(discTargetRadiusCssPx, {
          minimumIntegerDigits: 3,
          fractionDigits: 0,
        })} px`}
      </span>
    ) : (
      <span key="disc-radius-meters" style={STATUS_NUMERIC_TEXT_STYLE}>
        {`radius ${formatFixedStatusNumber(discRadiusMeters, {
          minimumIntegerDigits: 2,
          fractionDigits: 2,
        })} m`}
      </span>
    ),
    `material ${discMaterialPreset}`,
    <span key="tangent-disc-trail" style={STATUS_NUMERIC_TEXT_STYLE}>
      {`trail ${formatFixedStatusNumber(tangentDiscVisualizerTrailSampleCount, {
        minimumIntegerDigits: 3,
        fractionDigits: 0,
      })}`}
    </span>,
    <span key="tangent-disc-gamma" style={STATUS_NUMERIC_TEXT_STYLE}>
      {`gamma ${formatFixedStatusNumber(tangentDiscVisualizerWeightDecayGamma, {
        minimumIntegerDigits: 1,
        fractionDigits: 2,
      })}`}
    </span>,
    <span key="readout" ref={readoutRef}>
      pointer idle
    </span>,
  ];
  const performanceStatusValues = [
    <button
      key="copy-telemetry"
      type="button"
      style={STATUS_ACTION_STYLE}
      onClick={() => {
        void handleCopyTelemetry();
      }}
    >
      Copy telemetry
    </button>,
    <button
      key="run-compare"
      type="button"
      style={STATUS_ACTION_STYLE}
      onClick={() => {
        void runAutomatedComparison();
      }}
    >
      Run compare
    </button>,
    <button
      key="copy-compare"
      type="button"
      style={STATUS_ACTION_STYLE}
      disabled={!comparisonSummary}
      onClick={() => {
        void handleCopyComparison();
      }}
    >
      Copy compare
    </button>,
    <span key="mouse-position-rate" ref={mousePositionRateRef}>
      {`mouse ${formatFixedStatusNumber(0, {
        minimumIntegerDigits: 3,
        fractionDigits: 1,
      })} Hz`}
    </span>,
    <span key="render-request-rate" ref={renderRequestRateRef}>
      {`render ${formatFixedStatusNumber(0, {
        minimumIntegerDigits: 3,
        fractionDigits: 1,
      })} Hz`}
    </span>,
    <span key="sample-rate" ref={sampleRateRef}>
      {`sample ${formatFixedStatusNumber(0, {
        minimumIntegerDigits: 3,
        fractionDigits: 1,
      })} Hz`}
    </span>,
    <span key="disc-update-rate" ref={discUpdateRateRef}>
      {`disc ${formatFixedStatusNumber(0, {
        minimumIntegerDigits: 3,
        fractionDigits: 1,
      })} Hz`}
    </span>,
    <span key="skipped-input-rate" ref={skippedInputRateRef}>
      {`skip ${formatFixedStatusNumber(0, {
        minimumIntegerDigits: 3,
        fractionDigits: 1,
      })} Hz`}
    </span>,
    <span key="lag-readout" ref={lagReadoutRef}>
      lag 0.0 px
    </span>,
    <span key="sync-readout" ref={syncReadoutRef}>
      sync 0.0 ms
    </span>,
    <span key="request-timing-readout" ref={requestTimingReadoutRef}>
      {"live 0.0 | off 0.0 px"}
    </span>,
    <span key="tangent-plane-trace" ref={tangentPlaneFailureReadoutRef}>
      trace ok
    </span>,
    <span key="disc-origin-jump-trace" ref={discOriginJumpReadoutRef}>
      jump ok
    </span>,
    <span key="disc-scale-change-trace" ref={discScaleChangeReadoutRef}>
      scale ok
    </span>,
    comparisonStatusText,
  ];

  useEffect(() => {
    if (!cesiumContainerRef.current) {
      return;
    }

    let disposed = false;

    const initialize = async () => {
      if (tilesetStatusRef.current) {
        tilesetStatusRef.current.textContent = "tileset loading";
      }
      if (readoutRef.current) {
        readoutRef.current.textContent = "pointer idle";
      }
      if (mousePositionRateRef.current) {
        mousePositionRateRef.current.textContent = `mouse ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (renderRequestRateRef.current) {
        renderRequestRateRef.current.textContent = `render ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (sampleRateRef.current) {
        sampleRateRef.current.textContent = `sample ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (discUpdateRateRef.current) {
        discUpdateRateRef.current.textContent = `disc ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (skippedInputRateRef.current) {
        skippedInputRateRef.current.textContent = `skip ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (lagReadoutRef.current) {
        lagReadoutRef.current.textContent = "lag 0.0 px";
      }
      if (syncReadoutRef.current) {
        syncReadoutRef.current.textContent = "sync 0.0 ms";
      }
      if (requestTimingReadoutRef.current) {
        requestTimingReadoutRef.current.textContent = "live 0.0 | off 0.0 px";
      }
      if (tangentPlaneFailureReadoutRef.current) {
        tangentPlaneFailureReadoutRef.current.textContent = "trace ok";
      }
      if (discOriginJumpReadoutRef.current) {
        discOriginJumpReadoutRef.current.textContent = "jump ok";
      }
      if (discScaleChangeReadoutRef.current) {
        discScaleChangeReadoutRef.current.textContent = "scale ok";
      }

      const result = await setupCesium(
        cesiumContainerRef.current as HTMLDivElement,
        {
          useBrowserRecommendedResolution: false,
          loadTileset: true,
        }
      );

      if (disposed) {
        if (!result.widget.isDestroyed()) {
          result.widget.destroy();
        }
        return;
      }

      widgetRef.current = result.widget;
      if (result.terrainProviders.TERRAIN) {
        result.widget.scene.terrainProvider = result.terrainProviders.TERRAIN;
      }
      applyViewStateToCesiumWidget({
        widget: result.widget,
        state: homeTarget,
      });
      requestStoryCesiumRender(result.widget);
      setRuntimeHandle({
        engine: CARMA_STORY_MAPPING_ENGINES.CESIUM,
        widget: result.widget,
        container: cesiumContainerRef.current as HTMLDivElement,
        terrainProviders: result.terrainProviders,
        viewSync: null,
      });
      if (tilesetStatusRef.current) {
        tilesetStatusRef.current.textContent = result.tileset
          ? "tileset ready"
          : "tileset missing";
      }
      controllerRef.current = createPointQueryPreviewController({
        scene: result.widget.scene,
        readoutElement: readoutRef.current,
        mousePositionRateElement: mousePositionRateRef.current,
        renderRequestRateElement: renderRequestRateRef.current,
        sampleRateElement: sampleRateRef.current,
        discUpdateRateElement: discUpdateRateRef.current,
        skippedInputRateElement: skippedInputRateRef.current,
        lagReadoutElement: lagReadoutRef.current,
        syncReadoutElement: syncReadoutRef.current,
        requestTimingReadoutElement: requestTimingReadoutRef.current,
        tangentPlaneFailureReadoutElement:
          tangentPlaneFailureReadoutRef.current,
        discOriginJumpReadoutElement: discOriginJumpReadoutRef.current,
        discScaleChangeReadoutElement: discScaleChangeReadoutRef.current,
        options: buildControllerOptions(),
      });
      result.widget.scene.requestRender();
    };

    void initialize();

    return () => {
      disposed = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
      setRuntimeHandle(null);
      if (tilesetStatusRef.current) {
        tilesetStatusRef.current.textContent = "tileset loading";
      }
      if (readoutRef.current) {
        readoutRef.current.textContent = "pointer idle";
      }
      if (mousePositionRateRef.current) {
        mousePositionRateRef.current.textContent = `mouse ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (renderRequestRateRef.current) {
        renderRequestRateRef.current.textContent = `render ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (sampleRateRef.current) {
        sampleRateRef.current.textContent = `sample ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (discUpdateRateRef.current) {
        discUpdateRateRef.current.textContent = `disc ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (skippedInputRateRef.current) {
        skippedInputRateRef.current.textContent = `skip ${formatFixedStatusNumber(
          0,
          {
            minimumIntegerDigits: 3,
            fractionDigits: 1,
          }
        )} Hz`;
      }
      if (lagReadoutRef.current) {
        lagReadoutRef.current.textContent = "lag 0.0 px";
      }
      if (syncReadoutRef.current) {
        syncReadoutRef.current.textContent = "sync 0.0 ms";
      }
      if (requestTimingReadoutRef.current) {
        requestTimingReadoutRef.current.textContent = "live 0.0 | off 0.0 px";
      }
      if (tangentPlaneFailureReadoutRef.current) {
        tangentPlaneFailureReadoutRef.current.textContent = "trace ok";
      }
      if (discOriginJumpReadoutRef.current) {
        discOriginJumpReadoutRef.current.textContent = "jump ok";
      }
      if (discScaleChangeReadoutRef.current) {
        discScaleChangeReadoutRef.current.textContent = "scale ok";
      }

      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, [buildControllerOptions, homeTarget]);

  useEffect(() => {
    controllerRef.current?.updateOptions(buildControllerOptions());
  }, [buildControllerOptions]);

  useEffect(() => {
    const api = {
      runModeComparison: () => runAutomatedComparison(),
      getLastComparison: () => comparisonSummary,
      getTelemetrySnapshot: () =>
        controllerRef.current?.getTelemetrySnapshot() ?? null,
    };
    const globalWindow = window as Window & {
      __CARMA_CURSOR_OVERLAY_SAMPLER__?: typeof api;
    };

    globalWindow.__CARMA_CURSOR_OVERLAY_SAMPLER__ = api;

    return () => {
      if (globalWindow.__CARMA_CURSOR_OVERLAY_SAMPLER__ === api) {
        delete globalWindow.__CARMA_CURSOR_OVERLAY_SAMPLER__;
      }
    };
  }, [comparisonSummary, runAutomatedComparison]);

  useContainerResize(cesiumContainerRef, () => {
    if (!runtimeHandle?.widget || runtimeHandle.widget.isDestroyed()) {
      return;
    }

    runtimeHandle.widget.resize();
    requestStoryCesiumRender(runtimeHandle.widget);
  });

  return (
    <div
      ref={rootRef}
      data-annotation-cursor-root="true"
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div
        ref={cesiumContainerRef}
        style={{ position: "absolute", inset: 0 }}
      />
      <div style={TOP_STATUS_BAR_OVERLAY_STYLE}>
        <ResponsiveStatusBar
          label="cursor overlay sampler"
          values={statusValues}
          tone="dark"
        />
      </div>
      <div style={BOTTOM_STATUS_BAR_OVERLAY_STYLE}>
        <ResponsiveStatusBar
          label="performance"
          values={performanceStatusValues}
          tone="dark"
        />
      </div>
      <ViewSyncRuntimeNavigationControls
        controlId="cursor-overlay-sampler"
        engine={CARMA_STORY_MAPPING_ENGINES.CESIUM}
        runtimeHandle={runtimeHandle}
        homeTarget={homeTarget}
        showOrbitControl
        controlStyle={{
          top: NAVIGATION_CONTROLS_TOP_OFFSET_PX,
        }}
        orbitOptions={orbitOptions}
        showFovZoomControl
        showDollyZoomControl
        zoomOptions={zoomOptions}
        fovZoomOptions={fovZoomOptions}
        dollyZoomOptions={dollyZoomOptions}
      />
    </div>
  );
};

const meta: Meta<CursorOverlaySamplerStoryProps> = {
  title: "Annotations/Cursor Overlay",
  component: CursorOverlaySamplerSandbox,
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
  },
  argTypes: {
    queryEnabled: {
      control: { type: "boolean" },
      table: { category: "Query" },
    },
    hideNativeCursor: {
      control: { type: "boolean" },
      table: { category: "Query" },
    },
    showCursor: {
      control: { type: "boolean" },
      table: { category: "Cursor" },
    },
    showDisc: {
      table: { disable: true },
    },
    tangentDiscVisualizerEnabled: {
      control: { type: "boolean" },
      name: "tangentDiscVisualizerEnabled",
      table: { category: "Tangent Disc Visualizer" },
    },
    discRadiusMeters: {
      control: { type: "range", min: 0.25, max: 10, step: 0.25 },
      table: { category: "Disc" },
    },
    discScalingMode: {
      control: { type: "inline-radio" },
      options: ["screen", "world"],
      table: { category: "Disc" },
    },
    discInnerHoleRadiusRatio: {
      control: { type: "range", min: 0, max: 0.95, step: 0.01 },
      table: { category: "Disc" },
    },
    discTargetRadiusCssPx: {
      control: { type: "range", min: 8, max: 120, step: 1 },
      table: { category: "Disc" },
    },
    discOpacity: {
      control: { type: "range", min: 0.05, max: 1, step: 0.01 },
      table: { category: "Disc" },
    },
    discMaterialPreset: {
      control: { type: "select" },
      options: [
        RING_MATERIAL_PRESETS.COLOR,
        RING_MATERIAL_PRESETS.CHROME_MIRROR,
        RING_MATERIAL_PRESETS.FROSTED_GLASS,
      ],
      table: { category: "Disc" },
    },
    discColor: {
      control: { type: "color" },
      table: { category: "Disc" },
    },
    tangentDiscVisualizerPlacementMode: {
      control: { type: "inline-radio" },
      options: [
        POINT_QUERY_PREVIEW_DISC_PLACEMENT_MODES.TRUE_SAMPLE,
        POINT_QUERY_PREVIEW_DISC_PLACEMENT_MODES.CAMERA_PLANE_REPROJECT,
      ],
      name: "tangentDiscVisualizerPlacementMode",
      table: { category: "Tangent Disc Visualizer" },
    },
    tangentDiscVisualizerShowNormalLine: {
      control: { type: "boolean" },
      table: { category: "Tangent Disc Visualizer" },
    },
    tangentDiscVisualizerTrailSampleCount: {
      control: { type: "range", min: 1, max: 180, step: 1 },
      table: { category: "Tangent Disc Visualizer" },
    },
    tangentDiscVisualizerWeightDecayGamma: {
      control: { type: "range", min: 0.25, max: 4, step: 0.05 },
      table: { category: "Tangent Disc Visualizer" },
    },
  },
};

export default meta;

export const CursorOverlaySampler: StoryObj<CursorOverlaySamplerStoryProps> = {
  name: "Disc Sampler",
  args: {
    queryEnabled: true,
    hideNativeCursor: true,
    showCursor: true,
    tangentDiscVisualizerEnabled: true,
    discRadiusMeters: 1,
    discScalingMode: "screen",
    discInnerHoleRadiusRatio: 0.5,
    discTargetRadiusCssPx: 48,
    discOpacity: 0.66,
    discMaterialPreset: RING_MATERIAL_PRESETS.COLOR,
    discColor: "#ffffff",
    tangentDiscVisualizerPlacementMode:
      POINT_QUERY_PREVIEW_DISC_PLACEMENT_MODES.CAMERA_PLANE_REPROJECT,
    tangentDiscVisualizerShowNormalLine: true,
    tangentDiscVisualizerTrailSampleCount: 90,
    tangentDiscVisualizerWeightDecayGamma: 2,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText("cursor overlay sampler")
    ).toBeInTheDocument();
    await expect(canvas.getByText("Copy telemetry")).toBeInTheDocument();
    await expect(
      canvas.getByText(/place camera-plane-reproject/)
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/tangent-disc-visualizer on/)
    ).toBeInTheDocument();
    await expect(canvas.getByText(/lag 0\.0 px/)).toBeInTheDocument();
    await expect(canvas.getByText(/sync 0\.0 ms/)).toBeInTheDocument();
    await expect(
      canvas.getByText(/live 0\.0 \| off 0\.0 px/)
    ).toBeInTheDocument();
    await expect(canvas.getByText(/trace ok/)).toBeInTheDocument();
    await expect(canvas.getByText(/jump ok/)).toBeInTheDocument();
    await expect(canvas.getByText(/scale ok/)).toBeInTheDocument();
  },
};
