import React, { useEffect, useMemo } from "react";

import { useOverlay } from "../contexts/OverlayContext";
import { PointLabel } from "../components/PointLabel";

export interface PointLabelData {
  id: string;
  getCanvasPosition?: () => { x: number; y: number } | null; // Callback to get fresh screen coordinates
  pitch?: number; // Camera pitch in radians
  text: string;
  selected?: boolean;
  visible?: boolean;
  isOccluded?: boolean;
  isHidden?: boolean; // Hidden (outside viewport) vs occluded (behind geometry)
}

export const usePointLabels = (
  points: PointLabelData[],
  showLabels: boolean = true,
  getPitch?: () => number
) => {
  const { addOverlayElement, removeOverlayElement, clearOverlayElements } =
    useOverlay();

  // Create a stable reference for selection, visibility, occlusion, and hidden state
  const stateSignature = useMemo(
    () =>
      points
        .map(
          (p) =>
            `${p.id}:${p.text}:${p.selected}:${p.visible}:${p.isOccluded}:${p.isHidden}:${p.pitch}`
        )
        .join("|"),
    [points]
  );

  useEffect(() => {
    if (!showLabels) {
      clearOverlayElements();
      return;
    }

    // Add/update labels for all points using the React PointLabel component
    points.forEach((point) => {
      const labelId = `point-label-${point.id}`;

      // Use pitch from point data or fallback to getPitch callback
      const pitch = point.pitch ?? (getPitch ? getPitch() : -Math.PI / 4);

      addOverlayElement({
        id: labelId,
        getCanvasPosition: point.getCanvasPosition,
        content: React.createElement(PointLabel, {
          pitch,
          text: point.text,
          selected: point.selected,
          isOccluded: point.isOccluded,
        }),
        visible: point.visible !== false,
        isHidden: point.isHidden, // Pass hidden state to overlay
      });
    });

    return () => {
      points.forEach((point) => {
        removeOverlayElement(`point-label-${point.id}`);
      });
    };
  }, [
    points,
    showLabels,
    stateSignature,
    addOverlayElement,
    removeOverlayElement,
    clearOverlayElements,
    getPitch,
  ]);
};
