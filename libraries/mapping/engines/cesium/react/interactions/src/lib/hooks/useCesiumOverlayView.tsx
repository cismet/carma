import { useEffect, useMemo, useState } from "react";

import {
  deriveView,
  readFromCesium,
  type ViewState,
  type DerivedView,
} from "@carma-mapping/engines-interop/view-state";
import { type Scene } from "@carma-cesium";
import {
  type Matrix4ConstructorArgs,
} from "@carma-mapping/engines/cesium/core";

import { useCesiumViewProjector } from "./useCesiumViewProjector";
const CESIUM_OVERLAY_VIEW_SOURCE_ID = "cesium-overlay-view";

export type CesiumOverlayViewSnapshot = {
  readonly commonViewState: ViewState | null;
  readonly derivedView: DerivedView | null;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly frameNumber: number | null;
};

const EMPTY_OVERLAY_VIEW_SNAPSHOT: CesiumOverlayViewSnapshot = {
  commonViewState: null,
  derivedView: null,
  viewportWidth: 0,
  viewportHeight: 0,
  frameNumber: null,
};

const hasSameViewOffset = (
  left: ViewState["intrinsics"]["viewOffset"],
  right: ViewState["intrinsics"]["viewOffset"]
): boolean =>
  left === right ||
  (left !== undefined &&
    right !== undefined &&
    left.fullWidth === right.fullWidth &&
    left.fullHeight === right.fullHeight &&
    left.offsetX === right.offsetX &&
    left.offsetY === right.offsetY &&
    left.width === right.width &&
    left.height === right.height);

const hasSameFrustum = (
  left: ViewState["intrinsics"]["frustum"],
  right: ViewState["intrinsics"]["frustum"]
): boolean =>
  left === right ||
  (left !== undefined &&
    right !== undefined &&
    left.near === right.near &&
    left.far === right.far);

const hasSameIntrinsics = (
  left: ViewState["intrinsics"],
  right: ViewState["intrinsics"]
): boolean =>
  left === right ||
  (left.fov === right.fov &&
    left.fovHorizontal === right.fovHorizontal &&
    hasSameViewOffset(left.viewOffset, right.viewOffset) &&
    hasSameFrustum(left.frustum, right.frustum));

const hasSameViewState = (
  left: ViewState | null,
  right: ViewState | null
): boolean => {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.anchor.x === right.anchor.x &&
    left.anchor.y === right.anchor.y &&
    left.anchor.z === right.anchor.z &&
    left.cameraPosition.x === right.cameraPosition.x &&
    left.cameraPosition.y === right.cameraPosition.y &&
    left.cameraPosition.z === right.cameraPosition.z &&
    left.orientation.x === right.orientation.x &&
    left.orientation.y === right.orientation.y &&
    left.orientation.z === right.orientation.z &&
    left.orientation.w === right.orientation.w &&
    hasSameIntrinsics(left.intrinsics, right.intrinsics)
  );
};

const hasSamePublishedSnapshot = (
  left: CesiumOverlayViewSnapshot,
  right: CesiumOverlayViewSnapshot
): boolean =>
  hasSameViewState(left.commonViewState, right.commonViewState) &&
  left.viewportWidth === right.viewportWidth &&
  left.viewportHeight === right.viewportHeight;

const readOverlayViewSnapshot = (
  scene: Scene | null,
  projector: ReturnType<typeof useCesiumViewProjector>
): CesiumOverlayViewSnapshot => {
  if (!scene || scene.isDestroyed()) {
    return EMPTY_OVERLAY_VIEW_SNAPSHOT;
  }

  const viewportState = projector.getViewState();
  const commonViewState = readFromCesium(scene, CESIUM_OVERLAY_VIEW_SOURCE_ID);
  const viewportWidth = Math.max(0, viewportState?.width ?? 0);
  const viewportHeight = Math.max(0, viewportState?.height ?? 0);

  return {
    commonViewState,
    derivedView: commonViewState
      ? deriveView(commonViewState, viewportWidth, viewportHeight)
      : null,
    viewportWidth,
    viewportHeight,
    frameNumber: viewportState?.frameNumber ?? null,
  };
};

const useCesiumOverlayViewSnapshot = (
  scene: Scene | null,
  projector: ReturnType<typeof useCesiumViewProjector>
): CesiumOverlayViewSnapshot => {
  const [snapshot, setSnapshot] = useState<CesiumOverlayViewSnapshot>(() =>
    readOverlayViewSnapshot(scene, projector)
  );

  useEffect(() => {
    setSnapshot((previousSnapshot) => {
      const nextSnapshot = readOverlayViewSnapshot(scene, projector);
      return hasSamePublishedSnapshot(previousSnapshot, nextSnapshot)
        ? previousSnapshot
        : nextSnapshot;
    });
  }, [projector, scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      setSnapshot((previousSnapshot) =>
        hasSamePublishedSnapshot(previousSnapshot, EMPTY_OVERLAY_VIEW_SNAPSHOT)
          ? previousSnapshot
          : EMPTY_OVERLAY_VIEW_SNAPSHOT
      );
      return;
    }

    const publishSnapshot = () => {
      setSnapshot((previousSnapshot) => {
        const nextSnapshot = readOverlayViewSnapshot(scene, projector);
        return hasSamePublishedSnapshot(previousSnapshot, nextSnapshot)
          ? previousSnapshot
          : nextSnapshot;
      });
    };

    publishSnapshot();

    const removePreRenderListener =
      scene.preRender.addEventListener(publishSnapshot);

    return () => {
      removePreRenderListener?.();
      setSnapshot((previousSnapshot) =>
        hasSamePublishedSnapshot(previousSnapshot, EMPTY_OVERLAY_VIEW_SNAPSHOT)
          ? previousSnapshot
          : EMPTY_OVERLAY_VIEW_SNAPSHOT
      );
    };
  }, [projector, scene]);

  return snapshot;
};

export const useCesiumOverlayView = (scene: Scene | null) => {
  const projector = useCesiumViewProjector(scene);
  const snapshot = useCesiumOverlayViewSnapshot(scene, projector);

  return useMemo(
    () => ({
      ...snapshot,
      projectWorldToScreen: projector.projectWorldToScreen,
      getViewProjectionMatrix: projector.getViewProjectionMatrix,
    }),
    [
      projector.getViewProjectionMatrix,
      projector.projectWorldToScreen,
      snapshot,
    ]
  );
};
