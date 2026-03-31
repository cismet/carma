import { readPerspectiveFrustumVerticalFov } from "@carma-mapping/engines/cesium/api";
import type { SlotRuntimeHandle } from "../viewSyncStoryShared";
import { CARMA_STORY_MAPPING_ENGINES } from "../mappingEngines";
import { readStoryCesiumScene } from "../../../shared/cesiumRuntimeGuards";

export const DOLLY_ZOOM_PRESET_FOV_DEG = [5, 60, 120] as const;
export const DOLLY_TARGET_EPSILON_DEG = 2;

export const readCurrentCesiumFovDeg = (
  runtimeHandle: SlotRuntimeHandle | null
): number | null => {
  if (runtimeHandle?.engine !== CARMA_STORY_MAPPING_ENGINES.CESIUM) {
    return null;
  }

  return readCurrentCesiumSceneFovDeg(readStoryCesiumScene(runtimeHandle.widget));
};

export const readCurrentCesiumSceneFovDeg = (
  scene: { camera?: { frustum?: unknown } } | null | undefined
): number | null => {
  const fovRad = scene?.camera
    ? readPerspectiveFrustumVerticalFov(scene.camera.frustum) ?? null
    : null;

  return typeof fovRad === "number" && Number.isFinite(fovRad)
    ? (fovRad * 180) / Math.PI
    : null;
};

export const readNextDollyPresetFovDeg = ({
  currentFovDeg,
  direction,
}: {
  currentFovDeg: number | null;
  direction: "in" | "out";
}) => {
  const snappedCurrentFovDeg =
    currentFovDeg === null
      ? null
      : DOLLY_ZOOM_PRESET_FOV_DEG.find(
          (preset) =>
            Math.abs(preset - currentFovDeg) <= DOLLY_TARGET_EPSILON_DEG
        ) ?? currentFovDeg;

  if (snappedCurrentFovDeg === null) {
    return direction === "in"
      ? DOLLY_ZOOM_PRESET_FOV_DEG[1]
      : DOLLY_ZOOM_PRESET_FOV_DEG[2];
  }

  return direction === "in"
    ? [...DOLLY_ZOOM_PRESET_FOV_DEG]
        .reverse()
        .find(
          (preset) => preset < snappedCurrentFovDeg - DOLLY_TARGET_EPSILON_DEG
        ) ??
        DOLLY_ZOOM_PRESET_FOV_DEG[0]
    : DOLLY_ZOOM_PRESET_FOV_DEG.find(
        (preset) => preset > snappedCurrentFovDeg + DOLLY_TARGET_EPSILON_DEG
      ) ?? DOLLY_ZOOM_PRESET_FOV_DEG[DOLLY_ZOOM_PRESET_FOV_DEG.length - 1];
};
