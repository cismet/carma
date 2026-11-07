import { type Vector3 } from "three";
import type {
  AnnotationEngine,
  AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";
import {
  isPointQueryDiscPlaneOffsetPlacementMode,
  type PointQueryDiscPlacementMode,
} from "../point-query-disc-placement-mode";
import {
  POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS,
  type PointQueryDiscOriginJump,
  type PointQueryDiscScaleChange,
  type PointQueryTangentPlaneFailure,
  type PointQueryTelemetryEntry,
} from "./point-query-controller.types";
import { pointQueryDebugDefaults } from "./point-query-debug-defaults";
import {
  buildFailedPickLogSignature,
  cloneScreenVector,
  createInitialTangentPlaneFailureCounts,
  pushCapped,
  type ObservedClientPosition,
} from "./point-query-debug-history";
import {
  formatDiscOriginJumpReadout,
  formatDiscScaleChangeReadout,
  formatLagReadouts,
  formatTangentPlaneFailureReadout,
  readHasDebugSinks,
  resetPointQueryDebugStatusElements,
  setStatusText,
  type PointQueryDebugLagMetrics,
  type PointQueryDebugStatusElements,
} from "./point-query-debug-status";
import {
  detectDiscOriginJump,
  detectDiscScaleChange,
} from "./point-query-disc-change-detection";
import { createPointQueryLagDebugOverlay } from "./point-query-lag-debug-overlay";
import { createPointQueryRateMeter } from "./point-query-rate-meter";
import {
  type ClientPositions,
  recordPointQueryDebugTelemetry,
  createPointQueryDebugTelemetrySnapshot,
} from "./point-query-debug-telemetry";

type DiscChangeSource = PointQueryDiscOriginJump["source"];

const isPositiveFinite = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value > 0;

export const createPointQueryDebugRuntime = ({
  engine,
  statusElements,
  onTangentPlaneFailure,
  enabled = false,
}: {
  engine: AnnotationEngine;
  statusElements: PointQueryDebugStatusElements;
  onTangentPlaneFailure?: (failure: PointQueryTangentPlaneFailure) => void;
  enabled?: boolean;
}) => {
  const lagDebugOverlay = createPointQueryLagDebugOverlay();
  const hasDebugSinks = readHasDebugSinks(
    statusElements,
    onTangentPlaneFailure
  );
  const rateMeter = createPointQueryRateMeter(statusElements);
  let debugEnabled = false;
  let rateReportIntervalId: number | null = null;
  const lag: PointQueryDebugLagMetrics = {
    latestMeasuredLagSource: "none",
    latestMeasuredLagPx: 0,
    latestLiveLagPx: 0,
    latestSampleOffsetPx: 0,
    latestRequestToDiscLatencyMs: 0,
  };
  const telemetryEntries: PointQueryTelemetryEntry[] = [];
  const tangentPlaneFailures: PointQueryTangentPlaneFailure[] = [];
  const tangentPlaneFailureCounts = createInitialTangentPlaneFailureCounts();
  const recordedTangentPlaneFailureKeys = new Set<string>();
  let tangentPlaneFailureCount = 0;
  let latestTangentPlaneFailure: PointQueryTangentPlaneFailure | null = null;
  const discOriginJumps: PointQueryDiscOriginJump[] = [];
  let discOriginJumpCount = 0;
  let latestDiscOriginJump: PointQueryDiscOriginJump | null = null;
  const discScaleChanges: PointQueryDiscScaleChange[] = [];
  let discScaleChangeCount = 0;
  let latestDiscScaleChange: PointQueryDiscScaleChange | null = null;
  let latestDiscScaleFactor: number | null = null;
  let lastFailedPickLogSignature: string | null = null;
  let lastFailedPickLogTimeMs = 0;

  const updateTangentPlaneFailureReadout = () =>
    setStatusText(
      statusElements.tangentPlaneFailureReadoutElement,
      formatTangentPlaneFailureReadout(
        latestTangentPlaneFailure,
        tangentPlaneFailureCount
      )
    );

  const updateDiscOriginJumpReadout = () =>
    setStatusText(
      statusElements.discOriginJumpReadoutElement,
      formatDiscOriginJumpReadout(latestDiscOriginJump, discOriginJumpCount)
    );

  const updateDiscScaleChangeReadout = () =>
    setStatusText(
      statusElements.discScaleChangeReadoutElement,
      formatDiscScaleChangeReadout(latestDiscScaleChange, discScaleChangeCount)
    );

  const updateLagReadouts = () => {
    const readouts = formatLagReadouts(lag);
    setStatusText(statusElements.lagReadoutElement, readouts.lag);
    setStatusText(statusElements.syncReadoutElement, readouts.sync);
    setStatusText(
      statusElements.requestTimingReadoutElement,
      readouts.requestTiming
    );
  };

  const maybeLogFailedPick = (failure: PointQueryTangentPlaneFailure) => {
    if (
      failure.reason !==
      POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_SAMPLE_MISS
    ) {
      return;
    }

    const signature = buildFailedPickLogSignature(failure);
    if (
      lastFailedPickLogSignature === signature &&
      failure.t - lastFailedPickLogTimeMs <
        pointQueryDebugDefaults.failedPickLog.throttleMs
    ) {
      return;
    }

    lastFailedPickLogSignature = signature;
    lastFailedPickLogTimeMs = failure.t;

    console.warn("[PointQuery] preferred pick miss", {
      inputVersion: failure.inputVersion,
      requestedAtMs: failure.requestedAtMs,
      placementMode: failure.placementMode,
      clientPosition: failure.clientPosition,
      screenPosition: failure.screenPosition,
      hasLatestTrueDiscWorldPosition: failure.hasLatestTrueDiscWorldPosition,
      hasLatestDiscNormal: failure.hasLatestDiscNormal,
      hasSampledPoint: failure.hasSampledPoint,
      hasSampledSurfaceNormal: failure.hasSampledSurfaceNormal,
    });
  };

  const updateLagDebugOverlay = (
    latestObservedClientPosition: ObservedClientPosition | null,
    {
      latestRenderedClientPosition,
      latestDiscClientPosition,
      latestSampleClientPosition,
    }: ClientPositions
  ) => {
    if (!debugEnabled) {
      lagDebugOverlay.hide();
      return;
    }

    lagDebugOverlay.update(lag, {
      rawClientPosition: latestObservedClientPosition
        ? {
            x: latestObservedClientPosition.x,
            y: latestObservedClientPosition.y,
          }
        : null,
      renderedClientPosition: latestRenderedClientPosition,
      discClientPosition: latestDiscClientPosition,
      sampleClientPosition: latestSampleClientPosition,
    });
  };

  const resetLag = () => {
    lag.latestMeasuredLagSource = "none";
    lag.latestMeasuredLagPx = 0;
    lag.latestLiveLagPx = 0;
    lag.latestSampleOffsetPx = 0;
    lag.latestRequestToDiscLatencyMs = 0;
  };

  const resetDebugState = () => {
    rateMeter.reset();
    resetLag();
    telemetryEntries.length = 0;
    tangentPlaneFailures.length = 0;
    discOriginJumps.length = 0;
    discScaleChanges.length = 0;
    Object.assign(
      tangentPlaneFailureCounts,
      createInitialTangentPlaneFailureCounts()
    );
    recordedTangentPlaneFailureKeys.clear();
    tangentPlaneFailureCount = 0;
    latestTangentPlaneFailure = null;
    discOriginJumpCount = 0;
    latestDiscOriginJump = null;
    discScaleChangeCount = 0;
    latestDiscScaleChange = null;
    latestDiscScaleFactor = null;
    lastFailedPickLogSignature = null;
    lastFailedPickLogTimeMs = 0;
    resetPointQueryDebugStatusElements(statusElements);
    lagDebugOverlay.hide();
  };

  const setEnabled = (nextEnabled: boolean) => {
    debugEnabled = nextEnabled;
    if (debugEnabled) {
      rateReportIntervalId ??= window.setInterval(
        () => rateMeter.update(),
        pointQueryDebugDefaults.performance.reportIntervalMs
      );
      return;
    }
    if (rateReportIntervalId !== null) {
      window.clearInterval(rateReportIntervalId);
      rateReportIntervalId = null;
    }
    resetDebugState();
  };
  setEnabled(enabled);

  return {
    hasDebugSinks: () => hasDebugSinks,
    setEnabled,
    resetStatusElements: () => {
      resetPointQueryDebugStatusElements(statusElements);
      updateTangentPlaneFailureReadout();
      updateDiscOriginJumpReadout();
      updateDiscScaleChangeReadout();
      rateMeter.update(true);
    },
    markMousePositionEvent: () => debugEnabled && rateMeter.mark("mouse"),
    markRenderRequestEvent: () => debugEnabled && rateMeter.mark("render"),
    markSampleEvent: () => debugEnabled && rateMeter.mark("sample"),
    markDiscUpdateEvent: () => debugEnabled && rateMeter.mark("disc"),
    markSkippedInputEvents: (count: number) =>
      debugEnabled && count > 0 && rateMeter.mark("skip", count),
    updateRequestToDiscLatencyMs: (value: number) => {
      lag.latestRequestToDiscLatencyMs = value;
      if (debugEnabled) {
        updateLagReadouts();
      }
    },
    syncLagState: ({
      placementMode,
      latestObservedClientPosition,
      ...clientPositions
    }: {
      placementMode: PointQueryDiscPlacementMode;
      latestObservedClientPosition: ObservedClientPosition | null;
    } & ClientPositions) => {
      const liveLagReference =
        clientPositions.latestDiscClientPosition ??
        clientPositions.latestRenderedClientPosition;
      lag.latestLiveLagPx =
        latestObservedClientPosition && liveLagReference
          ? Math.hypot(
              latestObservedClientPosition.x - liveLagReference.x,
              latestObservedClientPosition.y - liveLagReference.y
            )
          : 0;
      lag.latestSampleOffsetPx =
        clientPositions.latestSampleClientPosition &&
        clientPositions.latestDiscClientPosition
          ? Math.hypot(
              clientPositions.latestSampleClientPosition.x -
                clientPositions.latestDiscClientPosition.x,
              clientPositions.latestSampleClientPosition.y -
                clientPositions.latestDiscClientPosition.y
            )
          : 0;

      if (
        isPointQueryDiscPlaneOffsetPlacementMode(placementMode) &&
        lag.latestSampleOffsetPx >= lag.latestLiveLagPx &&
        lag.latestSampleOffsetPx > 0
      ) {
        lag.latestMeasuredLagPx = lag.latestSampleOffsetPx;
        lag.latestMeasuredLagSource = "offset";
      } else if (lag.latestLiveLagPx > 0) {
        lag.latestMeasuredLagPx = lag.latestLiveLagPx;
        lag.latestMeasuredLagSource = "live";
      } else if (lag.latestSampleOffsetPx > 0) {
        lag.latestMeasuredLagPx = lag.latestSampleOffsetPx;
        lag.latestMeasuredLagSource = "offset";
      } else {
        lag.latestMeasuredLagPx = 0;
        lag.latestMeasuredLagSource = "none";
      }

      if (!debugEnabled) {
        lagDebugOverlay.hide();
        return;
      }

      updateLagReadouts();
      updateLagDebugOverlay(latestObservedClientPosition, clientPositions);
    },
    clearPointerState: () => {
      resetLag();
      lagDebugOverlay.hide();
      if (debugEnabled) {
        updateLagReadouts();
      }
    },
    recordTelemetryEntry: (
      input: Parameters<typeof recordPointQueryDebugTelemetry>[0]
    ) =>
      recordPointQueryDebugTelemetry(input, {
        debugEnabled,
        rateMeter,
        lag,
        telemetryEntries,
      }),
    recordTangentPlaneFailure: ({
      inputVersion,
      reason,
      requestedAtMs,
      placementMode,
      clientPosition,
      screenPosition,
      hasLatestTrueDiscWorldPosition,
      hasLatestDiscNormal,
      hasSampledPoint,
      hasSampledSurfaceNormal,
    }: Omit<PointQueryTangentPlaneFailure, "t">) => {
      if (!debugEnabled) {
        return;
      }

      const dedupeKey = [
        inputVersion,
        reason,
        screenPosition ? Math.round(screenPosition.x) : "none",
        screenPosition ? Math.round(screenPosition.y) : "none",
      ].join(":");
      if (recordedTangentPlaneFailureKeys.has(dedupeKey)) {
        return;
      }

      recordedTangentPlaneFailureKeys.add(dedupeKey);
      if (recordedTangentPlaneFailureKeys.size > 1024) {
        recordedTangentPlaneFailureKeys.clear();
        recordedTangentPlaneFailureKeys.add(dedupeKey);
      }

      const failure: PointQueryTangentPlaneFailure = {
        t: performance.now(),
        inputVersion,
        reason,
        requestedAtMs,
        placementMode,
        clientPosition: cloneScreenVector(clientPosition),
        screenPosition: cloneScreenVector(screenPosition),
        hasLatestTrueDiscWorldPosition,
        hasLatestDiscNormal,
        hasSampledPoint,
        hasSampledSurfaceNormal,
      };

      latestTangentPlaneFailure = failure;
      tangentPlaneFailureCount += 1;
      tangentPlaneFailureCounts[reason] += 1;
      pushCapped(
        tangentPlaneFailures,
        failure,
        pointQueryDebugDefaults.history.maxTangentPlaneFailureCount
      );
      maybeLogFailedPick(failure);
      updateTangentPlaneFailureReadout();
      onTangentPlaneFailure?.(failure);
    },
    recordDiscOriginJump: ({
      inputVersion,
      requestedAtMs,
      placementMode,
      source,
      previousDiscWorldPosition,
      nextDiscWorldPosition,
      nextDiscNormal,
      previousClientPosition,
      nextClientPosition,
    }: {
      inputVersion: number;
      requestedAtMs: number;
      placementMode: PointQueryDiscPlacementMode;
      source: DiscChangeSource;
      previousDiscWorldPosition: Vector3 | null;
      nextDiscWorldPosition: Vector3;
      nextDiscNormal: Vector3;
      previousClientPosition: AnnotationScreenPosition | null;
      nextClientPosition: AnnotationScreenPosition | null;
    }) => {
      if (!debugEnabled || !previousDiscWorldPosition) {
        return;
      }

      const jump = detectDiscOriginJump({
        engine,
        inputVersion,
        requestedAtMs,
        placementMode,
        source,
        previousDiscWorldPosition,
        nextDiscWorldPosition,
        nextDiscNormal,
        previousClientPosition,
        nextClientPosition,
      });
      if (!jump) {
        return;
      }

      latestDiscOriginJump = jump;
      discOriginJumpCount += 1;
      pushCapped(
        discOriginJumps,
        jump,
        pointQueryDebugDefaults.history.maxDiscOriginJumpCount
      );
      updateDiscOriginJumpReadout();
    },
    recordDiscScaleChange: ({
      inputVersion,
      requestedAtMs,
      placementMode,
      source,
      nextScaleFactor,
    }: {
      inputVersion: number;
      requestedAtMs: number;
      placementMode: PointQueryDiscPlacementMode;
      source: DiscChangeSource;
      nextScaleFactor: number;
    }) => {
      const previousScaleFactor = latestDiscScaleFactor;
      latestDiscScaleFactor = nextScaleFactor;
      if (
        !debugEnabled ||
        !isPositiveFinite(previousScaleFactor) ||
        !isPositiveFinite(nextScaleFactor)
      ) {
        return;
      }

      const scaleChange = detectDiscScaleChange({
        inputVersion,
        requestedAtMs,
        placementMode,
        source,
        previousScaleFactor,
        nextScaleFactor,
      });
      if (!scaleChange) {
        return;
      }

      latestDiscScaleChange = scaleChange;
      discScaleChangeCount += 1;
      pushCapped(
        discScaleChanges,
        scaleChange,
        pointQueryDebugDefaults.history.maxDiscScaleChangeCount
      );
      updateDiscScaleChangeReadout();
    },
    setLatestDiscScaleFactor: (value: number | null) => {
      latestDiscScaleFactor = value;
    },
    readLatestSampleOffsetPx: () => lag.latestSampleOffsetPx,
    getTelemetrySnapshot: (
      input: Parameters<typeof createPointQueryDebugTelemetrySnapshot>[0]
    ) =>
      createPointQueryDebugTelemetrySnapshot(input, {
        rateMeter,
        lag,
        tangentPlaneFailureCount,
        tangentPlaneFailureCounts,
        latestTangentPlaneFailure,
        discOriginJumpCount,
        latestDiscOriginJump,
        discScaleChangeCount,
        latestDiscScaleChange,
        telemetryEntries,
        tangentPlaneFailures,
        discOriginJumps,
        discScaleChanges,
      }),
    destroy: () => {
      setEnabled(false);
      lagDebugOverlay.destroy();
      resetPointQueryDebugStatusElements(statusElements);
    },
  };
};
