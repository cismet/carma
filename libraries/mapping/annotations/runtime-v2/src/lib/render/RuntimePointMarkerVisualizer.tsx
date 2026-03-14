import { useEffect, useMemo, useRef } from "react";

import {
  cartesian3FromGeographicCoordinate,
  projectGeographicCoordinateToScreen,
} from "@carma-mapping/engines/cesium/api";
import { useCesiumSceneVisibilityIndex } from "@carma-mapping/engines/cesium/react/visibility";
import {
  usePointLabels,
  type PointLabelData,
} from "@carma-providers/label-overlay";

import type { RuntimePointMarkerRenderModel } from "./measurementRenderModels";
import type { RuntimeScene } from "../types/runtimeScene.types";

type RuntimePointMarkerVisualizerProps = {
  scene: RuntimeScene | null;
  points: readonly RuntimePointMarkerRenderModel[];
};

export const RuntimePointMarkerVisualizer = ({
  scene,
  points,
}: RuntimePointMarkerVisualizerProps) => {
  const registeredPointIdSetRef = useRef<Set<string>>(new Set());
  const { registerPoints, unregisterPointIds, visibilityStateById } =
    useCesiumSceneVisibilityIndex(scene, {
      shouldTestVisibility: true,
      shouldTestOcclusion: true,
      viewportPaddingHorizontal: 12,
      viewportPaddingVertical: 8,
      occlusionToleranceMeters: 1.0,
    });

  useEffect(() => {
    const indexedPoints = points.map((point) => ({
      id: point.id,
      positionECEF: cartesian3FromGeographicCoordinate(point.coordinate),
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
  }, [points, registerPoints, unregisterPointIds]);

  useEffect(() => {
    return () => {
      const ids = Array.from(registeredPointIdSetRef.current);
      if (ids.length > 0) {
        unregisterPointIds(ids);
      }
      registeredPointIdSetRef.current = new Set();
    };
  }, [unregisterPointIds]);

  const markerLabels = useMemo<readonly PointLabelData[]>(
    () =>
      points.map((point) => ({
        id: `runtime-point-marker-${point.id}`,
        content: "",
        hideLabelAndStem: true,
        hideMarker: false,
        markerSize: point.pixelSize,
        markerStrokeWidth: point.outlineWidth,
        markerBackgroundColor: point.fill,
        markerTextColor: "transparent",
        visible: true,
        isOccluded: visibilityStateById[point.id]?.isOccluded ?? false,
        isHidden: visibilityStateById[point.id]?.isHidden ?? false,
        attachOverlayClickHandlers: false,
        markerOnlyPointerEvents: false,
        forceMarkerInteractionTarget: false,
        getCanvasPosition: () =>
          projectGeographicCoordinateToScreen(scene, point.coordinate),
      })),
    [points, scene, visibilityStateById]
  );

  usePointLabels([...markerLabels], true);

  return null;
};
