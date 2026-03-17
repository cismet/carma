import { Cartesian3 } from "../../cesium";
import type { LatLngAlt } from "@carma/geo/types";
import { Vector2, type Vec2 } from "@carma/math";
import type {
  CameraLike,
  OrbitPointSamplingStrategy,
  OrbitPointSnapshot,
  SceneLike,
  Vec3,
} from "@carma/types";
import {
  toSceneStateCartographicRad,
  toSceneStateVec3,
} from "./SceneStateValueAdapters";

export type SceneStateScreenCenterSample = {
  worldPosition: Vec3;
  rawCartesian: Vec3;
  source: "screen-center-depth" | "screen-center-globe";
};

const DEFAULT_SCREEN_CENTER_SAMPLING_STRATEGY: OrbitPointSamplingStrategy =
  "depth-first";

const readScreenCenterWindowPosition = (scene: SceneLike) => {
  const canvas = scene.canvas;
  if (!canvas) {
    return null;
  }

  return new Vector2(canvas.clientWidth * 0.5, canvas.clientHeight * 0.5);
};

const buildTerrainSamplePositions = (scene: SceneLike): Vec2[] => {
  const center = readScreenCenterWindowPosition(scene);
  const canvas = scene.canvas;
  if (!center || !canvas) {
    return [];
  }

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const offsetStepPx = Math.max(
    12,
    Math.round(Math.min(width, height) * 0.035)
  );

  // Prefer center first, then nearby samples with a slight downward bias.
  return [
    center,
    new Vector2(center.x, center.y + offsetStepPx),
    new Vector2(center.x - offsetStepPx, center.y),
    new Vector2(center.x + offsetStepPx, center.y),
    new Vector2(center.x, center.y - offsetStepPx),
    new Vector2(center.x - offsetStepPx, center.y + offsetStepPx),
    new Vector2(center.x + offsetStepPx, center.y + offsetStepPx),
    new Vector2(center.x - offsetStepPx * 2, center.y + offsetStepPx),
    new Vector2(center.x + offsetStepPx * 2, center.y + offsetStepPx),
    new Vector2(center.x, center.y + offsetStepPx * 2),
  ].filter(
    (position) =>
      position.x >= 0 &&
      position.y >= 0 &&
      position.x <= width &&
      position.y <= height
  );
};

const sampleScreenCenterFromDepthBuffer = (
  scene: SceneLike,
  camera: CameraLike
): SceneStateScreenCenterSample | null => {
  const centerScreenPosition = readScreenCenterWindowPosition(scene);
  if (!centerScreenPosition) {
    return null;
  }

  if (
    scene.pickPositionSupported === false ||
    typeof scene.pickPosition !== "function"
  ) {
    return null;
  }

  const pickedCartesian = scene.pickPosition(centerScreenPosition);
  if (!pickedCartesian) {
    return null;
  }

  const worldPosition = toSceneStateVec3(pickedCartesian);
  if (!worldPosition) {
    return null;
  }

  return {
    worldPosition,
    rawCartesian: worldPosition,
    source: "screen-center-depth",
  };
};

const sampleScreenCenterFromTerrain = (
  scene: SceneLike,
  camera: CameraLike
): SceneStateScreenCenterSample | null => {
  if (typeof camera.getPickRay !== "function") {
    return null;
  }

  const samplePositions = buildTerrainSamplePositions(scene);
  if (typeof scene.globe?.pick !== "function") {
    return null;
  }

  for (const screenPosition of samplePositions) {
    const ray = camera.getPickRay(screenPosition);
    if (!ray) {
      continue;
    }

    const pickedCartesian = scene.globe.pick(ray, scene);
    if (!pickedCartesian) {
      continue;
    }

    const worldPosition = toSceneStateVec3(pickedCartesian);
    if (!worldPosition) {
      continue;
    }

    return {
      worldPosition,
      rawCartesian: worldPosition,
      source: "screen-center-globe",
    };
  }

  return null;
};

