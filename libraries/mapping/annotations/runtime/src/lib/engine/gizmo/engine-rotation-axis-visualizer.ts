import { Vector3 } from "three";

import { arePoint3Close } from "@carma-commons/math";

import type {
  AnnotationEngine,
  AnnotationSceneLineCollection,
  AnnotationSceneLineHandle,
} from "@carma-mapping/annotations/core";

export type EngineRotationAxisVisualizerOptions = {
  origin: Vector3;
  upVector: Vector3;
  lengthMultiplier?: number;
  dashPixelLength?: number;
  gapPixelLength?: number;
  color?: string;
  width?: number;
};

export type EngineRotationAxisVisualizer = {
  readonly id: string;
  readonly isAttached: boolean;
  readonly origin: Vector3;
  readonly isVisible: boolean;
  attach: (engine: AnnotationEngine, requestRender: () => void) => void;
  detach: () => void;
  destroy: () => void;
  update: (origin: Vector3, upVector: Vector3) => void;
  show: () => void;
  hide: () => void;
};

type ViewSnapshot = {
  cameraPositionECEF: Vector3;
  pixelsPerMeter: number;
};

const DEFAULT_LENGTH_MULTIPLIER = 2;
const DEFAULT_DASH_PIXEL_LENGTH = 5;
const DEFAULT_GAP_PIXEL_LENGTH = 3;
const DEFAULT_WIDTH = 1;
const DEFAULT_COLOR = "#ffffff";
const AXIS_VECTOR_ABSOLUTE_EPSILON = 1e-7;
// Used while no camera snapshot is available.
const FALLBACK_LINE_LENGTH_METERS = 100000;
const FALLBACK_DASH_METERS = 1000;
const FALLBACK_GAP_METERS = 500;

const isEngineAlive = (
  engine: AnnotationEngine | null
): engine is AnnotationEngine => {
  if (!engine) return false;
  try {
    return !engine.isDestroyed();
  } catch {
    return false;
  }
};

const captureViewSnapshot = (
  engine: AnnotationEngine,
  origin: Vector3
): ViewSnapshot | null => {
  const cameraPositionECEF = engine.getCameraPositionECEF(new Vector3());
  if (!cameraPositionECEF) return null;
  return {
    cameraPositionECEF,
    pixelsPerMeter: engine.getScreenPixelsPerMeterAt(origin),
  };
};

const areViewSnapshotsEqual = (
  left: ViewSnapshot | null,
  right: ViewSnapshot | null
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.cameraPositionECEF.equals(right.cameraPositionECEF) &&
    left.pixelsPerMeter === right.pixelsPerMeter
  );
};

