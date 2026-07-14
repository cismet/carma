import React, { type CSSProperties, useEffect, useMemo, useRef } from "react";

import { MINUS_PI_OVER_FOUR } from "@carma-commons/math";
import type { CssPixelPosition } from "@carma-units";

import {
  PointLabel,
  type PointLabelStyleProps,
  type PointLabelStyle,
} from "./components/PointLabel";
import { labelOverlayLayerDefaults } from "./overlayAffordanceDefaults";
import { getOverlayReferenceSignature } from "./overlayReferenceSignature";
import type {
  PointLabelAnchorKind,
  PointLabelOcclusionMode,
} from "./core/pointLabelAnchorSemantics";
import type { PointLabelAttach } from "./core/pointLabelAttach";
import { useLabelOverlay } from "./useLabelOverlay";
export interface PointLabelData {
  id: string;
  getCanvasPosition?: () => CssPixelPosition | null;
  anchorKind?: PointLabelAnchorKind;
  occlusionMode?: PointLabelOcclusionMode;
  zIndex?: number;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  markerCursor?: CSSProperties["cursor"];
  labelCursor?: CSSProperties["cursor"];
  textColor?: string;
  textBackgroundColor?: string;
  selectedBackgroundColor?: string;
  selectedTextColor?: string;
  selectedGlowColor?: string;
  selectedGlowRadiusPx?: number;
  preserveFillOnSelection?: boolean;
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
  nodeContent?: React.ReactNode;
  badgeContent?: React.ReactNode;
  markerContent?: React.ReactNode;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  labelStyle?: PointLabelStyle;
  collapse?: boolean;
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
  onHoverChange?: (
    hovered: boolean,
    anchorPosition?: CssPixelPosition | null
  ) => void;
  markerOnlyPointerEvents?: boolean;
  attachOverlayClickHandlers?: boolean;
  forceMarkerInteractionTarget?: boolean;
  onMarkerDragStart?: (clientX: number, clientY: number) => void;
  onMarkerDragMove?: (clientX: number, clientY: number) => void;
  onMarkerDragEnd?: () => void;
}

export type PointLabelLayoutOptions = {
  transitionDurationMs?: number;
};

const resolvePointNodeContent = (
  point: Pick<PointLabelData, "nodeContent" | "markerContent">
) => point.nodeContent ?? point.markerContent;

const resolvePointBadgeContent = (
  point: Pick<PointLabelData, "badgeContent">
) => point.badgeContent;

const buildPointOverlayUpdatePosition =
  (getCanvasPosition: PointLabelData["getCanvasPosition"]) =>
  (elementDiv: HTMLElement) => {
    const canvasPosition = getCanvasPosition?.();
    if (!canvasPosition) {
      return false;
    }

    elementDiv.style.position = "absolute";
    elementDiv.style.left = `${canvasPosition.x}px`;
    elementDiv.style.top = `${canvasPosition.y}px`;
    elementDiv.style.transform = "translate(-50%, -50%)";
    return true;
  };

const getPointStyleSignature = (
  styleProps: PointLabelStyleProps | undefined
): string =>
  [
    styleProps?.markerCursor ?? "",
    styleProps?.labelCursor ?? "",
    styleProps?.textColor ?? "",
    styleProps?.textBackgroundColor ?? "",
    styleProps?.selectedBackgroundColor ?? "",
    styleProps?.selectedTextColor ?? "",
    styleProps?.selectedGlowColor ?? "",
    styleProps?.selectedGlowRadiusPx ?? "",
    String(styleProps?.preserveFillOnSelection ?? false),
    styleProps?.hoverBackgroundColor ?? "",
    styleProps?.mixBlendMode ?? "",
    styleProps?.lineWidth ?? "",
    styleProps?.lineColor ?? "",
    styleProps?.markerSize ?? "",
    styleProps?.markerStrokeWidth ?? "",
    styleProps?.stemReferenceMarkerSize ?? "",
    styleProps?.stemStartDistance ?? "",
    getOverlayReferenceSignature(
      styleProps?.nodeContent ?? styleProps?.markerContent
    ),
    styleProps?.markerBackgroundColor ?? "",
    styleProps?.markerTextColor ?? "",
    getOverlayReferenceSignature(styleProps?.badgeContent),
    styleProps?.labelStyle ?? "",
    String(styleProps?.collapse ?? false),
    styleProps?.labelDistance ?? "",
  ].join(":");

