import React, { useEffect, useMemo } from "react";

import { useLabelOverlay } from "./useLabelOverlay";
import {
  PointLabel,
  type PointLabelAttach,
  type PointLabelStyleProps,
} from "./components/PointLabel";

export interface PointLabelData {
  id: string;
  getCanvasPosition?: () => { x: number; y: number } | null;
  pitch?: number;
  labelAngleRad?: number;
  labelDistance?: number;
  labelAttach?: PointLabelAttach;
  hideLabelAndStem?: boolean;
  text: string;
  content?: React.ReactNode;
  contentSignature?: string;
  selected?: boolean;
  visible?: boolean;
  isOccluded?: boolean;
  isHidden?: boolean;
  onClick?: () => void;
}

export type PointLabelLayoutOptions = {
  transitionDurationMs?: number;
};

export const usePointLabels = (
  points: PointLabelData[],
  showLabels: boolean = true,
  getPitch?: () => number,
  styleProps?: PointLabelStyleProps,
  layoutOptions?: PointLabelLayoutOptions
) => {
  const {
    addLabelOverlayElement,
    removeLabelOverlayElement,
    clearLabelOverlayElements,
  } = useLabelOverlay();

  // Create a stable reference for selection, visibility, occlusion, and hidden state
  const stateSignature = useMemo(
    () =>
      points
        .map(
          (p) =>
            `${p.id}:${p.text}:${p.selected}:${p.visible}:${p.isOccluded}:${
              p.isHidden
            }:${p.contentSignature ?? ""}:${p.pitch}:${Boolean(p.onClick)}:${
              p.labelAngleRad
            }:${p.labelDistance}:${p.labelAttach}:${p.hideLabelAndStem}`
        )
        .join("|") + `:transition:${layoutOptions?.transitionDurationMs ?? ""}`,
    [points, layoutOptions?.transitionDurationMs]
  );

  useEffect(() => {
    if (!showLabels) {
      clearLabelOverlayElements();
      return;
    }

    // Add/update labels for all points using the React PointLabel component
    points.forEach((point) => {
      const labelId = `point-label-${point.id}`;

      // Use pitch from point data or fallback to getPitch callback
      const pitch = point.pitch ?? (getPitch ? getPitch() : -Math.PI / 4);

      addLabelOverlayElement({
        id: labelId,
        getCanvasPosition: point.getCanvasPosition,
        content: React.createElement(PointLabel, {
          pitch,
          labelAngleRad: point.labelAngleRad,
          labelDistance: point.labelDistance,
          labelAttach: point.labelAttach,
          transitionDurationMs: layoutOptions?.transitionDurationMs,
          hideLabelAndStem: point.hideLabelAndStem,
          text: point.content ?? point.text,
          selected: point.selected,
          isOccluded: point.isOccluded,
          onClick: point.onClick,
          ...styleProps,
        }),
        visible: point.visible !== false,
        isHidden: point.isHidden,
        onClick: point.onClick,
      });
    });

    return () => {
      points.forEach((point) => {
        removeLabelOverlayElement(`point-label-${point.id}`);
      });
    };
  }, [
    points,
    showLabels,
    stateSignature,
    addLabelOverlayElement,
    removeLabelOverlayElement,
    clearLabelOverlayElements,
    getPitch,
    styleProps,
    layoutOptions?.transitionDurationMs,
  ]);
};
