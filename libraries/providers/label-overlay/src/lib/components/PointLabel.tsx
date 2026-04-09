import React, { type CSSProperties, useEffect, useRef, useState } from "react";

import { MINUS_PI_OVER_FOUR } from "@carma-commons/math";
import type { CssPixelPosition } from "@carma-units";

import { resolveSegmentEndOutsideCircle } from "../core/pillConnectorGeometry";
import {
  POINT_LABEL_ATTACH,
  type PointLabelAttach,
} from "../core/pointLabelAttach";
import {
  PILLBUTTON_LABEL_MARKER_RESIZE_MODE,
  PILLBUTTON_BADGE_POSITIONS,
  PillbuttonLabelMarker,
  resolvePillbuttonLabelMarkerLayoutMetrics,
  type PillbuttonLabelMarkerResizeMode,
  type PillbuttonBadgePosition,
} from "./PillbuttonLabelMarker";
import { PointLabelStem } from "./PointLabelStem";
export { POINT_LABEL_ATTACH, type PointLabelAttach };

export const POINT_LABEL_STYLE = {
  AUTO: "auto",
  CAPSULE: "capsule",
} as const;

export type PointLabelStyle =
  (typeof POINT_LABEL_STYLE)[keyof typeof POINT_LABEL_STYLE];

const DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME =
  "carma-default-annotation-typography";

export interface PointLabelStyleProps {
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  markerCursor?: CSSProperties["cursor"];
  labelCursor?: CSSProperties["cursor"];
  textColor?: string;
  textBackgroundColor?: string;
  selectedBackgroundColor?: string;
  hoverBackgroundColor?: string;
  lineWidth?: number;
  lineColor?: string;
  markerSize?: number;
  markerStrokeWidth?: number;
  stemReferenceMarkerSize?: number;
  stemStartDistance?: number;
  nodeContent?: React.ReactNode;
  badgeContent?: React.ReactNode;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  badgePosition?: PillbuttonBadgePosition;
  markerContent?: React.ReactNode;
  compactBorderless?: boolean;
  labelStyle?: PointLabelStyle;
  collapse?: boolean;
  forceCollapse?: boolean;
  fullBorder?: boolean;
  resizeMode?: PillbuttonLabelMarkerResizeMode;
  labelDistance?: number;
}

interface PointLabelProps extends PointLabelStyleProps {
  pointId?: string;
  content: React.ReactNode;
  selected?: boolean;
  isOccluded?: boolean;
  pitch?: number;
  labelAngleRad?: number;
  labelAttach?: PointLabelAttach;
  transitionDurationMs?: number;
  hideLabelAndStem?: boolean;
  hideMarker?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onLongPress?: () => void;
  longPressDurationMs?: number;
  longPressOnlyOnMarker?: boolean;
  renderHiddenMarkerInteractionTarget?: boolean;
  onHoverChange?: (
    hovered: boolean,
    anchorPosition?: CssPixelPosition | null
  ) => void;
  markerOnlyPointerEvents?: boolean;
  forceMarkerInteractionTarget?: boolean;
  onMarkerDragStart?: (clientX: number, clientY: number) => void;
  onMarkerDragMove?: (clientX: number, clientY: number) => void;
  onMarkerDragEnd?: () => void;
}

const baseStyles: CSSProperties = {
  padding: "2px 4px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
  backdropFilter: "blur(8px) brightness(0.82) saturate(1.08)",
  WebkitBackdropFilter: "blur(8px) brightness(0.82) saturate(1.08)",
};

const nodeMarkerBaseStyles: CSSProperties = {
  position: "absolute",
  left: "0px",
  top: "0px",
  transform: "translate(-50%, -50%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  boxSizing: "border-box",
  borderRadius: "50%",
  fontVariantNumeric: "tabular-nums lining-nums",
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
  boxShadow: "0 0 2px rgba(0,0,0,0.55)",
};

const defaultPitch = MINUS_PI_OVER_FOUR;
const DRAG_START_THRESHOLD_PX = 3;
const PILL_STEM_END_INSET_PX = 1.5;
export const POINT_LABEL_TEXT_BACKGROUND_COLOR = "rgba(15, 23, 42, 0.72)";
export const POINT_LABEL_HOVER_BACKGROUND_COLOR = "rgba(30, 41, 59, 0.78)";
export const POINT_LABEL_SELECTED_BACKGROUND_COLOR =
  "rgba(51, 65, 85, 0.84)";

