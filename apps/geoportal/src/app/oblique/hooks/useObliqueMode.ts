import { useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";

import { type Viewer, type Scene } from "cesium";

import {
  useCesiumContext,
  useFovWheelZoom,
  useCesiumCameraForceOblique,
} from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../../store/slices/ui";
import { useObliqueDataContext } from "./useObliqueDataContext";
import { enterObliqueMode, leaveObliqueMode } from "../utils/cameraUtils";

export interface ObliqueModeOptions {
  fixedPitch?: number;
  fixedHeight?: number;
  minFov?: number;
  maxFov?: number;
  headingOffset?: number;
}

const viewerPreUpdateHandlers = new WeakMap<Viewer, (scene: Scene) => void>();

export function useObliqueMode(options: ObliqueModeOptions = {}) {
  const contextOptions = useObliqueDataContext();
  const fixedPitch = options.fixedPitch ?? contextOptions.fixedPitch;
  const fixedHeight = options.fixedHeight ?? contextOptions.fixedHeight;
  const minFov = options.minFov ?? contextOptions.minFov;
  const maxFov = options.maxFov ?? contextOptions.maxFov;
  const headingOffset = options.headingOffset ?? contextOptions.headingOffset;

  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef, viewerAnimationMapRef } = useCesiumContext();
  const originalFovRef = useRef<number | null>(null);
  const leaveFovAnimationRef = useRef<(() => void) | null>(null);

  const wheelZoomOptions = useMemo(
    () => ({
      minFov,
      maxFov,
    }),
    [minFov, maxFov]
  );

  const { setEnabled: setWheelZoomEnabled } = useFovWheelZoom(
    viewerRef,
    isObliqueMode,
    wheelZoomOptions
  );

  const { enableCameraForceOblique, disableCameraForceOblique } =
    useCesiumCameraForceOblique(viewerRef, fixedPitch, fixedHeight);

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    const viewer = viewerRef.current;
    const viewerAnimationMap = viewerAnimationMapRef.current;
    const cameraController = viewer.scene.screenSpaceCameraController;

    let leaveFovAnimation: (() => void) | null = null;

    if (leaveFovAnimationRef.current) {
      leaveFovAnimationRef.current();
      leaveFovAnimationRef.current = null;
    }

    cameraController.enableRotate = true;
    cameraController.enableTilt = true;
    cameraController.enableTranslate = true;

    setWheelZoomEnabled(isObliqueMode);

    if (isObliqueMode) {
      console.debug("entering Oblique Mode");
      enterObliqueMode(
        viewer,
        viewerAnimationMap,
        originalFovRef,
        fixedPitch,
        fixedHeight,
        () => {
          enableCameraForceOblique();
          viewer.scene.requestRender();
        }
      );
    } else {
      console.debug("leaving Oblique Mode", originalFovRef.current);
      leaveObliqueMode(
        viewer,
        viewerAnimationMap,
        originalFovRef,
        leaveFovAnimationRef,
        () => {
          disableCameraForceOblique();
          viewer.scene.requestRender();
        }
      );
    }

    return () => {
      if (viewerPreUpdateHandlers.has(viewer)) {
        const handlerToRemove = viewerPreUpdateHandlers.get(viewer);
        viewer.scene.preUpdate.removeEventListener(handlerToRemove!);
        viewerPreUpdateHandlers.delete(viewer);
      }
      if (leaveFovAnimation) {
        leaveFovAnimation();
      }
      setWheelZoomEnabled(false);
    };
  }, [
    isObliqueMode,
    viewerRef,
    viewerAnimationMapRef,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    setWheelZoomEnabled,
    enableCameraForceOblique,
    disableCameraForceOblique,
  ]);

  return {
    isObliqueMode,
  };
}

export default useObliqueMode;
