import { readHorizontalFovFromVertical } from "@carma-commons/camera/model";
import { clamp, Easing } from "@carma-commons/math";
import {
  Cartesian3,
  Cartographic,
  Matrix4,
  PerspectiveFrustum,
  defined,
  type Scene,
  CesiumMath,
} from "@carma-cesium";
import {
  animateCesiumSceneDollyZoom,
  pickSceneCenter,
} from "@carma-mapping/engines/cesium/core";
import type { Radians } from "@carma-units";
import { DerivedExteriorOrientation } from "./transformExteriorOrientation";
import type { AnimationConfig } from "../types";

// ...

const ENTER_DURATION = 1400;
const LEAVE_BASE_DURATION = 1100;
const MAX_FLY_DURATION_MS = 2000; // ms
const MIN_FLY_DURATION_MS = 50; // should be about a frame to avoid zero duration artifacts in calculations and code paths taken
const DEFAULT_EASING_FUNCTION = Easing.LINEAR_NONE;
const DYNAMIC_DISTANCE_TO_MS_FACTOR = 100;

const readSceneAspectRatio = (scene: Scene): number | null => {
  const widthPx = scene.canvas?.clientWidth;
  const heightPx = scene.canvas?.clientHeight;

  return typeof widthPx === "number" &&
    Number.isFinite(widthPx) &&
    widthPx > 0 &&
    typeof heightPx === "number" &&
    Number.isFinite(heightPx) &&
    heightPx > 0
    ? widthPx / heightPx
    : null;
};

const readVerticalFovFromShorterEdgeFov = (
  shorterEdgeFovRad: number,
  aspectRatio: number
): Radians | null => {
  if (
    !Number.isFinite(shorterEdgeFovRad) ||
    shorterEdgeFovRad <= 0 ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0
  ) {
    return null;
  }

  return aspectRatio >= 1
    ? (shorterEdgeFovRad as Radians)
    : ((2 *
        Math.atan(Math.tan(shorterEdgeFovRad * 0.5) / aspectRatio)) as Radians);
};

const readShorterEdgeFovFromVerticalFov = (
  verticalFovRad: number,
  aspectRatio: number
): Radians | null => {
  if (
    !Number.isFinite(verticalFovRad) ||
    verticalFovRad <= 0 ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0
  ) {
    return null;
  }

  return aspectRatio >= 1
    ? (verticalFovRad as Radians)
    : readHorizontalFovFromVertical(verticalFovRad, aspectRatio) ?? null;
};

const readMetersPerCssPixelFromShorterEdgeFov = (
  scene: Scene,
  {
    shorterEdgeFovRad,
    rangeM,
  }: {
    shorterEdgeFovRad: number;
    rangeM: number;
  }
) => {
  const widthPx = scene.canvas?.clientWidth;
  const heightPx = scene.canvas?.clientHeight;
  const projectionCenterRadiusPx =
    typeof widthPx === "number" &&
    Number.isFinite(widthPx) &&
    widthPx > 0 &&
    typeof heightPx === "number" &&
    Number.isFinite(heightPx) &&
    heightPx > 0
      ? Math.min(widthPx, heightPx) * 0.5
      : null;

  if (
    projectionCenterRadiusPx === null ||
    !Number.isFinite(rangeM) ||
    rangeM <= 0 ||
    !Number.isFinite(shorterEdgeFovRad) ||
    shorterEdgeFovRad <= 0
  ) {
    return null;
  }

  const tanHalfShorterEdgeFov = Math.tan(shorterEdgeFovRad * 0.5);
  if (
    !Number.isFinite(tanHalfShorterEdgeFov) ||
    Math.abs(tanHalfShorterEdgeFov) <= 1e-6
  ) {
    return null;
  }

  const metersPerCssPixel =
    (rangeM * Math.abs(tanHalfShorterEdgeFov)) / projectionCenterRadiusPx;

  return Number.isFinite(metersPerCssPixel) && metersPerCssPixel > 0
    ? metersPerCssPixel
    : null;
};

export type EnterObliqueModeOptions = {
  duration?: number;
  easingFunction?: AnimationConfig["easingFunction"];
  targetEnterObliqueModeFov?: Radians;
};

const normalizeEnterObliqueModeOptions = (
  durationOrOptions?: number | EnterObliqueModeOptions
): EnterObliqueModeOptions =>
  typeof durationOrOptions === "number"
    ? { duration: durationOrOptions }
    : durationOrOptions ?? {};

