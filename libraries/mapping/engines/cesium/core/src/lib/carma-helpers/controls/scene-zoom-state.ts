import {
  readLongerEdgeFovFromMetersPerCssPixel,
  readMetersPerCssPixel,
  readVerticalFovFromLongerEdge,
} from "@carma-commons/camera/model";
import { clamp } from "@carma-commons/math";
import { Cartesian3, PerspectiveFrustum, type Scene } from "@carma-cesium";
import type { Radians } from "@carma-units";

import { readPerspectiveFrustumVerticalFov } from "../camera";
import {
  readSceneAspectRatio,
  readCurrentCesiumLongerEdgeFov,
  readTimedCesiumVerticalFov,
  type TimedCesiumFovCurve,
} from "./cesium-zoom-curves";
import { readCachedCesiumViewportCenterZoomAnchor } from "./per-frame-cache";
import { computeNextCesiumWheelFov } from "./wheel-fov";

const DEFAULT_CESIUM_FOV_ZOOM_DELTA = 1;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export type CesiumSceneZoomState = {
  currentLongerEdgeFovRad: number;
  currentVerticalFovRad: number;
  currentRangeM: number;
  targetPoint: Cartesian3;
};

const cesiumSceneActiveFovCurves = new WeakMap<Scene, TimedCesiumFovCurve>();

const readCesiumSceneCurrentFovCurve = (scene: Scene) =>
  cesiumSceneActiveFovCurves.get(scene);

export const readCesiumSceneZoomAnchorPoint = (
  scene: Scene,
  targetPoint?: Cartesian3 | null
) => {
  if (targetPoint) {
    return Cartesian3.clone(targetPoint, new Cartesian3());
  }

  const zoomAnchor = readCachedCesiumViewportCenterZoomAnchor(scene);
  return zoomAnchor.point
    ? Cartesian3.clone(zoomAnchor.point, new Cartesian3())
    : null;
};

export const setCesiumSceneActiveFovCurve = (
  scene: Scene,
  curve: TimedCesiumFovCurve
) => {
  cesiumSceneActiveFovCurves.set(scene, curve);
};

export const clearCesiumSceneActiveFovCurve = (scene: Scene) => {
  cesiumSceneActiveFovCurves.delete(scene);
};

export const readCesiumSceneZoomState = (
  scene: Scene,
  nowMs: number,
  {
    targetPoint,
    currentFovCurve = readCesiumSceneCurrentFovCurve(scene),
  }: {
    targetPoint?: Cartesian3 | null;
    currentFovCurve?: TimedCesiumFovCurve;
  } = {}
): CesiumSceneZoomState | null => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  const resolvedTargetPoint = readCesiumSceneZoomAnchorPoint(
    scene,
    targetPoint
  );
  if (!resolvedTargetPoint) {
    return null;
  }

  const currentLongerEdgeFovRad = readCurrentCesiumLongerEdgeFov({
    scene,
    curve: currentFovCurve,
    nowMs,
  });
  if (!isFiniteNumber(currentLongerEdgeFovRad)) {
    return null;
  }

  const aspectRatio = readSceneAspectRatio(scene);
  const currentVerticalFovRad =
    aspectRatio !== null
      ? readVerticalFovFromLongerEdge(currentLongerEdgeFovRad, aspectRatio)
      : currentFovCurve
      ? readTimedCesiumVerticalFov({
          scene,
          curve: currentFovCurve,
          nowMs,
        }) ?? null
      : readPerspectiveFrustumVerticalFov(scene.camera.frustum) ?? null;
  if (!isFiniteNumber(currentVerticalFovRad)) {
    return null;
  }

  const currentRangeM = Cartesian3.distance(
    scene.camera.positionWC,
    resolvedTargetPoint
  );
  if (!isFiniteNumber(currentRangeM) || currentRangeM <= 0) {
    return null;
  }

  return {
    currentLongerEdgeFovRad,
    currentVerticalFovRad,
    currentRangeM,
    targetPoint: resolvedTargetPoint,
  };
};

export const computeNextCesiumSceneFov = (
  scene: Scene,
  direction: "in" | "out",
  {
    zoomDelta = DEFAULT_CESIUM_FOV_ZOOM_DELTA,
    minimumFovRad,
    maximumFovRad,
    currentVerticalFovRadOverride,
  }: {
    zoomDelta?: number;
    minimumFovRad: number;
    maximumFovRad: number;
    currentVerticalFovRadOverride?: number;
  }
) => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  const currentVerticalFovRad =
    typeof currentVerticalFovRadOverride === "number" &&
    Number.isFinite(currentVerticalFovRadOverride) &&
    currentVerticalFovRadOverride > 0
      ? currentVerticalFovRadOverride
      : readPerspectiveFrustumVerticalFov(scene.camera.frustum);

  if (
    typeof currentVerticalFovRad !== "number" ||
    !Number.isFinite(currentVerticalFovRad) ||
    currentVerticalFovRad <= 0
  ) {
    return null;
  }

  return computeNextCesiumWheelFov(currentVerticalFovRad, direction, {
    zoomDelta,
    minimumFovRad,
    maximumFovRad,
    viewportWidthPx: scene.canvas?.clientWidth,
    viewportHeightPx: scene.canvas?.clientHeight,
  });
};

export const readCesiumSceneZoomTargetFov = (
  scene: Scene,
  targetRangeM: number,
  {
    minimumFovRad,
    maximumFovRad,
  }: {
    minimumFovRad: number;
    maximumFovRad: number;
  }
) => {
  const currentState = readCesiumSceneZoomState(scene, performance.now());
  if (!currentState) {
    return null;
  }

  const currentMetersPerCssPixel = readMetersPerCssPixel({
    rangeM: currentState.currentRangeM,
    fovRad: currentState.currentLongerEdgeFovRad,
    viewportWidthPx: scene.canvas?.clientWidth,
    viewportHeightPx: scene.canvas?.clientHeight,
  });
  const targetLongerEdgeFov =
    currentMetersPerCssPixel !== null
      ? readLongerEdgeFovFromMetersPerCssPixel({
          metersPerCssPixel: currentMetersPerCssPixel,
          rangeM: targetRangeM,
          viewportWidthPx: scene.canvas?.clientWidth,
          viewportHeightPx: scene.canvas?.clientHeight,
        })
      : null;
  const aspectRatio = readSceneAspectRatio(scene);
  const targetVerticalFov =
    targetLongerEdgeFov !== null && aspectRatio !== null
      ? readVerticalFovFromLongerEdge(targetLongerEdgeFov, aspectRatio)
      : null;

  return typeof targetVerticalFov === "number" &&
    Number.isFinite(targetVerticalFov)
    ? clamp(targetVerticalFov, minimumFovRad, maximumFovRad)
    : null;
};
