import { Matrix4, Vector3 } from "three";
import {
  type CandidateRingSample,
  type AnnotationEngine,
  type AnnotationSceneLineCollection,
  type AnnotationScenePrimitiveHandle,
} from "@carma-mapping/annotations/core";

import { type AuthoringLineRuntime } from "./authoring-visual-runtime";
import { createPointQueryDebugRuntime } from "./point-query-debug-runtime";
import {
  type PointQueryControllerOptions,
  type PointQueryTangentPlaneFailure,
} from "./point-query-controller.types";
import {
  type ScreenVector,
  type PreparedDiscSample,
  type PendingDiscRequest,
} from "./point-query-controller-runtime.types";

export const createPointQueryControllerState = ({
  engine,
  readoutElement,
  mousePositionRateElement,
  renderRequestRateElement,
  sampleRateElement,
  discUpdateRateElement,
  skippedInputRateElement,
  lagReadoutElement,
  syncReadoutElement,
  requestTimingReadoutElement,
  tangentPlaneFailureReadoutElement,
  discOriginJumpReadoutElement,
  discScaleChangeReadoutElement,
  onTangentPlaneFailure,
  options,
}: {
  engine: AnnotationEngine;
  readoutElement: HTMLElement | null;
  mousePositionRateElement?: HTMLElement | null;
  renderRequestRateElement?: HTMLElement | null;
  sampleRateElement?: HTMLElement | null;
  discUpdateRateElement?: HTMLElement | null;
  skippedInputRateElement?: HTMLElement | null;
  lagReadoutElement?: HTMLElement | null;
  syncReadoutElement?: HTMLElement | null;
  requestTimingReadoutElement?: HTMLElement | null;
  tangentPlaneFailureReadoutElement?: HTMLElement | null;
  discOriginJumpReadoutElement?: HTMLElement | null;
  discScaleChangeReadoutElement?: HTMLElement | null;
  onTangentPlaneFailure?: (failure: PointQueryTangentPlaneFailure) => void;
  options: PointQueryControllerOptions;
}) => {
  const unregisterPointerTracker = engine.pointer.register();

  let currentOptions = options;

  let discPrimitive: AnnotationScenePrimitiveHandle | null = null;

  const discModelMatrix = new Matrix4();

  let discNormalLineCollection: AnnotationSceneLineCollection | null = null;

  let discNormalLineRuntime: AuthoringLineRuntime | null = null;

  let discNormalLineVisible = false;

  let discInputNeedsRender = false;

  let discSmoothingNeedsRender = false;

  let previousSurfaceNormal: Vector3 | null = null;

  let latestDiscWorldPosition: Vector3 | null = null;

  let latestDiscNormal: Vector3 | null = null;

  let latestTrueDiscSampledAtMs = 0;

  let latestTrueDiscNormalSampledAtMs = 0;

  let discNormalSamples: CandidateRingSample[] = [];

  let lastQueuedDiscNormalInputVersion = -1;

  let pointerScreenPositionScratch: ScreenVector | null = null;

  const averagedDiscNormalScratch = new Vector3();

  let latestObservedClientPosition: {
    x: number;
    y: number;
    timestampMs: number;
  } | null = null;

  let latestInputClientPosition: {
    x: number;
    y: number;
    timestampMs: number;
  } | null = null;

  let latestRenderedClientPosition: ScreenVector | null = null;

  let latestDiscClientPosition: ScreenVector | null = null;

  let latestSampleClientPosition: ScreenVector | null = null;

  let latestRequestedClientPosition: ScreenVector | null = null;

  let latestRequestedSampleClientPosition: ScreenVector | null = null;

  let latestPreparedDiscSample: PreparedDiscSample | null = null;

  let latestTrueDiscWorldPosition: Vector3 | null = null;

  let latestRequestedAtMs = 0;

  let latestRenderedAtMs = 0;

  let latestRequestToDiscLatencyMs = 0;

  let latestInputVersion = 0;

  let lastProcessedInputVersion = 0;

  let lastRawPointerEventTimeMs = 0;

  const rawPointerSupported = "onpointerrawupdate" in window;

  const pendingDiscRequests = new Map<number, PendingDiscRequest>();

  const projectedDiscScreenPositionScratch: ScreenVector = { x: 0, y: 0 };

  const projectedSampleScreenPositionScratch: ScreenVector = { x: 0, y: 0 };

  const pointQueryDebugRuntime = createPointQueryDebugRuntime({
    engine,
    statusElements: {
      readoutElement,
      mousePositionRateElement,
      renderRequestRateElement,
      sampleRateElement,
      discUpdateRateElement,
      skippedInputRateElement,
      lagReadoutElement,
      syncReadoutElement,
      requestTimingReadoutElement,
      tangentPlaneFailureReadoutElement,
      discOriginJumpReadoutElement,
      discScaleChangeReadoutElement,
    },
    onTangentPlaneFailure,
  });

  return {
    engine,
    readoutElement,
    unregisterPointerTracker,
    currentOptions,
    discPrimitive: discPrimitive as AnnotationScenePrimitiveHandle | null,
    discModelMatrix,
    discNormalLineCollection:
      discNormalLineCollection as AnnotationSceneLineCollection | null,
    discNormalLineRuntime: discNormalLineRuntime as AuthoringLineRuntime | null,
    discNormalLineVisible,
    discInputNeedsRender,
    discSmoothingNeedsRender,
    previousSurfaceNormal: previousSurfaceNormal as Vector3 | null,
    latestDiscWorldPosition: latestDiscWorldPosition as Vector3 | null,
    latestDiscNormal: latestDiscNormal as Vector3 | null,
    latestTrueDiscSampledAtMs,
    latestTrueDiscNormalSampledAtMs,
    discNormalSamples: discNormalSamples as CandidateRingSample[],
    lastQueuedDiscNormalInputVersion,
    pointerScreenPositionScratch:
      pointerScreenPositionScratch as ScreenVector | null,
    averagedDiscNormalScratch,
    latestObservedClientPosition: latestObservedClientPosition as {
      x: number;
      y: number;
      timestampMs: number;
    } | null,
    latestInputClientPosition: latestInputClientPosition as {
      x: number;
      y: number;
      timestampMs: number;
    } | null,
    latestRenderedClientPosition:
      latestRenderedClientPosition as ScreenVector | null,
    latestDiscClientPosition: latestDiscClientPosition as ScreenVector | null,
    latestSampleClientPosition:
      latestSampleClientPosition as ScreenVector | null,
    latestRequestedClientPosition:
      latestRequestedClientPosition as ScreenVector | null,
    latestRequestedSampleClientPosition:
      latestRequestedSampleClientPosition as ScreenVector | null,
    latestPreparedDiscSample:
      latestPreparedDiscSample as PreparedDiscSample | null,
    latestTrueDiscWorldPosition: latestTrueDiscWorldPosition as Vector3 | null,
    latestRequestedAtMs,
    latestRenderedAtMs,
    latestRequestToDiscLatencyMs,
    latestInputVersion,
    lastProcessedInputVersion,
    lastRawPointerEventTimeMs,
    rawPointerSupported,
    pendingDiscRequests,
    projectedDiscScreenPositionScratch:
      projectedDiscScreenPositionScratch as ScreenVector,
    projectedSampleScreenPositionScratch:
      projectedSampleScreenPositionScratch as ScreenVector,
    pointQueryDebugRuntime,
  };
};