const getPointContentSignature = (
  point: PointLabelData,
  pointStyleSignature: string,
  transitionDurationMs: number | undefined
): string =>
  `${point.id}:${
    point.contentSignature ?? getOverlayReferenceSignature(point.content)
  }:${point.selected}:${point.isOccluded}:${point.pitch}:${
    point.labelAngleRad
  }:${point.labelDistance}:${point.labelAttach}:${point.hideLabelAndStem}:${
    point.hideMarker
  }:${point.markerSize}:${point.markerStrokeWidth}:${
    point.stemReferenceMarkerSize
  }:${point.stemStartDistance}:${getOverlayReferenceSignature(
    resolvePointNodeContent(point)
  )}:${point.markerBackgroundColor}:${
    point.markerTextColor
  }:${getOverlayReferenceSignature(resolvePointBadgeContent(point))}:${
    point.labelStyle
  }:${point.collapse}:${point.markerCursor ?? ""}:${point.labelCursor ?? ""}:${
    point.textColor ?? ""
  }:${point.textBackgroundColor ?? ""}:${point.selectedBackgroundColor ?? ""}:${
    point.selectedTextColor ?? ""
  }:${point.selectedGlowColor ?? ""}:${
    point.selectedGlowRadiusPx ?? ""
  }:${Boolean(point.preserveFillOnSelection)}:${
    point.hoverBackgroundColor ?? ""
  }:${point.longPressDurationMs ?? ""}:${getOverlayReferenceSignature(
    point.onClick
  )}:${getOverlayReferenceSignature(
    point.onDoubleClick
  )}:${getOverlayReferenceSignature(
    point.onLongPress
  )}:${getOverlayReferenceSignature(
    point.onHoverChange
  )}:${getOverlayReferenceSignature(
    point.onMarkerDragStart
  )}:${getOverlayReferenceSignature(
    point.onMarkerDragMove
  )}:${getOverlayReferenceSignature(point.onMarkerDragEnd)}:${Boolean(
    point.markerOnlyPointerEvents
  )}:${Boolean(point.attachOverlayClickHandlers)}:${Boolean(
    point.forceMarkerInteractionTarget
  )}:transition:${transitionDurationMs ?? ""}:style:${pointStyleSignature}`;

const resolveBasePointStyleProps = (
  styleProps: PointLabelStyleProps | undefined
): Omit<PointLabelStyleProps, "fontSize" | "fontFamily" | "fontWeight"> => {
  if (!styleProps) {
    return {};
  }

  const baseStyleProps = { ...styleProps };
  delete baseStyleProps.fontSize;
  delete baseStyleProps.fontFamily;
  delete baseStyleProps.fontWeight;
  return baseStyleProps;
};

export const usePointLabels = (
  points: PointLabelData[],
  showLabels: boolean = true,
  getPitch?: () => number,
  styleProps?: PointLabelStyleProps,
  layoutOptions?: PointLabelLayoutOptions
) => {
  const { setLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const previousPointSignatureByIdRef = useRef<Map<string, string>>(new Map());
  const pointStyleSignature = useMemo(
    () => getPointStyleSignature(styleProps),
    [styleProps]
  );

  const pointSignatureById = useMemo(
    () =>
      new Map(
        points.map((p) => [
          p.id,
          getPointContentSignature(
            p,
            pointStyleSignature,
            layoutOptions?.transitionDurationMs
          ),
        ])
      ),
    [points, layoutOptions?.transitionDurationMs, pointStyleSignature]
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
      const pitch = point.pitch ?? (getPitch ? getPitch() : MINUS_PI_OVER_FOUR);

      const attachOverlayClickHandlers =
        point.attachOverlayClickHandlers ?? true;
      const baseStyleProps = resolveBasePointStyleProps(styleProps);
      const pointStyleProps: PointLabelStyleProps = {
        ...baseStyleProps,
        ...(point.markerCursor !== undefined
          ? { markerCursor: point.markerCursor }
          : {}),
        ...(point.labelCursor !== undefined
          ? { labelCursor: point.labelCursor }
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
        ...(point.selectedTextColor !== undefined
          ? { selectedTextColor: point.selectedTextColor }
          : {}),
        ...(point.selectedGlowColor !== undefined
          ? { selectedGlowColor: point.selectedGlowColor }
          : {}),
        ...(point.selectedGlowRadiusPx !== undefined
          ? { selectedGlowRadiusPx: point.selectedGlowRadiusPx }
          : {}),
        ...(point.preserveFillOnSelection !== undefined
          ? { preserveFillOnSelection: point.preserveFillOnSelection }
          : {}),
        ...(point.hoverBackgroundColor !== undefined
          ? { hoverBackgroundColor: point.hoverBackgroundColor }
          : {}),
      };
      const overlayClickHandler = attachOverlayClickHandlers
        ? point.onClick
        : undefined;
      const overlayDoubleClickHandler = attachOverlayClickHandlers
        ? point.onDoubleClick
        : undefined;

      setLabelOverlayElement({
        id: labelId,
        zIndex: point.zIndex ?? labelOverlayLayerDefaults.zIndex.pointLabel,
        contentKey: nextSignature,
        updatePosition: buildPointOverlayUpdatePosition(
          point.getCanvasPosition
        ),
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
          nodeContent: resolvePointNodeContent(point),
          markerBackgroundColor: point.markerBackgroundColor,
          markerTextColor: point.markerTextColor,
          badgeContent: resolvePointBadgeContent(point),
          labelStyle: point.labelStyle,
          collapse: point.collapse,
          content: point.content,
          selected: point.selected,
          isOccluded: point.isOccluded,
          onClick: point.onClick,
          onDoubleClick: point.onDoubleClick,
          onLongPress: point.onLongPress,
          longPressDurationMs: point.longPressDurationMs,
          onHoverChange: point.onHoverChange,
          markerOnlyPointerEvents: point.markerOnlyPointerEvents,
          forceMarkerInteractionTarget: point.forceMarkerInteractionTarget,
          onMarkerDragStart: point.onMarkerDragStart,
          onMarkerDragMove: point.onMarkerDragMove,
          onMarkerDragEnd: point.onMarkerDragEnd,
          ...pointStyleProps,
        }),
        visible: point.visible !== false && point.isHidden !== true,
        onClick: overlayClickHandler,
        onDoubleClick: overlayDoubleClickHandler,
        cursor: point.forceMarkerInteractionTarget ? "none" : undefined,
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
    setLabelOverlayElement,
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
