import React, { useEffect, useMemo, useRef } from "react";

import { MINUS_PI_OVER_FOUR } from "@carma-commons/math";
import type { CssPixelPosition } from "@carma-units";

import { PointLabel, type PointLabelStyleProps } from "./components/PointLabel";
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
  markerCursor?: React.CSSProperties["cursor"];
  labelCursor?: React.CSSProperties["cursor"];
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
  resizeMode?: "none" | "fast-grow-slow-shrink" | "snappy";
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

const overlayReferenceIdByValue = new WeakMap<object, number>();
let nextOverlayReferenceId = 1;

const getOverlayReferenceSignature = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" || typeof value === "function") {
    const ref = value as object;
    const existingId = overlayReferenceIdByValue.get(ref);
    if (existingId) {
      return `ref:${existingId}`;
    }

    const nextId = nextOverlayReferenceId++;
    overlayReferenceIdByValue.set(ref, nextId);
    return `ref:${nextId}`;
  }

  return String(value);
};

const getPointStyleSignature = (
  styleProps: PointLabelStyleProps | undefined
): string =>
  [
    styleProps?.fontSize ?? "",
    styleProps?.fontFamily ?? "",
    styleProps?.fontWeight ?? "",
    styleProps?.markerCursor ?? "",
    styleProps?.labelCursor ?? "",
    styleProps?.textColor ?? "",
    styleProps?.textBackgroundColor ?? "",
    styleProps?.selectedBackgroundColor ?? "",
    styleProps?.hoverBackgroundColor ?? "",
    styleProps?.lineWidth ?? "",
    styleProps?.lineColor ?? "",
    styleProps?.markerSize ?? "",
    styleProps?.markerStrokeWidth ?? "",
    styleProps?.stemReferenceMarkerSize ?? "",
    styleProps?.stemStartDistance ?? "",
    getOverlayReferenceSignature(styleProps?.markerContent),
    styleProps?.markerBackgroundColor ?? "",
    styleProps?.markerTextColor ?? "",
    getOverlayReferenceSignature(styleProps?.compactContent),
    String(styleProps?.compactBorderless ?? false),
    styleProps?.labelStyle ?? "",
    String(styleProps?.collapse ?? false),
    String(styleProps?.forceCollapse ?? false),
    String(styleProps?.fullBorder ?? false),
    styleProps?.resizeMode ?? "none",
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
    point.markerContent
  )}:${point.markerBackgroundColor}:${point.markerTextColor}:${getOverlayReferenceSignature(
    point.compactContent
  )}:${Boolean(point.compactBorderless)}:${point.labelStyle}:${point.collapse}:${
    point.forceCollapse
  }:${point.fullBorder}:${point.resizeMode ?? "none"}:${
    point.fontSize ?? ""
  }:${point.fontFamily ?? ""}:${point.fontWeight ?? ""}:${
    point.markerCursor ?? ""
  }:${point.labelCursor ?? ""}:${point.textColor ?? ""}:${
    point.textBackgroundColor ?? ""
  }:${point.selectedBackgroundColor ?? ""}:${point.hoverBackgroundColor ?? ""}:${
    point.longPressDurationMs ?? ""
  }:${getOverlayReferenceSignature(point.onClick)}:${getOverlayReferenceSignature(
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
    updateLabelOverlayElement,
  } = useLabelOverlay();
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
      const previousSignature =
        previousPointSignatureByIdRef.current.get(pointId) ?? null;

      // Use pitch from point data or fallback to getPitch callback
      const pitch = point.pitch ?? (getPitch ? getPitch() : MINUS_PI_OVER_FOUR);

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

      if (previousSignature === nextSignature) {
        updateLabelOverlayElement(labelId, {
          getCanvasPosition: point.getCanvasPosition,
          zIndex: point.zIndex ?? 20,
          visible: point.visible !== false,
          isHidden: point.isHidden,
          onClick: overlayClickHandler,
          onDoubleClick: overlayDoubleClickHandler,
          cursor: point.forceMarkerInteractionTarget ? "none" : undefined,
        });
        return;
      }

      addLabelOverlayElement({
        id: labelId,
        zIndex: point.zIndex ?? 20,
        contentKey: nextSignature,
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
          forceMarkerInteractionTarget: point.forceMarkerInteractionTarget,
          onMarkerDragStart: point.onMarkerDragStart,
          onMarkerDragMove: point.onMarkerDragMove,
          onMarkerDragEnd: point.onMarkerDragEnd,
          ...pointStyleProps,
        }),
        visible: point.visible !== false,
        isHidden: point.isHidden,
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
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
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