/**
 * Computes and flies to an improved camera orientation based on image metadata
 * @param scene Cesium scene instance
 * @param imageRecord Oblique image record containing metadata
 * @param onComplete Callback to execute after flight completion
 * @param flyToOptions Optional configuration for the flight animation
 */
export const flyToExteriorOrientation = (
  scene: Scene,
  exteriorOrientation: DerivedExteriorOrientation,
  onComplete?: () => void,
  flyToOptions: AnimationConfig = {}
): void => {
  if (
    !exteriorOrientation ||
    !exteriorOrientation.position.wgs84 ||
    !exteriorOrientation.rotation.ecef.direction
  ) {
    console.debug(
      "Missing required parameters for improved orientation calculation",
      exteriorOrientation,
      exteriorOrientation.position.wgs84,
      exteriorOrientation.rotation.ecef.direction
    );
    return;
  }

  // Create position from WGS84 coordinates
  const [longitude, latitude, height] = exteriorOrientation.position.wgs84;
  const position = Cartesian3.fromDegrees(longitude, latitude, height);

  const direction = new Cartesian3(
    ...exteriorOrientation.rotation.ecef.direction
  );

  const up = new Cartesian3(...exteriorOrientation.rotation.ecef.up);

  if (!defined(direction) || !defined(up)) {
    console.debug(
      "Missing direction or up vectors in camera state",
      direction,
      up
    );
    return;
  }

  const camera = scene.camera;

  // Calculate appropriate flight duration based on distance
  const currentDistanceToCamera = Cartesian3.distance(
    camera.positionWC,
    position
  );

  // TODO: also factor in orientation change
  const duration = getDynamicDurationSecondsFromDistance(
    currentDistanceToCamera,
    flyToOptions.duration
  );

  const easingFunction = flyToOptions.easingFunction || DEFAULT_EASING_FUNCTION;

  // TODO workaround until using actual exterior orientation up vector,
  // but that one is rotating differently by each camera ID
  // const localEnuUpAxis: Vector3Arr = [0, 0, 1];
  // const upZ = enuToEcef(localEnuUpAxis, position);

  // Execute the camera flight
  camera.flyTo({
    destination: position,
    orientation: {
      direction,
      up,
    },
    endTransform: Matrix4.IDENTITY,
    duration,
    easingFunction,
    complete: onComplete,
  });
};

const distanceSqrtInMetersToMilliseconds = (
  distance: number,
  min: number,
  max: number,
  factor = DYNAMIC_DISTANCE_TO_MS_FACTOR
) => {
  const distanceToMSeconds = Math.sqrt(Math.abs(distance)) * factor;
  return CesiumMath.clamp(distanceToMSeconds, min, max);
};

export const getDynamicDurationSecondsFromDistance = (
  distance: number,
  maxDurationMilliseconds = MAX_FLY_DURATION_MS
) => {
  const dynamicDurationMilliseconds = distanceSqrtInMetersToMilliseconds(
    distance,
    MIN_FLY_DURATION_MS,
    maxDurationMilliseconds
  );
  const duration = dynamicDurationMilliseconds / 1000;
  return duration;
};

const readTargetRangeForObliqueCameraHeight = (
  targetCameraHeight: number,
  targetPitch: number,
  anchorPoint: Cartesian3
) => {
  const anchorCartographic = Cartographic.fromCartesian(anchorPoint);
  const pitchSin = Math.sin(-targetPitch);
  const anchorHeight = anchorCartographic?.height;

  if (
    !Number.isFinite(targetCameraHeight) ||
    targetCameraHeight <= 0 ||
    !Number.isFinite(anchorHeight) ||
    !Number.isFinite(pitchSin) ||
    Math.abs(pitchSin) <= 1e-6
  ) {
    return null;
  }

  const verticalOffsetToAnchor = targetCameraHeight - anchorHeight;
  if (!Number.isFinite(verticalOffsetToAnchor) || verticalOffsetToAnchor <= 0) {
    return null;
  }

  const targetRange = verticalOffsetToAnchor / Math.abs(pitchSin);
  return Number.isFinite(targetRange) && targetRange > 0 ? targetRange : null;
};

