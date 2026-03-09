import React, { useEffect, useMemo, useRef } from "react";
import type { CssPixelPosition } from "@carma/units/types";

import { useLabelOverlay } from "./useLabelOverlay";
import {
  PointLabel,
  type PointLabelAttach,
  type PointLabelStyleProps,
} from "./components/PointLabel";

export interface PointLabelData {
  id: string;
  getCanvasPosition?: () => CssPixelPosition | null;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  textColor?: string;
  textBackgroundColor?: string;
  selectedBackgroundColor?: string;
  hoverBackgroundColor?: string;
  pitch?: number;
  labelAngleRad?: number;
  labelDistance?: number;
  labelAttach?: PointLabelAttach;
  hideLabelAndStem?: boolean;
  hideMarker?: boolean;
  markerSize?: number;
  markerStrokeWidth?: number;
  stemReferenceMarkerSize?: number;
  stemStartDistance?: number;
  markerContent?: React.ReactNode;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  compactContent?: React.ReactNode;
  compactBorderless?: boolean;
  labelStyle?: "auto" | "capsule";
  collapse?: boolean;
  forceCollapse?: boolean;
  fullBorder?: boolean;
  resizeMode?: "none" | "fast-grow-slow-shrink";
  content: React.ReactNode;
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
  markerOnlyPointerEvents?: boolean;
  attachOverlayClickHandlers?: boolean;
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
  const previousPointSignatureByIdRef = useRef<Map<string, string>>(new Map());

  const pointSignatureById = useMemo(
    () =>
      new Map(
        points.map((p) => [
          p.id,
          `${p.id}:${String(p.content)}:${p.selected}:${p.visible}:${
            p.isOccluded
          }:${p.isHidden}:${p.contentSignature ?? ""}:${p.pitch}:${Boolean(
            p.onClick
          )}:${p.labelAngleRad}:${p.labelDistance}:${p.labelAttach}:${
            p.hideLabelAndStem
          }:${p.hideMarker}:${p.markerSize}:${p.markerStrokeWidth}:${
            p.stemReferenceMarkerSize
          }:${p.stemStartDistance}:${String(p.markerContent)}:${
            p.markerBackgroundColor
          }:${p.markerTextColor}:${String(p.compactContent)}:${Boolean(
            p.compactBorderless
          )}:${p.labelStyle}:${p.collapse}:${p.forceCollapse}:${p.fullBorder}:${
            p.resizeMode ?? "none"
          }:${p.fontSize ?? ""}:${p.fontFamily ?? ""}:${p.fontWeight ?? ""}:${
            p.textColor ?? ""
          }:${p.textBackgroundColor ?? ""}:${p.selectedBackgroundColor ?? ""}:${
            p.hoverBackgroundColor ?? ""
          }:${Boolean(p.onHoverChange)}:${Boolean(p.onDoubleClick)}:${Boolean(
            p.onLongPress
          )}:${p.longPressDurationMs}:${Boolean(p.onMarkerDragStart)}:${Boolean(
            p.onMarkerDragMove
          )}:${Boolean(p.onMarkerDragEnd)}:${Boolean(
            p.markerOnlyPointerEvents
          )}:${Boolean(p.attachOverlayClickHandlers)}:transition:${
            layoutOptions?.transitionDurationMs ?? ""
          }`,
        ])
      ),
    [points, layoutOptions?.transitionDurationMs]
  );

  const pointIndexById = useMemo(
    () => new Map(points.map((point) => [point.id, point])),
    [points]
  );

