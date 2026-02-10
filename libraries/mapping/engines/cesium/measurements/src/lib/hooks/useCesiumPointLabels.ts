import { useEffect, useMemo, useState } from "react";

import { SceneTransforms, defined, type Scene } from "@carma/cesium";

import {
  computePointLabelLayout,
  DEFAULT_POINT_LABEL_LAYOUT_CONFIG,
  formatNumberToEnclosed,
  resolvePointLabelLayoutConfig,
  usePointLabels,
  type LayoutPointInput,
  type PointLabelData,
  type PointLabelLayoutConfig,
  type PointLabelLayoutConfigOverrides,
  type PointLabelLayoutResult,
  type ScreenPoint,
} from "@carma-providers/label-overlay";

import type { PointMeasurementEntry } from "../types/MeasurementTypes";
import {
  isPointOccluded,
  isPointInViewport,
} from "../utils/occlusionDetection";
import { getCustomPointMeasurementName } from "../utils/measurementNaming";

export type CesiumLabelLayoutConfig = PointLabelLayoutConfig;
export type CesiumLabelLayoutConfigOverrides = PointLabelLayoutConfigOverrides;
export const DEFAULT_CESIUM_LABEL_LAYOUT_CONFIG =
  DEFAULT_POINT_LABEL_LAYOUT_CONFIG;

// Viewport padding constants for smooth label transitions
const VIEWPORT_PADDING_HORIZONTAL = 100; // pixels
const VIEWPORT_PADDING_VERTICAL = 50; // pixels

const EMPTY_LAYOUT_RESULT: PointLabelLayoutResult = {
  placements: {},
  hiddenByLayout: new Set<string>(),
};

const areBooleanMapsDifferent = (
  prev: Record<string, boolean>,
  next: Record<string, boolean>,
  ids: string[]
): boolean => ids.some((id) => Boolean(prev[id]) !== Boolean(next[id]));

const areScreenPointMapsDifferent = (
  prev: Record<string, ScreenPoint>,
  next: Record<string, ScreenPoint>,
  ids: string[]
): boolean =>
  ids.some((id) => {
    const prevPoint = prev[id];
    const nextPoint = next[id];
    if (!prevPoint && !nextPoint) return false;
    if (!prevPoint || !nextPoint) return true;
    return prevPoint.x !== nextPoint.x || prevPoint.y !== nextPoint.y;
  });

const formatPointLabelText = (
  pointIndex: number,
  pointHeight: number,
  referenceElevation: number,
  pointName?: string
): string => {
  const elevationText = `${(pointHeight - referenceElevation).toFixed(2)}m`;
  const customPointName = getCustomPointMeasurementName(pointName);
  if (customPointName) {
    return `${customPointName} ${elevationText}`;
  }

  return `${formatNumberToEnclosed(pointIndex + 1)} ${elevationText}`;
};