export const enterObliqueMode = (
  scene: Scene,
  targetPitch: number,
  targetCameraHeight: number,
  minimumFovRad: number,
  maximumFovRad: number,
  onComplete: () => void,
  durationOrOptions?: number | EnterObliqueModeOptions
) => {
  const { duration, easingFunction, targetEnterObliqueModeFov } =
    normalizeEnterObliqueModeOptions(durationOrOptions);
  const center = pickSceneCenter(scene);
  if (!center) {
    // Terrain/tilesets may not be loaded yet - retry after a delay
    const retryDelay = 500;
    const maxRetries = 10;
    let retryCount = 0;

    const retryPickCenter = () => {
      retryCount++;
      const retryCenter = pickSceneCenter(scene);
      if (retryCenter) {
        console.debug(
          `[enterObliqueMode] pickSceneCenter succeeded after ${retryCount} retries`
        );
        performFlight(retryCenter);
      } else if (retryCount < maxRetries) {
        setTimeout(retryPickCenter, retryDelay);
      } else {
        console.debug(
          "[enterObliqueMode] Failed to get orbit point after max retries, completing without animation"
        );
        onComplete();
      }
    };

    console.debug(
      "[enterObliqueMode] pickSceneCenter failed, will retry after terrain/tilesets load"
    );
    setTimeout(retryPickCenter, retryDelay);
    return;
  }

  performFlight(center);

  function performFlight(flightCenter: Cartesian3) {
    const targetRangeM = readTargetRangeForObliqueCameraHeight(
      targetCameraHeight,
      targetPitch,
      flightCenter
    );
    if (targetRangeM === null) {
      onComplete();
      return;
    }

    const effectiveDurationMs =
      typeof duration === "number" && Number.isFinite(duration) && duration > 0
        ? duration
        : ENTER_DURATION;
    const sceneAspectRatio = readSceneAspectRatio(scene);
    const targetEnterObliqueModeShorterEdgeFov =
      typeof targetEnterObliqueModeFov === "number" &&
      Number.isFinite(targetEnterObliqueModeFov) &&
      targetEnterObliqueModeFov > 0
        ? (targetEnterObliqueModeFov as Radians)
        : null;
    const targetEnterObliqueModeVerticalFov =
      targetEnterObliqueModeShorterEdgeFov !== null && sceneAspectRatio !== null
        ? readVerticalFovFromShorterEdgeFov(
            targetEnterObliqueModeShorterEdgeFov,
            sceneAspectRatio
          )
        : null;
    const clampedTargetEnterObliqueModeVerticalFov =
      targetEnterObliqueModeVerticalFov !== null
        ? (clamp(
            targetEnterObliqueModeVerticalFov,
            minimumFovRad,
            maximumFovRad
          ) as Radians)
        : null;
    const clampedTargetEnterObliqueModeShorterEdgeFov =
      clampedTargetEnterObliqueModeVerticalFov !== null &&
      sceneAspectRatio !== null
        ? readShorterEdgeFovFromVerticalFov(
            clampedTargetEnterObliqueModeVerticalFov,
            sceneAspectRatio
          )
        : null;
    const targetMetersPerCssPixel =
      clampedTargetEnterObliqueModeShorterEdgeFov !== null
        ? readMetersPerCssPixelFromShorterEdgeFov(scene, {
            shorterEdgeFovRad: clampedTargetEnterObliqueModeShorterEdgeFov,
            rangeM: targetRangeM,
          })
        : null;

    const didStart = animateCesiumSceneDollyZoom(scene, {
      targetPoint: flightCenter,
      targetFovRad: clampedTargetEnterObliqueModeVerticalFov ?? undefined,
      targetRangeM,
      targetMetersPerCssPixel,
      targetMetersPerCssPixelFitMode: "shorter-edge",
      targetPitchRad: targetPitch,
      minimumFovRad,
      maximumFovRad,
      durationMs: effectiveDurationMs,
      easing: easingFunction,
      onCompleted: onComplete,
      onCanceled: onComplete,
    });

    if (!didStart) {
      onComplete();
    }
  }
};

export const leaveObliqueMode = (
  scene: Scene,
  onComplete: () => void,
  fallbackRestoreFovRad = CesiumMath.toRadians(60)
) => {
  const camera = scene.camera;
  if (!(camera.frustum instanceof PerspectiveFrustum)) {
    onComplete();
    return;
  }

  const adaptiveLeaveDuration = LEAVE_BASE_DURATION;
  const didStart = animateCesiumSceneDollyZoom(scene, {
    targetPoint: pickSceneCenter(scene),
    targetFovRad: fallbackRestoreFovRad,
    durationMs: adaptiveLeaveDuration,
    onCompleted: onComplete,
    onCanceled: onComplete,
  });

  if (!didStart) {
    camera.frustum.fov = fallbackRestoreFovRad;
    onComplete();
  }
};

export const resetCamera = (scene: Scene) => {
  scene.camera.lookAtTransform(Matrix4.IDENTITY);
};
