import { useCallback, useRef } from "react";

import { createInitialShadowSimulationState } from "@carma-mapping/shadow-simulation/core";

import { useAddonState } from "../../lib/AddonStateContext";
import { DEFAULT_CAPTURE_HEIGHT_METERS } from "./shadow-texture-camera";
import { isShadowTextureWorkflowActive } from "./shadow-texture-workflow-state";

export const useShadowTextureWorkflow = (
  backgroundVisible: boolean | undefined,
  setBackgroundVisible: (visible: boolean) => void
) => {
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const [textureState, setTextureState] = useAddonState("shadowTexture");
  const previousBackgroundVisible = useRef<boolean | null>(null);

  const isActive = useCallback(
    (requestedBackgroundVisible: boolean | undefined) =>
      isShadowTextureWorkflowActive(
        shadowState?.enabled === true,
        textureState?.shadowOnly === true,
        backgroundVisible,
        requestedBackgroundVisible
      ),
    [backgroundVisible, shadowState?.enabled, textureState?.shadowOnly]
  );

  const activate = useCallback(
    (requestedBackgroundVisible: boolean | undefined) => {
      if (
        requestedBackgroundVisible === undefined ||
        backgroundVisible === undefined
      ) {
        return;
      }
      previousBackgroundVisible.current ??= backgroundVisible;
      setBackgroundVisible(requestedBackgroundVisible);
      setTextureState((previous) => ({
        quality: previous?.quality ?? "4k",
        mode: previous?.mode ?? "sun-disc",
        captureProjection: previous?.captureProjection ?? "orthographic",
        cameraHeightMeters:
          previous?.cameraHeightMeters ?? DEFAULT_CAPTURE_HEIGHT_METERS,
        cameraHeightAdjusting: false,
        status: previous?.status ?? "idle",
        shadowOnly: true,
      }));
      setShadowState((previous) => ({
        ...(previous ?? createInitialShadowSimulationState(undefined)),
        enabled: true,
      }));
    },
    [backgroundVisible, setBackgroundVisible, setShadowState, setTextureState]
  );

  const toggle = useCallback(
    (requestedBackgroundVisible: boolean | undefined) => {
      if (isActive(requestedBackgroundVisible)) {
        setShadowState((previous) => ({
          ...(previous ?? createInitialShadowSimulationState(undefined)),
          enabled: false,
        }));
        setBackgroundVisible(previousBackgroundVisible.current ?? true);
        previousBackgroundVisible.current = null;
      } else {
        activate(requestedBackgroundVisible);
      }
    },
    [activate, isActive, setBackgroundVisible, setShadowState]
  );

  return { activate, toggle, isActive };
};
