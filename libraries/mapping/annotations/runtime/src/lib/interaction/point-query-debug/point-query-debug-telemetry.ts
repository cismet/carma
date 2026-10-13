import type { AnnotationScreenPosition } from "@carma-mapping/annotations/core";
import {
  type PointQueryControllerTelemetrySnapshot,
  type PointQueryDiscOriginJump,
  type PointQueryDiscScaleChange,
  type PointQueryTangentPlaneFailure,
  type PointQueryTangentPlaneFailureReason,
  type PointQueryTelemetryEntry,
} from "./point-query-controller.types";
import { pointQueryDebugDefaults } from "./point-query-debug-defaults";
import {
  cloneDiscOriginJump,
  cloneScreenVector,
  cloneTangentPlaneFailure,
  pushCapped,
  type ObservedClientPosition,
} from "./point-query-debug-history";
import { type PointQueryDebugLagMetrics } from "./point-query-debug-status";
import { createPointQueryRateMeter } from "./point-query-rate-meter";

export type ClientPositions = {
  latestRenderedClientPosition: AnnotationScreenPosition | null;
  latestDiscClientPosition: AnnotationScreenPosition | null;
  latestSampleClientPosition: AnnotationScreenPosition | null;
};

export type RequestPositions = {
  latestRequestedClientPosition: AnnotationScreenPosition | null;
  latestRequestedSampleClientPosition: AnnotationScreenPosition | null;
};

export type InputVersions = {
  latestInputVersion: number;
  lastProcessedInputVersion: number;
  latestRequestedAtMs: number;
  latestRenderedAtMs: number;
};

export const recordPointQueryDebugTelemetry = (
  {
    latestClientPosition,
    latestRenderedClientPosition,
    latestDiscClientPosition,
    latestSampleClientPosition,
    latestRequestedClientPosition,
    latestRequestedSampleClientPosition,
    latestInputVersion,
    lastProcessedInputVersion,
    latestRequestedAtMs,
    latestRenderedAtMs,
  }: InputVersions &
    ClientPositions &
    RequestPositions & {
      latestClientPosition: ObservedClientPosition | null;
    },
  {
    debugEnabled,
    rateMeter,
    lag,
    telemetryEntries,
  }: {
    debugEnabled: boolean;
    rateMeter: ReturnType<typeof createPointQueryRateMeter>;
    lag: PointQueryDebugLagMetrics;
    telemetryEntries: PointQueryTelemetryEntry[];
  }
) => {
  if (!debugEnabled) {
    return;
  }

  const ratesHz = rateMeter.getRatesHz();
  pushCapped(
    telemetryEntries,
    {
      t: performance.now(),
      mouseHz: ratesHz.mouse,
      renderHz: ratesHz.render,
      sampleHz: ratesHz.sample,
      discHz: ratesHz.disc,
      skipHz: ratesHz.skip,
      inputVersion: latestInputVersion,
      processedVersion: lastProcessedInputVersion,
      requestedAtMs: latestRequestedAtMs,
      renderedAtMs: latestRenderedAtMs,
      requestToDiscLatencyMs: lag.latestRequestToDiscLatencyMs,
      measuredLagSource: lag.latestMeasuredLagSource,
      measuredLagPx: lag.latestMeasuredLagPx,
      liveLagPx: lag.latestLiveLagPx,
      sampleOffsetPx: lag.latestSampleOffsetPx,
      clientX: latestClientPosition?.x ?? null,
      clientY: latestClientPosition?.y ?? null,
      renderedClientX: latestRenderedClientPosition?.x ?? null,
      renderedClientY: latestRenderedClientPosition?.y ?? null,
      discClientX: latestDiscClientPosition?.x ?? null,
      discClientY: latestDiscClientPosition?.y ?? null,
      sampleClientX: latestSampleClientPosition?.x ?? null,
      sampleClientY: latestSampleClientPosition?.y ?? null,
      requestClientX: latestRequestedClientPosition?.x ?? null,
      requestClientY: latestRequestedClientPosition?.y ?? null,
      requestSampleClientX: latestRequestedSampleClientPosition?.x ?? null,
      requestSampleClientY: latestRequestedSampleClientPosition?.y ?? null,
    },
    pointQueryDebugDefaults.history.maxTelemetryEntryCount
  );
};

export const createPointQueryDebugTelemetrySnapshot = (
  {
    maxRenderRequestRateHz,
    latestRequestToDiscLatencyMs,
    latestClientPosition,
    latestInputVersion,
    lastProcessedInputVersion,
    latestRequestedAtMs,
    latestRenderedAtMs,
    latestRenderedClientPosition,
    latestDiscClientPosition,
    latestSampleClientPosition,
    latestRequestedClientPosition,
    latestRequestedSampleClientPosition,
  }: InputVersions &
    ClientPositions &
    RequestPositions & {
      maxRenderRequestRateHz: number;
      latestRequestToDiscLatencyMs: number;
      latestClientPosition: AnnotationScreenPosition | null;
    },
  {
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
  }: {
    rateMeter: ReturnType<typeof createPointQueryRateMeter>;
    lag: PointQueryDebugLagMetrics;
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
    telemetryEntries: PointQueryTelemetryEntry[];
    tangentPlaneFailures: PointQueryTangentPlaneFailure[];
    discOriginJumps: PointQueryDiscOriginJump[];
    discScaleChanges: PointQueryDiscScaleChange[];
  }
): PointQueryControllerTelemetrySnapshot => ({
  capturedAt: new Date().toISOString(),
  maxRenderRequestRateHz,
  latestRatesHz: rateMeter.getRatesHz(),
  latestInputVersion,
  lastProcessedInputVersion,
  latestRequestedAtMs,
  latestRenderedAtMs,
  latestRequestToDiscLatencyMs,
  latestMeasuredLagSource: lag.latestMeasuredLagSource,
  latestMeasuredLagPx: lag.latestMeasuredLagPx,
  latestLiveLagPx: lag.latestLiveLagPx,
  latestSampleOffsetPx: lag.latestSampleOffsetPx,
  latestClientPosition: cloneScreenVector(latestClientPosition),
  latestRenderedClientPosition: cloneScreenVector(latestRenderedClientPosition),
  latestDiscClientPosition: cloneScreenVector(latestDiscClientPosition),
  latestSampleClientPosition: cloneScreenVector(latestSampleClientPosition),
  latestRequestedClientPosition: cloneScreenVector(
    latestRequestedClientPosition
  ),
  latestRequestedSampleClientPosition: cloneScreenVector(
    latestRequestedSampleClientPosition
  ),
  tangentPlaneFailureCount,
  tangentPlaneFailureCounts: { ...tangentPlaneFailureCounts },
  latestTangentPlaneFailure: cloneTangentPlaneFailure(
    latestTangentPlaneFailure
  ),
  discOriginJumpCount,
  latestDiscOriginJump: cloneDiscOriginJump(latestDiscOriginJump),
  discScaleChangeCount,
  latestDiscScaleChange: latestDiscScaleChange
    ? { ...latestDiscScaleChange }
    : null,
  entries: telemetryEntries.map((entry) => ({ ...entry })),
  tangentPlaneFailures: tangentPlaneFailures.map(
    (failure) => cloneTangentPlaneFailure(failure)!
  ),
  discOriginJumps: discOriginJumps.map((jump) => cloneDiscOriginJump(jump)!),
  discScaleChanges: discScaleChanges.map((scaleChange) => ({
    ...scaleChange,
  })),
});
