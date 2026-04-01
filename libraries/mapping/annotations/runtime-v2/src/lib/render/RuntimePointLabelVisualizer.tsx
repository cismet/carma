import { useEffect, useMemo, useRef } from "react";
import {
  cartesian3FromGeographicCoordinate,
  projectGeographicCoordinateToScreen,
} from "@carma-mapping/engines/cesium/core";
import { useCesiumOverlayView } from "@carma-mapping/engines/cesium/react/interactions";
import { useCesiumSceneVisibilityIndex } from "@carma-mapping/engines/cesium/react/visibility";
import {
  computePointLabelLayout,
  resolvePointLabelLayoutConfig,
  usePointLabels,
  type LayoutPointInput,
  type PointLabelData,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";

import { runtimeMeasurementVisualDefaults } from "../config/measurementVisualDefaults";
import type { RuntimeScene } from "../types/runtimeScene.types";
import type { RuntimePointLabelRenderModel } from "./measurementRenderModels";
const toScreenPosition = (
  scene: RuntimeScene | null,
  coordinate: RuntimePointLabelRenderModel["coordinate"]
): CssPixelPosition | null =>
  projectGeographicCoordinateToScreen(scene, coordinate);

const POINT_STEM_START_DISTANCE_PX =
  runtimeMeasurementVisualDefaults.sizes.pointPixelSize / 2;
const SELECTED_POINT_STEM_START_DISTANCE_PX =
  runtimeMeasurementVisualDefaults.sizes.selectedPointPixelSize / 2;

type RuntimePointLabelVisualizerProps = {
  scene: RuntimeScene | null;
  labels: readonly RuntimePointLabelRenderModel[];
  blockLabelInteractions?: boolean;
};

export const RuntimePointLabelVisualizer = ({
  scene,
  labels,
  blockLabelInteractions = false,
}: RuntimePointLabelVisualizerProps) => {
  const registeredPointIdSetRef = useRef<Set<string>>(new Set());
  const overlayView = useCesiumOverlayView(scene);
  const cameraPitch = overlayView.derivedView?.pitch ?? 0;
  const layoutConfig = useMemo(
    () => resolvePointLabelLayoutConfig(undefined),
    []
  );
  const { registerPoints, unregisterPointIds, visibilityStateById } =
    useCesiumSceneVisibilityIndex(scene, {
      shouldTestVisibility: true,
      shouldTestOcclusion: true,
      viewportPaddingHorizontal: 12,
      viewportPaddingVertical: 8,
      occlusionToleranceMeters: 1.0,
    });

  useEffect(() => {
    const indexedPoints = labels.map((label) => ({
      id: label.id,
      positionECEF: cartesian3FromGeographicCoordinate(label.coordinate),
    }));
    registerPoints(indexedPoints);

    const nextIdSet = new Set(indexedPoints.map((point) => point.id));
    const removedIds: string[] = [];
    registeredPointIdSetRef.current.forEach((id) => {
      if (!nextIdSet.has(id)) {
        removedIds.push(id);
      }
    });

    if (removedIds.length > 0) {
      unregisterPointIds(removedIds);
    }

    registeredPointIdSetRef.current = nextIdSet;
  }, [labels, registerPoints, unregisterPointIds]);

  useEffect(() => {
    return () => {
      const ids = Array.from(registeredPointIdSetRef.current);
      if (ids.length > 0) {
        unregisterPointIds(ids);
      }
      registeredPointIdSetRef.current = new Set();
    };
  }, [unregisterPointIds]);

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
      cameraPitch,
      config: layoutConfig,
    });
  }, [cameraPitch, labels, layoutConfig, scene]);

  const pointLabels = useMemo<readonly PointLabelData[]>(
    () =>
      labels.map((label) => ({
        id: label.id,
        content: label.content,
        compactContent: label.markerContent ?? label.content,
        markerBackgroundColor: label.markerBackgroundColor,
        markerTextColor: label.markerTextColor,
        selected: label.selected,
        pitch: cameraPitch,
        labelAngleRad: layoutResult.placements[label.id]?.angleRad,
        labelDistance: layoutResult.placements[label.id]?.distance,
        labelAttach: layoutResult.placements[label.id]?.attach,
        hideLabelAndStem:
          Boolean(label.hideLabelAndStem) ||
          layoutResult.hiddenByLayout.has(label.id) ||
          (visibilityStateById[label.id]?.isHidden ?? false),
        hideMarker: true,
        stemStartDistance: label.selected
          ? SELECTED_POINT_STEM_START_DISTANCE_PX
          : POINT_STEM_START_DISTANCE_PX,
        isOccluded: visibilityStateById[label.id]?.isOccluded ?? false,
        isHidden: visibilityStateById[label.id]?.isHidden ?? false,
        labelStyle: "capsule",
        collapse: true,
        forceCollapse: true,
        attachOverlayClickHandlers: !blockLabelInteractions,
        markerOnlyPointerEvents: !blockLabelInteractions,
        onClick: label.onClick,
        onLongPress: label.onLongPress,
        longPressDurationMs: label.longPressDurationMs,
        getCanvasPosition: () => toScreenPosition(scene, label.coordinate),
      })),
    [
      cameraPitch,
      labels,
      layoutResult,
      blockLabelInteractions,
      scene,
      visibilityStateById,
    ]
  );

  usePointLabels([...pointLabels], true, undefined, undefined, {
    transitionDurationMs: layoutConfig.transitionDurationMs,
  });
  return null;
};
