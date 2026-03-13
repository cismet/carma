import { useEffect, useMemo, useRef, useState } from "react";

import { projectGeographicCoordinateToScreen } from "@carma-mapping/annotations/cesium";
import {
  computePointLabelLayout,
  resolvePointLabelLayoutConfig,
  usePointLabels,
  type LayoutPointInput,
  type PointLabelData,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma/units/types";

import type { RuntimePointLabelRenderModel } from "./measurementRenderModels";
import type { RuntimeScene } from "../types/runtimeScene.types";

const toScreenPosition = (
  scene: RuntimeScene | null,
  coordinate: RuntimePointLabelRenderModel["coordinate"]
): CssPixelPosition | null =>
  projectGeographicCoordinateToScreen(scene, coordinate);

type RuntimePointLabelVisualizerProps = {
  scene: RuntimeScene | null;
  labels: readonly RuntimePointLabelRenderModel[];
  pointQueryActive?: boolean;
};

export const RuntimePointLabelVisualizer = ({
  scene,
  labels,
  pointQueryActive = false,
}: RuntimePointLabelVisualizerProps) => {
  const [cameraState, setCameraState] = useState({
    pitch: -Math.PI / 4,
    syncToken: 0,
  });
  const cameraSyncFrameRef = useRef<number | null>(null);
  const layoutConfig = useMemo(
    () => resolvePointLabelLayoutConfig(undefined),
    []
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      return;
    }

    const camera = scene.camera;
    const queueCameraSync = () => {
      if (cameraSyncFrameRef.current !== null) {
        return;
      }

      cameraSyncFrameRef.current = window.requestAnimationFrame(() => {
        cameraSyncFrameRef.current = null;
        setCameraState((previous) => ({
          pitch: camera.pitch,
          syncToken: previous.syncToken + 1,
        }));
      });
    };

    queueCameraSync();
    const removeChangedListener =
      camera.changed.addEventListener(queueCameraSync);
    const removeMoveEndListener =
      camera.moveEnd.addEventListener(queueCameraSync);

    return () => {
      if (cameraSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(cameraSyncFrameRef.current);
        cameraSyncFrameRef.current = null;
      }
      removeChangedListener?.();
      removeMoveEndListener?.();
    };
  }, [scene]);

  const layoutResult = useMemo<PointLabelLayoutResult>(() => {
    if (!scene || scene.isDestroyed()) {
      return {
        placements: {},
        hiddenByLayout: new Set<string>(),
        collapsedToCompact: new Set<string>(),
      };
    }

    const layoutPoints = labels
      .map<LayoutPointInput | null>((label, index) => {
        const anchor = toScreenPosition(scene, label.coordinate);

        if (!anchor) {
          return null;
        }

        return {
          id: label.id,
          anchor,
          text: label.content,
          compactText:
            typeof label.markerContent === "string"
              ? label.markerContent
              : label.content,
          index,
          ...(label.selected
            ? {
                layoutPriority: Number.MAX_SAFE_INTEGER,
                lockPreferredPlacement: true,
              }
            : {}),
        };
      })
      .filter((point): point is LayoutPointInput => point !== null);

    return computePointLabelLayout({
      points: layoutPoints,
      viewportWidth: scene.canvas.clientWidth,
      viewportHeight: scene.canvas.clientHeight,
      cameraPitch: cameraState.pitch,
      config: layoutConfig,
    });
  }, [cameraState, labels, layoutConfig, scene]);

  const pointLabels = useMemo<readonly PointLabelData[]>(
    () =>
      labels.map((label) => ({
        id: label.id,
        content: label.content,
        compactContent: label.markerContent ?? label.content,
        markerBackgroundColor: label.markerBackgroundColor,
        markerTextColor: label.markerTextColor,
        selected: label.selected,
        pitch: cameraState.pitch,
        labelAngleRad: layoutResult.placements[label.id]?.angleRad,
        labelDistance: layoutResult.placements[label.id]?.distance,
        labelAttach: layoutResult.placements[label.id]?.attach,
        hideLabelAndStem:
          Boolean(label.hideLabelAndStem) ||
          layoutResult.hiddenByLayout.has(label.id),
        hideMarker: true,
        labelStyle: "capsule",
        collapse: true,
        forceCollapse: true,
        attachOverlayClickHandlers: !pointQueryActive,
        markerOnlyPointerEvents: !pointQueryActive,
        onClick: label.onClick,
        getCanvasPosition: () => toScreenPosition(scene, label.coordinate),
      })),
    [cameraState.pitch, labels, layoutResult, pointQueryActive, scene]
  );

  usePointLabels([...pointLabels], true, undefined, undefined, {
    transitionDurationMs: layoutConfig.transitionDurationMs,
  });
  return null;
};