export const useCesiumPointLabels = (
  scene: Scene | null,
  points: PointMeasurementEntry[],
  showLabels: boolean,
  referenceElevation: number = 0,
  onPointClick?: (pointId: string) => void,
  layoutConfigOverrides?: CesiumLabelLayoutConfigOverrides
) => {
  const [occlusionResults, setOcclusionResults] = useState<
    Record<string, boolean>
  >({});
  const [hiddenResults, setHiddenResults] = useState<Record<string, boolean>>(
    {}
  );
  const [projectedPositions, setProjectedPositions] = useState<
    Record<string, ScreenPoint>
  >({});
  const [cameraPitch, setCameraPitch] = useState<number>(-Math.PI / 4);

  const layoutConfig = useMemo(
    () => resolvePointLabelLayoutConfig(layoutConfigOverrides),
    [layoutConfigOverrides]
  );

  // Keep camera pitch in sync while the camera moves.
  useEffect(() => {
    if (!scene || scene.isDestroyed() || !showLabels) return;

    const updatePitch = () => {
      const currentPitch = scene.camera.pitch;
      setCameraPitch((prev) =>
        Math.abs(currentPitch - prev) > 0.001 ? currentPitch : prev
      );
    };

    updatePitch();
    const removePostRenderListener =
      scene.postRender.addEventListener(updatePitch);

    return () => {
      if (removePostRenderListener) {
        removePostRenderListener();
      }
    };
  }, [scene, showLabels]);

  // Cesium-specific visibility and occlusion detection.
  useEffect(() => {
    if (!scene || scene.isDestroyed() || !showLabels) return;

    const checkVisibilityAndOcclusion = () => {
      const newOcclusionResults: Record<string, boolean> = {};
      const newHiddenResults: Record<string, boolean> = {};
      const newProjectedPositions: Record<string, ScreenPoint> = {};

      points.forEach((point) => {
        const canvasPosition = SceneTransforms.worldToWindowCoordinates(
          scene,
          point.geometryECEF
        );

        if (!defined(canvasPosition)) {
          newHiddenResults[point.id] = true;
          newOcclusionResults[point.id] = false;
          return;
        }

        const inViewport = isPointInViewport(
          canvasPosition,
          scene.canvas.clientWidth,
          scene.canvas.clientHeight,
          VIEWPORT_PADDING_HORIZONTAL,
          VIEWPORT_PADDING_VERTICAL
        );

        if (!inViewport) {
          newHiddenResults[point.id] = true;
          newOcclusionResults[point.id] = false;
          return;
        }

        newHiddenResults[point.id] = false;
        newProjectedPositions[point.id] = {
          x: canvasPosition.x,
          y: canvasPosition.y,
        };

        newOcclusionResults[point.id] = isPointOccluded(
          scene,
          point.geometryECEF,
          canvasPosition,
          1.0
        );
      });

      const pointIds = points.map((point) => point.id);

      setOcclusionResults((prev) =>
        areBooleanMapsDifferent(prev, newOcclusionResults, pointIds)
          ? newOcclusionResults
          : prev
      );
      setHiddenResults((prev) =>
        areBooleanMapsDifferent(prev, newHiddenResults, pointIds)
          ? newHiddenResults
          : prev
      );
      setProjectedPositions((prev) =>
        areScreenPointMapsDifferent(prev, newProjectedPositions, pointIds)
          ? newProjectedPositions
          : prev
      );
    };

    const removePostRenderListener = scene.postRender.addEventListener(
      checkVisibilityAndOcclusion
    );

    checkVisibilityAndOcclusion();

    return () => {
      if (removePostRenderListener) {
        removePostRenderListener();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, points, showLabels]);

  const layoutResult = useMemo((): PointLabelLayoutResult => {
    if (!scene || scene.isDestroyed()) {
      return EMPTY_LAYOUT_RESULT;
    }

    const layoutPoints: LayoutPointInput[] = points
      .map((point, index) => {
        const anchor = projectedPositions[point.id];
        if (!anchor || hiddenResults[point.id]) return null;

        return {
          id: point.id,
          selected: Boolean(point.isSelected),
          anchor,
          text: formatPointLabelText(
            index,
            point.geometryWGS84.height,
            referenceElevation,
            point.name
          ),
          index,
        };
      })
      .filter((point): point is LayoutPointInput => Boolean(point));

    return computePointLabelLayout({
      points: layoutPoints,
      viewportWidth: scene.canvas.clientWidth,
      viewportHeight: scene.canvas.clientHeight,
      cameraPitch,
      config: layoutConfig,
    });
  }, [
    scene,
    points,
    projectedPositions,
    hiddenResults,
    referenceElevation,
    layoutConfig,
    cameraPitch,
  ]);

  const pointLabelData: PointLabelData[] = useMemo(
    () =>
      points.map((point, index) => ({
        id: point.id,
        getCanvasPosition: () => {
          if (!scene || scene.isDestroyed()) return null;
          const canvasPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            point.geometryECEF
          );
          return defined(canvasPosition)
            ? { x: canvasPosition.x, y: canvasPosition.y }
            : null;
        },
        pitch: cameraPitch,
        labelAngleRad: layoutResult.placements[point.id]?.angleRad,
        labelDistance: layoutResult.placements[point.id]?.distance,
        labelAttach: layoutResult.placements[point.id]?.attach,
        anchorSwitchTransitionMs: layoutConfig.anchorSwitchTransitionMs,
        hideLabelAndStem: layoutResult.hiddenByLayout.has(point.id),
        text: formatPointLabelText(
          index,
          point.geometryWGS84.height,
          referenceElevation,
          point.name
        ),
        selected: point.isSelected,
        visible: true,
        isOccluded: occlusionResults[point.id] || false,
        isHidden: hiddenResults[point.id] || false,
        onClick: onPointClick ? () => onPointClick(point.id) : undefined,
      })),
    [
      points,
      referenceElevation,
      occlusionResults,
      hiddenResults,
      scene,
      cameraPitch,
      layoutConfig.anchorSwitchTransitionMs,
      layoutResult,
      onPointClick,
    ]
  );

  usePointLabels(pointLabelData, showLabels);
};

export default useCesiumPointLabels;