export const createEngineRotationAxisVisualizer = (
  id: string,
  {
    origin: initialOrigin,
    upVector: initialUpVector,
    lengthMultiplier = DEFAULT_LENGTH_MULTIPLIER,
    dashPixelLength = DEFAULT_DASH_PIXEL_LENGTH,
    gapPixelLength = DEFAULT_GAP_PIXEL_LENGTH,
    color = DEFAULT_COLOR,
    width = DEFAULT_WIDTH,
  }: EngineRotationAxisVisualizerOptions
): EngineRotationAxisVisualizer => {
  const origin = initialOrigin.clone();
  const upVector = initialUpVector.clone().normalize();
  let viewSnapshot: ViewSnapshot | null = null;
  let isAttached = false;
  let isDestroyed = false;
  let isVisible = true;

  let engine: AnnotationEngine | null = null;
  let requestRender: (() => void) | null = null;
  let lineCollection: AnnotationSceneLineCollection | null = null;
  let dashHandles: AnnotationSceneLineHandle[] = [];

  const safeRequestRender = () => {
    try {
      requestRender?.();
    } catch {
      // Ignore transient requestRender races.
    }
  };

  const getLineLength = (): number =>
    viewSnapshot
      ? viewSnapshot.cameraPositionECEF.distanceTo(origin) * lengthMultiplier
      : FALLBACK_LINE_LENGTH_METERS;

  const getDashParams = () => {
    if (
      !viewSnapshot ||
      !Number.isFinite(viewSnapshot.pixelsPerMeter) ||
      viewSnapshot.pixelsPerMeter <= 0
    ) {
      return {
        dashMeters: FALLBACK_DASH_METERS,
        gapMeters: FALLBACK_GAP_METERS,
      };
    }

    const metersPerPixel = 1 / viewSnapshot.pixelsPerMeter;
    return {
      dashMeters: dashPixelLength * metersPerPixel,
      gapMeters: gapPixelLength * metersPerPixel,
    };
  };

  const getSegmentCount = (
    lineLength: number,
    dashMeters: number,
    gapMeters: number
  ): number => {
    const numSegments = Math.floor((lineLength * 2) / (dashMeters + gapMeters));
    return Number.isFinite(numSegments) && numSegments > 0 ? numSegments : 0;
  };

  const getDashPositions = (
    segmentStart: number,
    segmentEnd: number
  ): Vector3[] => [
    origin.clone().addScaledVector(upVector, segmentStart),
    origin.clone().addScaledVector(upVector, segmentEnd),
  ];

  const removeLineCollection = () => {
    if (lineCollection) {
      try {
        lineCollection.destroy();
      } catch {
        // Ignore transient primitive removal races.
      }
    }
    lineCollection = null;
    dashHandles = [];
  };

  const createPolyline = () => {
    if (!engine) return;
    removeLineCollection();

    const lineLength = getLineLength();
    const { dashMeters, gapMeters } = getDashParams();
    const segmentLength = dashMeters + gapMeters;
    const numSegments = getSegmentCount(lineLength, dashMeters, gapMeters);

    lineCollection = engine.createLineCollection();
    dashHandles = [];

    for (let index = 0; index < numSegments; index += 1) {
      const segmentStart = -lineLength + index * segmentLength;
      const segmentEnd = segmentStart + dashMeters;

      dashHandles.push(
        lineCollection.addLine({
          id: `${id}-dash-${index}`,
          positions: getDashPositions(segmentStart, segmentEnd),
          color,
          width,
          visible: isVisible,
        })
      );
    }
  };

  const updatePolyline = () => {
    if (!lineCollection || !engine) return;

    const lineLength = getLineLength();
    const { dashMeters, gapMeters } = getDashParams();
    const segmentLength = dashMeters + gapMeters;
    const numSegments = getSegmentCount(lineLength, dashMeters, gapMeters);

    if (dashHandles.length !== numSegments) {
      createPolyline();
      return;
    }

    for (let index = 0; index < numSegments; index += 1) {
      const dashHandle = dashHandles[index];
      if (!dashHandle) continue;
      const segmentStart = -lineLength + index * segmentLength;
      const segmentEnd = segmentStart + dashMeters;

      dashHandle.setPositions(getDashPositions(segmentStart, segmentEnd));
      dashHandle.setVisible(isVisible);
    }

    safeRequestRender();
  };

  const setDashesVisible = (visible: boolean) => {
    dashHandles.forEach((dashHandle) => {
      dashHandle.setVisible(visible);
    });
  };

  const visualizer: EngineRotationAxisVisualizer = {
    get id() {
      return id;
    },

    get isAttached() {
      return isAttached;
    },

    get origin() {
      return origin;
    },

    get isVisible() {
      return isVisible;
    },

    attach: (engineRef, requestRenderFn) => {
      if (isDestroyed) throw new Error("Cannot attach destroyed visualizer");
      if (isAttached) visualizer.detach();
      engine = engineRef;
      requestRender = requestRenderFn;
      viewSnapshot = captureViewSnapshot(engine, origin);
      createPolyline();
      isAttached = true;
      safeRequestRender();
    },

    detach: () => {
      if (!isAttached || !engine) return;
      if (isEngineAlive(engine)) {
        removeLineCollection();
      } else {
        lineCollection = null;
        dashHandles = [];
      }

      isAttached = false;
      safeRequestRender();
    },

    destroy: () => {
      if (isDestroyed) return;
      visualizer.detach();
      isDestroyed = true;
      engine = null;
      requestRender = null;
    },

    update: (nextOrigin, nextUpVector) => {
      if (isDestroyed) return;
      const currentEngine = isEngineAlive(engine) ? engine : null;
      const nextViewSnapshot = currentEngine
        ? captureViewSnapshot(currentEngine, nextOrigin)
        : null;
      const nextNormalizedUpVector = nextUpVector.clone().normalize();
      const originChanged = !arePoint3Close(
        origin,
        nextOrigin,
        AXIS_VECTOR_ABSOLUTE_EPSILON
      );
      const upVectorChanged = !arePoint3Close(
        upVector,
        nextNormalizedUpVector,
        AXIS_VECTOR_ABSOLUTE_EPSILON
      );
      const viewSnapshotChanged =
        nextViewSnapshot !== null &&
        !areViewSnapshotsEqual(viewSnapshot, nextViewSnapshot);

      if (!originChanged && !upVectorChanged && !viewSnapshotChanged) return;
      origin.copy(nextOrigin);
      upVector.copy(nextNormalizedUpVector);
      if (nextViewSnapshot) {
        viewSnapshot = nextViewSnapshot;
      }

      if (isAttached) updatePolyline();
    },

    show: () => {
      if (isDestroyed) return;
      isVisible = true;
      setDashesVisible(true);
      safeRequestRender();
    },

    hide: () => {
      if (isDestroyed) return;
      isVisible = false;
      setDashesVisible(false);
      safeRequestRender();
    },
  };

  return visualizer;
};