  useEffect(() => {
    if (!showLabels) {
      previousPointSignatureByIdRef.current.forEach((_, pointId) => {
        removeLabelOverlayElement(`point-label-${pointId}`);
      });
      previousPointSignatureByIdRef.current.clear();
      return;
    }

    const nextSignatureById = new Map<string, string>();
    pointIndexById.forEach((point, pointId) => {
      const nextSignature = pointSignatureById.get(pointId) ?? "";
      nextSignatureById.set(pointId, nextSignature);
      const labelId = `point-label-${point.id}`;

      // Use pitch from point data or fallback to getPitch callback
      const pitch = point.pitch ?? (getPitch ? getPitch() : -Math.PI / 4);

      const attachOverlayClickHandlers =
        point.attachOverlayClickHandlers ?? true;
      const pointStyleProps: PointLabelStyleProps = {
        ...styleProps,
        ...(point.fontSize !== undefined ? { fontSize: point.fontSize } : {}),
        ...(point.fontFamily !== undefined
          ? { fontFamily: point.fontFamily }
          : {}),
        ...(point.fontWeight !== undefined
          ? { fontWeight: point.fontWeight }
          : {}),
        ...(point.textColor !== undefined
          ? { textColor: point.textColor }
          : {}),
        ...(point.textBackgroundColor !== undefined
          ? { textBackgroundColor: point.textBackgroundColor }
          : {}),
        ...(point.selectedBackgroundColor !== undefined
          ? { selectedBackgroundColor: point.selectedBackgroundColor }
          : {}),
        ...(point.hoverBackgroundColor !== undefined
          ? { hoverBackgroundColor: point.hoverBackgroundColor }
          : {}),
      };
      addLabelOverlayElement({
        id: labelId,
        zIndex: 20,
        getCanvasPosition: point.getCanvasPosition,
        content: React.createElement(PointLabel, {
          pointId: point.id,
          pitch,
          labelAngleRad: point.labelAngleRad,
          labelDistance: point.labelDistance,
          labelAttach: point.labelAttach,
          transitionDurationMs: layoutOptions?.transitionDurationMs,
          hideLabelAndStem: point.hideLabelAndStem,
          hideMarker: point.hideMarker,
          markerSize: point.markerSize,
          markerStrokeWidth: point.markerStrokeWidth,
          stemReferenceMarkerSize: point.stemReferenceMarkerSize,
          stemStartDistance: point.stemStartDistance,
          markerContent: point.markerContent,
          markerBackgroundColor: point.markerBackgroundColor,
          markerTextColor: point.markerTextColor,
          compactContent: point.compactContent,
          compactBorderless: point.compactBorderless,
          labelStyle: point.labelStyle,
          collapse: point.collapse,
          forceCollapse: point.forceCollapse,
          fullBorder: point.fullBorder,
          resizeMode: point.resizeMode,
          content: point.content,
          selected: point.selected,
          isOccluded: point.isOccluded,
          onClick: point.onClick,
          onDoubleClick: point.onDoubleClick,
          onLongPress: point.onLongPress,
          longPressDurationMs: point.longPressDurationMs,
          onHoverChange: point.onHoverChange,
          markerOnlyPointerEvents: point.markerOnlyPointerEvents,
          onMarkerDragStart: point.onMarkerDragStart,
          onMarkerDragMove: point.onMarkerDragMove,
          onMarkerDragEnd: point.onMarkerDragEnd,
          ...pointStyleProps,
        }),
        visible: point.visible !== false,
        isHidden: point.isHidden,
        onClick: attachOverlayClickHandlers ? point.onClick : undefined,
        onDoubleClick: attachOverlayClickHandlers
          ? point.onDoubleClick
          : undefined,
      });
    });

    previousPointSignatureByIdRef.current.forEach((_, previousPointId) => {
      if (nextSignatureById.has(previousPointId)) return;
      removeLabelOverlayElement(`point-label-${previousPointId}`);
    });
    previousPointSignatureByIdRef.current = nextSignatureById;
  }, [
    showLabels,
    pointIndexById,
    pointSignatureById,
    addLabelOverlayElement,
    removeLabelOverlayElement,
    getPitch,
    styleProps,
    layoutOptions?.transitionDurationMs,
  ]);

  useEffect(
    () => () => {
      previousPointSignatureByIdRef.current.forEach((_, pointId) => {
        removeLabelOverlayElement(`point-label-${pointId}`);
      });
      previousPointSignatureByIdRef.current.clear();
    },
    [removeLabelOverlayElement]
  );
};