const parseFontSizePx = (fontSize: string): number => {
  const parsed = Number.parseFloat(fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
};

const stripLeadingBadgeFromText = (
  textValue: React.ReactNode,
  badgeTextValue: React.ReactNode
): React.ReactNode => {
  if (typeof badgeTextValue !== "string") return textValue;
  const normalizedBadge = badgeTextValue.trim();
  if (!normalizedBadge) return textValue;

  if (typeof textValue === "string") {
    const normalizedText = textValue.trimStart();
    if (normalizedText === normalizedBadge) return "";
    if (normalizedText.startsWith(`${normalizedBadge} `)) {
      return normalizedText.slice(normalizedBadge.length + 1);
    }
    return textValue;
  }

  const children = React.Children.toArray(textValue);
  if (children.length === 0) return textValue;

  const first = children[0];
  if (typeof first !== "string") return textValue;
  const trimmedFirst = first.trimStart();

  if (trimmedFirst === normalizedBadge) {
    const remainingChildren = children.slice(1);
    if (remainingChildren.length === 0) return "";
    if (typeof remainingChildren[0] === "string") {
      remainingChildren[0] = (remainingChildren[0] as string).replace(
        /^\s+/,
        ""
      );
    }
    return React.createElement(React.Fragment, null, ...remainingChildren);
  }

  if (trimmedFirst.startsWith(`${normalizedBadge} `)) {
    children[0] = trimmedFirst.slice(normalizedBadge.length + 1);
    return React.createElement(React.Fragment, null, ...children);
  }

  return textValue;
};

export const PointLabel = React.memo(
  ({
    pointId,
    content,
    selected = false,
    fontSize = "12px",
    markerCursor,
    labelCursor,
    textColor = "rgba(248, 250, 252, 0.98)",
    textBackgroundColor = POINT_LABEL_TEXT_BACKGROUND_COLOR,
    selectedBackgroundColor = POINT_LABEL_SELECTED_BACKGROUND_COLOR,
    hoverBackgroundColor = POINT_LABEL_HOVER_BACKGROUND_COLOR,
    isOccluded = false,
    pitch = defaultPitch,
    labelAngleRad,
    labelAttach = POINT_LABEL_ATTACH.LEFT,
    transitionDurationMs = 300,
    hideLabelAndStem = false,
    hideMarker = false,
    lineColor = "rgba(255, 255, 255, 0.88)",
    lineWidth = 1,
    markerSize = 10,
    markerStrokeWidth = 1,
    stemReferenceMarkerSize,
    stemStartDistance,
    nodeContent,
    badgeContent,
    markerContent,
    markerBackgroundColor = "rgba(75, 85, 99, 1)",
    markerTextColor = "rgba(239, 246, 255, 0.98)",
    badgePosition = PILLBUTTON_BADGE_POSITIONS.LEFT,
    compactBorderless = false,
    labelStyle = POINT_LABEL_STYLE.AUTO,
    collapse = false,
    forceCollapse = false,
    fullBorder = false,
    resizeMode = PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE,
    labelDistance = 20,
    onClick,
    onDoubleClick,
    onLongPress,
    longPressDurationMs = 300,
    longPressOnlyOnMarker = false,
    renderHiddenMarkerInteractionTarget = false,
    onHoverChange,
    markerOnlyPointerEvents = false,
    forceMarkerInteractionTarget = false,
    onMarkerDragStart,
    onMarkerDragMove,
    onMarkerDragEnd,
  }: PointLabelProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isAttachTransitionActive, setIsAttachTransitionActive] =
      useState(false);
    const previousAttachRef = useRef<PointLabelAttach>(labelAttach);
    const isHoveredRef = useRef(false);
    const clickTimeoutRef = useRef<number | undefined>(undefined);
    const longPressTimeoutRef = useRef<number | undefined>(undefined);
    const longPressTriggeredRef = useRef(false);
    const dragMouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
    const isMarkerDragActiveRef = useRef(false);
    const suppressNextClickRef = useRef(false);
    const cleanupMarkerDragListenersRef = useRef<(() => void) | null>(null);
    const effectiveLabelAngleRad =
      labelAngleRad !== undefined ? labelAngleRad : -Math.abs(Math.cos(pitch));
    const fontSizePx = parseFontSizePx(fontSize);
    const resolvedNodeContent = nodeContent ?? markerContent;
    const resolvedBadgeContent = badgeContent;
    const xComponent = Math.cos(effectiveLabelAngleRad);
    const yComponent = Math.sin(effectiveLabelAngleRad);
    const radius = markerSize / 2;
    const stemReferenceRadius = (stemReferenceMarkerSize ?? markerSize) / 2;
    const pillLayoutMetrics = resolvePillbuttonLabelMarkerLayoutMetrics({
      fontSize,
    });
    const regularLabelHorizontalPaddingPx = Math.round(
      pillLayoutMetrics.labelHeightPx / 2
    );
    const effectivePillCornerRadiusPx = pillLayoutMetrics.capRadiusPx;
    const hasCompactContent =
      resolvedBadgeContent !== null &&
      resolvedBadgeContent !== undefined &&
      (typeof resolvedBadgeContent !== "string" ||
        resolvedBadgeContent.trim().length > 0);
    const usePillbuttonLabelMarker = collapse;
    const defaultStemStartDistance = hideMarker ? 0 : radius;
    const resolvedStemStartDistance = Math.max(
      0,
      stemStartDistance ?? defaultStemStartDistance
    );
    const stemEndInsetDistance = hideMarker ? 0 : stemReferenceRadius;
    const baseLineLength = Math.max(0, labelDistance - stemEndInsetDistance);
    const useCapsuleStyle = labelStyle === POINT_LABEL_STYLE.CAPSULE;
    const hasAnyPillShape =
      useCapsuleStyle || collapse || hasCompactContent || fullBorder;
    const pillCapRadiusPx =
      hasAnyPillShape && labelAttach !== POINT_LABEL_ATTACH.CENTER
        ? effectivePillCornerRadiusPx
        : 0;
    const stemStartPoint = {
      x: xComponent * resolvedStemStartDistance,
      y: yComponent * resolvedStemStartDistance,
    } as CssPixelPosition;
    const labelAnchorPoint = {
      x:
        xComponent *
        (resolvedStemStartDistance + baseLineLength + pillCapRadiusPx),
      y:
        yComponent *
        (resolvedStemStartDistance + baseLineLength + pillCapRadiusPx),
    } as CssPixelPosition;
    const labelOffsetX = labelAnchorPoint.x;
    const labelOffsetY = labelAnchorPoint.y;
    const visibleStemEndPoint =
      pillCapRadiusPx > 0
        ? resolveSegmentEndOutsideCircle(
            stemStartPoint,
            labelAnchorPoint,
            pillCapRadiusPx + PILL_STEM_END_INSET_PX
          )
        : labelAnchorPoint;
    const isInteractive = Boolean(
      onClick ||
        onDoubleClick ||
        onLongPress ||
        onHoverChange ||
        onMarkerDragStart ||
        onMarkerDragMove ||
        onMarkerDragEnd
    );
    const markerCapturesPointer = isInteractive || Boolean(markerCursor);
    const markerPointerEvents = markerCapturesPointer ? "auto" : "none";
    const labelCapturesPointer =
      (isInteractive && !markerOnlyPointerEvents) || Boolean(labelCursor);
    const labelPointerEvents = labelCapturesPointer ? "auto" : "none";
    const renderInvisibleInteractionMarker =
      markerCapturesPointer &&
      hideMarker &&
      (forceMarkerInteractionTarget ||
        markerOnlyPointerEvents ||
        renderHiddenMarkerInteractionTarget);
    const resolvedMarkerCursor = forceMarkerInteractionTarget
      ? "none"
      : markerCursor ??
        (onClick || onDoubleClick || onLongPress ? "pointer" : "default");
    const resolvedLabelCursor =
      labelCursor ??
      (forceMarkerInteractionTarget
        ? "none"
        : onClick || onDoubleClick || onLongPress
        ? "pointer"
        : "default");
    const effectiveLineColor = lineColor;
    const effectiveTextColor = textColor;
    const effectiveBackgroundColor = selected
      ? selectedBackgroundColor
      : isHovered
      ? hoverBackgroundColor
      : textBackgroundColor;
    const effectiveCompactBackgroundColor = selected
      ? effectiveBackgroundColor
      : markerBackgroundColor;
    const effectiveCompactTextColor = selected
      ? effectiveTextColor
      : markerTextColor;
    const markerDiameterPx = markerSize;
    const markerStyles: CSSProperties = {
      ...nodeMarkerBaseStyles,
      width: `${markerDiameterPx}px`,
      minWidth: `${markerDiameterPx}px`,
      height: `${markerDiameterPx}px`,
      borderWidth: renderInvisibleInteractionMarker ? 0 : markerStrokeWidth,
      borderStyle: isOccluded ? "dotted" : "solid",
      borderColor: "#fff",
      backgroundColor: renderInvisibleInteractionMarker
        ? "rgba(0, 0, 0, 0)"
        : markerBackgroundColor,
      color: renderInvisibleInteractionMarker ? "transparent" : markerTextColor,
      fontSize: markerDiameterPx <= 16 ? "10px" : "11px",
      pointerEvents: markerPointerEvents,
      cursor: resolvedMarkerCursor,
    };
    const collapseToCompact =
      hasCompactContent &&
      (forceCollapse || (collapse && !selected && !isHovered));
    const expandedPillContent = stripLeadingBadgeFromText(
      content,
      resolvedBadgeContent
    );
    const shouldRenderPillbuttonMarker =
      useCapsuleStyle ||
      usePillbuttonLabelMarker ||
      hasCompactContent ||
      fullBorder;
    const usePillLabelShape =
      shouldRenderPillbuttonMarker || (!collapse && hasCompactContent);
    const getOverlayAnchorPosition = (
      target: EventTarget | null
    ): CssPixelPosition | null => {
      if (!(target instanceof HTMLElement)) return null;
      const overlayHost = target.closest(
        "[data-label-overlay-id]"
      ) as HTMLElement | null;
      if (!overlayHost) return null;

      const x = Number.parseFloat(overlayHost.style.left);
      const y = Number.parseFloat(overlayHost.style.top);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      return { x, y } as CssPixelPosition;
    };
    const isTransitionWithinSamePointLabel = (
      relatedTarget: EventTarget | null
    ) => {
      if (!(relatedTarget instanceof Element)) return false;
      const relatedPointId = relatedTarget
        .closest("[data-point-label-id]")
        ?.getAttribute("data-point-label-id");
      return Boolean(pointId && relatedPointId === pointId);
    };
    const handleMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
      if (isTransitionWithinSamePointLabel(event.relatedTarget)) return;
      if (!isInteractive || isHoveredRef.current) return;
      isHoveredRef.current = true;
      setIsHovered(true);
      onHoverChange?.(true, getOverlayAnchorPosition(event.currentTarget));
    };
    const handleMouseLeave = (event: React.MouseEvent<HTMLDivElement>) => {
      clearLongPressTimeout();
      if (isTransitionWithinSamePointLabel(event.relatedTarget)) return;
      if (!isInteractive || !isHoveredRef.current) return;
      isHoveredRef.current = false;
      setIsHovered(false);
      onHoverChange?.(false, getOverlayAnchorPosition(event.currentTarget));
    };
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      if (!onClick) return;
      if (!onDoubleClick) {
        onClick();
        return;
      }

      if (event.detail > 1) return;

      if (clickTimeoutRef.current !== undefined) {
        window.clearTimeout(clickTimeoutRef.current);
      }
      clickTimeoutRef.current = window.setTimeout(() => {
        onClick();
        clickTimeoutRef.current = undefined;
      }, 220);
    };
    const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (clickTimeoutRef.current !== undefined) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = undefined;
      }
      onDoubleClick?.();
    };
    const clearLongPressTimeout = () => {
      if (longPressTimeoutRef.current !== undefined) {
        window.clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = undefined;
      }
    };
    const clearMarkerDragListeners = () => {
      cleanupMarkerDragListenersRef.current?.();
      cleanupMarkerDragListenersRef.current = null;
    };
    const endMarkerDrag = (didDrag: boolean) => {
      clearMarkerDragListeners();
      if (isMarkerDragActiveRef.current) {
        onMarkerDragEnd?.();
      }
      isMarkerDragActiveRef.current = false;
      dragMouseDownPosRef.current = null;
      if (didDrag) {
        suppressNextClickRef.current = true;
      }
    };
    const beginMarkerDragTracking = (
      event: React.MouseEvent<HTMLDivElement>
    ) => {
      if (!onMarkerDragStart && !onMarkerDragMove && !onMarkerDragEnd) {
        return false;
      }
      if (event.button !== 0) return false;

      dragMouseDownPosRef.current = { x: event.clientX, y: event.clientY };
      isMarkerDragActiveRef.current = false;
      suppressNextClickRef.current = false;

      const handleWindowMouseMove = (moveEvent: MouseEvent) => {
        if (!dragMouseDownPosRef.current) return;
        const deltaX = moveEvent.clientX - dragMouseDownPosRef.current.x;
        const deltaY = moveEvent.clientY - dragMouseDownPosRef.current.y;
        const pixelDistance = Math.hypot(deltaX, deltaY);

        if (
          !isMarkerDragActiveRef.current &&
          pixelDistance >= DRAG_START_THRESHOLD_PX
        ) {
          isMarkerDragActiveRef.current = true;
          onMarkerDragStart?.(
            dragMouseDownPosRef.current.x,
            dragMouseDownPosRef.current.y
          );
        }
        if (isMarkerDragActiveRef.current) {
          onMarkerDragMove?.(moveEvent.clientX, moveEvent.clientY);
        }
      };
      const handleWindowMouseUp = () =>
        endMarkerDrag(isMarkerDragActiveRef.current);
      const handleWindowBlur = () =>
        endMarkerDrag(isMarkerDragActiveRef.current);

      window.addEventListener("mousemove", handleWindowMouseMove);
      window.addEventListener("mouseup", handleWindowMouseUp);
      window.addEventListener("blur", handleWindowBlur);
      cleanupMarkerDragListenersRef.current = () => {
        window.removeEventListener("mousemove", handleWindowMouseMove);
        window.removeEventListener("mouseup", handleWindowMouseUp);
        window.removeEventListener("blur", handleWindowBlur);
      };

      return true;
    };
    const handleMouseDown = (
      event: React.MouseEvent<HTMLDivElement>,
      allowMarkerDrag: boolean = true,
      allowLongPress: boolean = true
    ) => {
      event.stopPropagation();
      if (allowMarkerDrag && beginMarkerDragTracking(event)) {
        event.preventDefault();
        clearLongPressTimeout();
        return;
      }
      if (!allowLongPress) {
        clearLongPressTimeout();
        return;
      }
      if (!onLongPress) return;
      longPressTriggeredRef.current = false;
      clearLongPressTimeout();
      longPressTimeoutRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        onLongPress();
      }, longPressDurationMs);
    };
    const handleMouseUp = () => {
      clearLongPressTimeout();
    };
    const labelTransform =
      labelAttach === POINT_LABEL_ATTACH.RIGHT
        ? "translate(-100%, -50%)"
        : labelAttach === POINT_LABEL_ATTACH.CENTER
        ? "translate(-50%, -50%)"
        : "translate(0%, -50%)";
    const labelBorderStyle = `${lineWidth}px ${
      isOccluded ? "dashed" : "solid"
    } ${effectiveLineColor}`;
    const solidLabelBorderStyle = `${lineWidth}px solid ${effectiveLineColor}`;
    const labelTop = `${labelOffsetY}px`;
    const sharedAttachTransition =
      isAttachTransitionActive && transitionDurationMs > 0
        ? `${transitionDurationMs}ms ease`
        : undefined;
    const positionTransition = sharedAttachTransition
      ? `left ${sharedAttachTransition}, top ${sharedAttachTransition}, transform ${sharedAttachTransition}`
      : undefined;
    const stemTransition = sharedAttachTransition
      ? `left ${sharedAttachTransition}, top ${sharedAttachTransition}, width ${sharedAttachTransition}, transform ${sharedAttachTransition}`
      : undefined;

    useEffect(() => {
      if (transitionDurationMs <= 0) {
        previousAttachRef.current = labelAttach;
        setIsAttachTransitionActive(false);
        return;
      }

      const previousAttach = previousAttachRef.current;
      previousAttachRef.current = labelAttach;

      if (previousAttach === labelAttach) {
        return;
      }

      setIsAttachTransitionActive(true);
      const timeoutId = window.setTimeout(() => {
        setIsAttachTransitionActive(false);
      }, transitionDurationMs);

      return () => window.clearTimeout(timeoutId);
    }, [labelAttach, transitionDurationMs]);

    useEffect(
      () => () => {
        if (clickTimeoutRef.current !== undefined) {
          window.clearTimeout(clickTimeoutRef.current);
        }
        if (longPressTimeoutRef.current !== undefined) {
          window.clearTimeout(longPressTimeoutRef.current);
        }
        clearMarkerDragListeners();
      },
      []
    );

    return (
      <div
        data-point-label-root="true"
        style={{
          position: "relative",
          mixBlendMode: "normal",
          opacity: isOccluded ? 0.75 : 1,
        }}
      >
        {(!hideMarker || renderInvisibleInteractionMarker) && (
          <div
            data-point-label-interactive="true"
            data-point-label-id={pointId}
            data-point-label-hidden-marker-target={
              renderInvisibleInteractionMarker ? "true" : undefined
            }
            data-point-label-marker-content={
              !renderInvisibleInteractionMarker && resolvedNodeContent
                ? "true"
                : undefined
            }
            className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
            style={markerStyles}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onMouseDown={(event) => handleMouseDown(event, true, true)}
            onMouseUp={handleMouseUp}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {renderInvisibleInteractionMarker ? null : resolvedNodeContent}
          </div>
        )}

        {!hideLabelAndStem && (
          <>
            {/* Transform container for hairline rotation */}
            <PointLabelStem
              startPoint={stemStartPoint}
              endPoint={visibleStemEndPoint}
              lineColor={lineColor}
              lineWidth={lineWidth}
              isOccluded={isOccluded}
              transition={stemTransition}
            />

            {/* Label positioned at the end of the hairline */}
            {shouldRenderPillbuttonMarker ? (
              <PillbuttonLabelMarker
                pointId={pointId}
                placement={{
                  attach: labelAttach,
                  offsetX: labelOffsetX,
                  offsetY: labelOffsetY,
                }}
                containerStyle={{
                  ...baseStyles,
                  border: labelBorderStyle,
                  fontSize,
                  backgroundColor: effectiveBackgroundColor,
                  color: effectiveTextColor,
                  pointerEvents: labelPointerEvents,
                  cursor: resolvedLabelCursor,
                }}
                badgeStyle={{
                  backgroundColor: effectiveCompactBackgroundColor,
                  color: effectiveCompactTextColor,
                }}
                collapse={collapseToCompact}
                badgeContent={
                  hasCompactContent ? resolvedBadgeContent : undefined
                }
                badgeOptions={{
                  position: badgePosition,
                  compactBorderless,
                  fullBorder,
                  solidBorderStyle: solidLabelBorderStyle,
                }}
                motionOptions={{ resizeMode }}
                content={expandedPillContent}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseDown={(event) =>
                  handleMouseDown(event, false, !longPressOnlyOnMarker)
                }
                onMouseUp={handleMouseUp}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              />
            ) : (
              <div
                data-point-label-content-root="true"
                data-point-label-interactive="true"
                data-point-label-id={pointId}
                className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
                style={{
                  ...baseStyles,
                  padding: `0px ${regularLabelHorizontalPaddingPx}px`,
                  border: labelBorderStyle,
                  ...(usePillLabelShape
                    ? {
                        borderRadius: `${pillLayoutMetrics.capRadiusPx}px`,
                        minHeight: `${pillLayoutMetrics.labelHeightPx}px`,
                        padding: `0px ${pillLayoutMetrics.capRadiusPx}px`,
                        display: "inline-flex",
                        alignItems: "center",
                      }
                    : null),
                  fontSize,
                  fontVariantNumeric: "tabular-nums lining-nums",
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                  backgroundColor: effectiveBackgroundColor,
                  color: effectiveTextColor,
                  position: "absolute",
                  left: `${labelOffsetX}px`,
                  top: labelTop,
                  transform: labelTransform,
                  pointerEvents: labelPointerEvents,
                  cursor: resolvedLabelCursor,
                  transition: positionTransition,
                }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseDown={(event) =>
                  handleMouseDown(event, false, !longPressOnlyOnMarker)
                }
                onMouseUp={handleMouseUp}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                {collapseToCompact ? resolvedBadgeContent : content}
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);