const sampleScreenCenterOrbitPoint = (
  scene: SceneLike,
  camera: CameraLike,
  strategy: OrbitPointSamplingStrategy = DEFAULT_SCREEN_CENTER_SAMPLING_STRATEGY
): SceneStateScreenCenterSample | null => {
  if (strategy === "depth-only") {
    return sampleScreenCenterFromDepthBuffer(scene, camera);
  }

  if (strategy === "terrain-only") {
    return sampleScreenCenterFromTerrain(scene, camera);
  }

  if (strategy === "terrain-first") {
    return (
      sampleScreenCenterFromTerrain(scene, camera) ??
      sampleScreenCenterFromDepthBuffer(scene, camera)
    );
  }

  return (
    sampleScreenCenterFromDepthBuffer(scene, camera) ??
    sampleScreenCenterFromTerrain(scene, camera)
  );
};

const readCartographicFromWorld = (
  scene: SceneLike,
  rawCartesian: Vec3,
  fallbackWorldPosition: Vec3
): LatLngAlt.rad | null => {
  const ellipsoid = scene.globe?.ellipsoid;
  if (typeof ellipsoid?.cartesianToCartographic !== "function") {
    return null;
  }
  return (
    toSceneStateCartographicRad(
      ellipsoid.cartesianToCartographic(rawCartesian)
    ) ??
    toSceneStateCartographicRad(
      ellipsoid.cartesianToCartographic(
        toSceneStateVec3(
          Cartesian3.fromElements(
            fallbackWorldPosition.x,
            fallbackWorldPosition.y,
            fallbackWorldPosition.z,
            new Cartesian3()
          )
        ) ?? fallbackWorldPosition
      )
    ) ??
    null
  );
};

const buildFallbackOrbitPoint = (
  scene: SceneLike,
  cameraWorldPosition: Vec3,
  cameraCartographic: LatLngAlt.rad | null,
  fallbackHeightM: number,
  source: "camera-position" | "fallback"
): OrbitPointSnapshot => {
  if (!cameraCartographic) {
    return {
      worldPosition: cameraWorldPosition,
      cartographic: null,
      source,
    };
  }

  const cartographic: LatLngAlt.rad =
    source === "fallback"
      ? {
          longitude: cameraCartographic.longitude,
          latitude: cameraCartographic.latitude,
          altitude: fallbackHeightM as NonNullable<LatLngAlt.rad["altitude"]>,
        }
      : cameraCartographic;

  if (source === "camera-position") {
    return {
      worldPosition: cameraWorldPosition,
      cartographic,
      source,
    };
  }

  const cartesian = Cartesian3.fromRadians(
    cartographic.longitude,
    cartographic.latitude,
    cartographic.altitude ?? fallbackHeightM
  );
  const worldPosition = toSceneStateVec3(cartesian) ?? cameraWorldPosition;

  return {
    worldPosition,
    cartographic,
    source,
  };
};

export const resolveSceneStateOrbitPoint = (
  scene: SceneLike,
  camera: CameraLike,
  {
    cameraWorldPosition,
    cameraCartographic,
    orbitPointMode,
    fallbackHeightM,
    screenCenterSamplingStrategy = DEFAULT_SCREEN_CENTER_SAMPLING_STRATEGY,
    throwOnMissingScreenCenterIntersection = false,
  }: {
    cameraWorldPosition: Vec3;
    cameraCartographic: LatLngAlt.rad | null;
    orbitPointMode: "screen-center" | "camera-position";
    fallbackHeightM: number;
    screenCenterSamplingStrategy?: OrbitPointSamplingStrategy;
    throwOnMissingScreenCenterIntersection?: boolean;
  }
): OrbitPointSnapshot => {
  if (orbitPointMode === "camera-position") {
    return buildFallbackOrbitPoint(
      scene,
      cameraWorldPosition,
      cameraCartographic,
      fallbackHeightM,
      "camera-position"
    );
  }

  const sample = sampleScreenCenterOrbitPoint(
    scene,
    camera,
    screenCenterSamplingStrategy
  );
  if (sample) {
    return {
      worldPosition: sample.worldPosition,
      cartographic: readCartographicFromWorld(
        scene,
        sample.rawCartesian,
        sample.worldPosition
      ),
      source: sample.source,
    };
  }

  if (throwOnMissingScreenCenterIntersection) {
    throw new Error(
      `[scene-state] Missing screen-center intersection (strategy: ${screenCenterSamplingStrategy}).`
    );
  }

  return buildFallbackOrbitPoint(
    scene,
    cameraWorldPosition,
    cameraCartographic,
    fallbackHeightM,
    "fallback"
  );
};
