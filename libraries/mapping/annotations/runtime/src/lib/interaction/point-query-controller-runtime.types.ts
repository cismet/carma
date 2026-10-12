import { type Matrix4, type Vector3 } from "three";
import { type AnnotationScenePrimitiveHandle } from "../engine";
import { type PointQueryDiscPlacementMode } from "./point-query-disc-placement-mode";
import { type TangentDiscSamplePlane } from "./tangent-disc-reprojection.shared";
import { type AuthoringLineRuntime } from "./authoring-visual-runtime";
import { type PointQueryTangentPlaneFailureReason } from "./point-query-controller.types";
import { type createPointQueryControllerState } from "./point-query-controller-state";

export type ScreenVector = {
  x: number;
  y: number;
};

export type PreparedDiscSample = {
  inputVersion: number;
  screenPosition: ScreenVector;
  pickedPositionECEF: Vector3 | null;
  surfaceNormalECEF: Vector3 | null;
};

export type PendingDiscRequest = {
  inputVersion: number;
  requestedAtMs: number;
  requestClientPosition: ScreenVector;
  requestSampleClientPosition: ScreenVector | null;
};

export type PointQueryControllerRuntime = ReturnType<
  typeof createPointQueryControllerState
> & {
  readTangentDiscVisualizerEnabled: () => boolean;
  readTangentDiscVisualizerPlacementMode: () => PointQueryDiscPlacementMode;
  readTangentDiscVisualizerShowNormalLine: () => boolean;
  readTangentDiscVisualizerTrailSampleCount: () => number;
  readTangentDiscVisualizerWeightDecayGamma: () => number;
  readDiscPlacementMode: () => PointQueryDiscPlacementMode;
  readInnerHoleRadiusRatio: () => number;
  readDebugTelemetryEnabled: () => boolean;
  resolvePointerScreenPositionFromClientPosition: (
    clientPosition: { x: number; y: number } | null
  ) => ScreenVector | null;
  syncDebugLagState: () => void;
  ensureDiscPrimitive: () => AnnotationScenePrimitiveHandle;
  ensureDiscNormalLineRuntime: () => AuthoringLineRuntime;
  applyDiscNormalLine: ({
    modelMatrix,
    lineLengthMeters,
  }: {
    modelMatrix: Matrix4 | null;
    lineLengthMeters: number;
  }) => void;
  withDiscTemporarilyHidden: <T>(callback: () => T) => T;
  clearDiscPrimitive: () => void;
  shouldQueueDiscNormalSample: (inputVersion: number) => boolean;
  queueDiscNormalSample: (discNormal: Vector3) => void;
  getAveragedDiscNormal: (fallbackNormal: Vector3) => Vector3;
  updateReadout: (
    screenPosition: { x: number; y: number } | null,
    pickedPositionECEF: Vector3 | null
  ) => void;
  markMousePositionEvent: () => void;
  markRenderRequestEvent: () => void;
  requestNormalSmoothingRender: () => void;
  markSampleEvent: () => void;
  markDiscUpdateEvent: () => void;
  markSkippedInputEvents: (count: number) => void;
  recordTelemetryEntry: () => void;
  recordTangentPlaneFailure: ({
    inputVersion,
    reason,
    clientPosition,
    screenPosition,
    hasSampledPoint,
    hasSampledSurfaceNormal,
  }: {
    inputVersion: number;
    reason: PointQueryTangentPlaneFailureReason;
    clientPosition: ScreenVector | null;
    screenPosition: ScreenVector | null;
    hasSampledPoint: boolean;
    hasSampledSurfaceNormal: boolean;
  }) => void;
  recordDiscOriginJump: ({
    inputVersion,
    requestedAtMs,
    nextDiscWorldPosition,
    nextDiscNormal,
    nextClientPosition,
    source,
  }: {
    inputVersion: number;
    requestedAtMs: number;
    nextDiscWorldPosition: Vector3;
    nextDiscNormal: Vector3;
    nextClientPosition: ScreenVector | null;
    source: "true-sample" | "fast-reproject";
  }) => void;
  recordDiscScaleChange: ({
    inputVersion,
    requestedAtMs,
    nextScaleFactor,
    source,
  }: {
    inputVersion: number;
    requestedAtMs: number;
    nextScaleFactor: number;
    source: "true-sample" | "fast-reproject";
  }) => void;
  resolveClientPositionFromWorldPosition: ({
    worldPosition,
    canvasRect,
    fallbackScreenPosition,
    scratchScreenPosition,
  }: {
    worldPosition: Vector3 | null;
    canvasRect: DOMRect;
    fallbackScreenPosition: ScreenVector | null;
    scratchScreenPosition: ScreenVector;
  }) => ScreenVector | null;
  updateObservedClientPosition: ({ x, y }: { x: number; y: number }) => void;
  applyCursorVisibility: () => void;
  resolvePointerScreenPosition: () => ScreenVector | null;
  isSameClientPosition: (
    left: ScreenVector | null,
    right: ScreenVector | null,
    epsilonPx?: number
  ) => boolean;
  sampleTrueDiscAtCurrentPointer: ({
    sampleSurfaceNormal,
  }: {
    sampleSurfaceNormal: boolean;
  }) => PreparedDiscSample | null;
  shouldRefreshTrueDiscSample: (nowMs: number) => boolean;
  shouldRefreshTrueDiscNormal: (nowMs: number) => boolean;
  consumeRenderedRequestMetrics: (
    inputVersion: number,
    renderedAtMs: number
  ) => PendingDiscRequest | null;
  applyRenderedDiscSample: ({
    renderDiscSample,
    truePickedPositionECEF,
    trueSampledSurfaceNormal,
    renderedAtMs,
  }: {
    renderDiscSample: PreparedDiscSample;
    truePickedPositionECEF: Vector3 | null;
    trueSampledSurfaceNormal: Vector3 | null;
    renderedAtMs: number;
  }) => void;
  resolveLatestTrueTangentPlane: () => TangentDiscSamplePlane | null;
  applyFastReprojectedDiscSample: ({
    renderDiscSample,
    renderedAtMs,
  }: {
    renderDiscSample: PreparedDiscSample;
    renderedAtMs: number;
  }) => void;
  prepareFastDiscSample: (
    inputVersion: number,
    clientPosition: ScreenVector | null
  ) => PreparedDiscSample | null;
  prepareDisplayedDiscSampleForSmoothing: (
    inputVersion: number
  ) => PreparedDiscSample | null;
  renderDiscAndReadout: ({
    allowTrueSample,
  }: {
    allowTrueSample: boolean;
  }) => void;
  requestRenderOnly: () => void;
  requestRenderNow: () => void;
  queueRender: () => void;
  clearPointer: () => void;
  commitLatestInputClientPosition: ({
    x,
    y,
    timestampMs,
  }: {
    x: number;
    y: number;
    timestampMs: number;
  }) => void;
  handleCanvasPointerMove: (event: PointerEvent) => void;
  handleCanvasPointerRawUpdate: (event: PointerEvent) => void;
  handleCanvasPointerLeave: () => void;
  handleWindowBlur: () => void;
};
