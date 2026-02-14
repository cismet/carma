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
  markerSize?: number;
  markerStrokeWidth?: number;
  stemReferenceMarkerSize?: number;
  text: string;
  content?: React.ReactNode;
  contentSignature?: string;
  selected?: boolean;
  visible?: boolean;
  isOccluded?: boolean;
  isHidden?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onLongPress?: () => void;
  longPressDurationMs?: number;
  onHoverChange?: (hovered: boolean) => void;
  onMarkerDragStart?: (clientX: number, clientY: number) => void;
  onMarkerDragMove?: (clientX: number, clientY: number) => void;
  onMarkerDragEnd?: () => void;
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
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

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
            }:${p.labelDistance}:${p.labelAttach}:${p.hideLabelAndStem}:${
              p.markerSize
            }:${p.markerStrokeWidth}:${p.stemReferenceMarkerSize}:${Boolean(
              p.onHoverChange
            )}:${Boolean(p.onDoubleClick)}:${Boolean(p.onLongPress)}:${
              p.longPressDurationMs
            }:${Boolean(p.onMarkerDragStart)}:${Boolean(
              p.onMarkerDragMove
            )}:${Boolean(p.onMarkerDragEnd)}`
        )
        .join("|") + `:transition:${layoutOptions?.transitionDurationMs ?? ""}`,
    [points, layoutOptions?.transitionDurationMs]
  );

  useEffect(() => {
    if (!showLabels) {
      points.forEach((point) => {
        removeLabelOverlayElement(`point-label-${point.id}`);
      });
      return;
    }

    // Add/update labels for all points using the React PointLabel component
    points.forEach((point) => {
      const labelId = `point-label-${point.id}`;

      // Use pitch from point data or fallback to getPitch callback
      const pitch = point.pitch ?? (getPitch ? getPitch() : -Math.PI / 4);

      addLabelOverlayElement({
        id: labelId,
        zIndex: 20,
        getCanvasPosition: point.getCanvasPosition,
        content: React.createElement(PointLabel, {
          pitch,
          labelAngleRad: point.labelAngleRad,
          labelDistance: point.labelDistance,
          labelAttach: point.labelAttach,
          transitionDurationMs: layoutOptions?.transitionDurationMs,
          hideLabelAndStem: point.hideLabelAndStem,
          markerSize: point.markerSize,
          markerStrokeWidth: point.markerStrokeWidth,
          stemReferenceMarkerSize: point.stemReferenceMarkerSize,
          text: point.content ?? point.text,
          selected: point.selected,
          isOccluded: point.isOccluded,
          onClick: point.onClick,
          onDoubleClick: point.onDoubleClick,
          onLongPress: point.onLongPress,
          longPressDurationMs: point.longPressDurationMs,
          onHoverChange: point.onHoverChange,
          onMarkerDragStart: point.onMarkerDragStart,
          onMarkerDragMove: point.onMarkerDragMove,
          onMarkerDragEnd: point.onMarkerDragEnd,
          ...styleProps,
        }),
        visible: point.visible !== false,
        isHidden: point.isHidden,
        onClick: point.onClick,
        onDoubleClick: point.onDoubleClick,
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
    getPitch,
    styleProps,
    layoutOptions?.transitionDurationMs,
  ]);
};
