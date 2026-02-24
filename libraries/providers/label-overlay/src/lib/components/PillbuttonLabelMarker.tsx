import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  resolvePillbuttonMountSide,
  type PointLabelAttach,
} from "./PointLabelMarker";

const BADGE_DIAMETER_EM = 1.9;
const PILL_BODY_VERTICAL_PADDING_PX = 0;
const PILL_BODY_HORIZONTAL_PADDING_PX = 8;
const PILL_BADGE_GAP_PX = 4;
const EXTENDED_BODY_LEFT_EXTRA_PADDING_PX = 2;
const EXTENDED_BODY_RIGHT_EXTRA_PADDING_PX = 2;
const FAST_GROW_WIDTH_TRANSITION_MS = 200;
const SLOW_SHRINK_WIDTH_TRANSITION_MS = 5000;

const estimateBadgeAnchorOffsetPx = (fontSize: string): number => {
  const parsed = Number.parseFloat(fontSize);
  if (!Number.isFinite(parsed) || parsed <= 0) return 8;
  return parsed * (BADGE_DIAMETER_EM / 2);
};

interface PillbuttonLabelMarkerProps {
  pointId?: string;
  labelAttach: PointLabelAttach;
  labelOffsetX: number;
  labelOffsetY: number;
  baseStyles: React.CSSProperties;
  labelBorderStyle: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string | number;
  backgroundColor: string;
  textColor: string;
  pointerEvents: React.CSSProperties["pointerEvents"];
  cursor: React.CSSProperties["cursor"];
  transition?: string;
  collapse: boolean;
  markerContent?: React.ReactNode;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  fullBorder?: boolean;
  solidBorderStyle?: string;
  resizeMode?: "none" | "fast-grow-slow-shrink";
  content: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const PillbuttonLabelMarker = ({
  pointId,
  labelAttach,
  labelOffsetX,
  labelOffsetY,
  baseStyles,
  labelBorderStyle,
  fontSize,
  fontFamily,
  fontWeight,
  backgroundColor,
  textColor,
  pointerEvents,
  cursor,
  transition,
  collapse,
  markerContent,
  markerBackgroundColor,
  markerTextColor,
  fullBorder = false,
  solidBorderStyle,
  resizeMode = "none",
  content,
  onClick,
  onDoubleClick,
  onMouseDown,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
}: PillbuttonLabelMarkerProps) => {
  const mountSide = resolvePillbuttonMountSide(labelAttach);
  const hasMarker =
    markerContent !== undefined &&
    markerContent !== null &&
    (typeof markerContent !== "string" || markerContent.trim().length > 0);
  const hasBodyContent =
    content !== undefined &&
    content !== null &&
    (typeof content !== "string" || content.trim().length > 0);
  const showBody = !collapse && hasBodyContent;
  const effectiveMarkerBorderStyle =
    fullBorder && solidBorderStyle ? solidBorderStyle : labelBorderStyle;
  const bodyBorderStyle = fullBorder ? effectiveMarkerBorderStyle : "none";
  const badgeAnchorOffsetPx = estimateBadgeAnchorOffsetPx(fontSize);
  const anchorAtSemicircleCenter = hasMarker || fullBorder;
  const bodyPaddingBySide =
    hasMarker && showBody
      ? mountSide === "right"
        ? {
            paddingRight: `calc(${PILL_BODY_HORIZONTAL_PADDING_PX}px + ${
              BADGE_DIAMETER_EM / 2
            }em + ${PILL_BADGE_GAP_PX}px + ${EXTENDED_BODY_RIGHT_EXTRA_PADDING_PX}px)`,
            paddingLeft: `${
              PILL_BODY_HORIZONTAL_PADDING_PX +
              EXTENDED_BODY_LEFT_EXTRA_PADDING_PX
            }px`,
          }
        : {
            paddingLeft: `calc(${PILL_BODY_HORIZONTAL_PADDING_PX}px + ${
              BADGE_DIAMETER_EM / 2
            }em + ${PILL_BADGE_GAP_PX}px + ${EXTENDED_BODY_LEFT_EXTRA_PADDING_PX}px)`,
          }
      : null;
  const bodyOffsetBySide =
    hasMarker && showBody
      ? mountSide === "right"
        ? { marginRight: `-${BADGE_DIAMETER_EM / 2}em` }
        : { marginLeft: `-${BADGE_DIAMETER_EM / 2}em` }
      : null;
  const bodyRef = useRef<HTMLSpanElement | null>(null);
  const previousBodyWidthPxRef = useRef<number | null>(null);
  const [animatedBodyWidthPx, setAnimatedBodyWidthPx] = useState<number | null>(
    null
  );
  const [bodyWidthTransitionMs, setBodyWidthTransitionMs] = useState(0);

  useLayoutEffect(() => {
    if (resizeMode !== "fast-grow-slow-shrink" || !showBody) {
      previousBodyWidthPxRef.current = null;
      setAnimatedBodyWidthPx(null);
      setBodyWidthTransitionMs(0);
      return;
    }

    const bodyElement = bodyRef.current;
    if (!bodyElement) return;

    const nextWidthPx = Math.ceil(bodyElement.scrollWidth);
    const previousWidthPx = previousBodyWidthPxRef.current;

    if (previousWidthPx === null) {
      setBodyWidthTransitionMs(0);
    } else if (nextWidthPx > previousWidthPx) {
      setBodyWidthTransitionMs(FAST_GROW_WIDTH_TRANSITION_MS);
    } else if (nextWidthPx < previousWidthPx) {
      setBodyWidthTransitionMs(SLOW_SHRINK_WIDTH_TRANSITION_MS);
    }

    previousBodyWidthPxRef.current = nextWidthPx;
    setAnimatedBodyWidthPx(nextWidthPx);
  }, [resizeMode, showBody, content, fontFamily, fontSize, fontWeight]);

  const anchorTransform = useMemo(() => {
    if (mountSide === "right") {
      if (!anchorAtSemicircleCenter || hasMarker) {
        return "translate(-100%, -50%)";
      }
      return `translate(calc(-100% + ${badgeAnchorOffsetPx}px), -50%)`;
    }
    if (!anchorAtSemicircleCenter || hasMarker) {
      return "translate(0%, -50%)";
    }
    return `translate(${-badgeAnchorOffsetPx}px, -50%)`;
  }, [anchorAtSemicircleCenter, badgeAnchorOffsetPx, hasMarker, mountSide]);

  return (
    <div
      data-point-label-interactive="true"
      data-point-label-id={pointId}
      style={{
        ...baseStyles,
        padding: 0,
        display: "inline-block",
        fontSize,
        fontFamily,
        fontWeight,
        position: "absolute",
        left: `${labelOffsetX}px`,
        top: `${labelOffsetY}px`,
        transform: anchorTransform,
        pointerEvents,
        cursor,
        transition,
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {hasMarker ? (
        <span
          style={{
            position: "absolute",
            ...(mountSide === "right" ? { right: 0 } : { left: 0 }),
            top: "50%",
            transform:
              mountSide === "right"
                ? "translate(50%, -50%)"
                : "translate(-50%, -50%)",
            width: `${BADGE_DIAMETER_EM}em`,
            minWidth: `${BADGE_DIAMETER_EM}em`,
            height: `${BADGE_DIAMETER_EM}em`,
            padding: 0,
            borderRadius: "999px",
            border: effectiveMarkerBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            backgroundColor: markerBackgroundColor ?? backgroundColor,
            color: markerTextColor ?? textColor,
            lineHeight: 1,
            zIndex: 2,
          }}
        >
          {markerContent}
        </span>
      ) : null}

      {showBody ? (
        <span
          ref={bodyRef}
          style={{
            borderRadius: "999px",
            padding: `${PILL_BODY_VERTICAL_PADDING_PX}px ${PILL_BODY_HORIZONTAL_PADDING_PX}px`,
            paddingLeft: `${
              PILL_BODY_HORIZONTAL_PADDING_PX +
              EXTENDED_BODY_LEFT_EXTRA_PADDING_PX
            }px`,
            ...(bodyPaddingBySide ?? null),
            ...(bodyOffsetBySide ?? null),
            backgroundColor,
            color: textColor,
            border: bodyBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            minHeight: "1.9em",
            position: "relative",
            zIndex: 1,
            width:
              resizeMode === "fast-grow-slow-shrink" &&
              animatedBodyWidthPx !== null
                ? `${animatedBodyWidthPx}px`
                : undefined,
            overflow:
              resizeMode === "fast-grow-slow-shrink" ? "hidden" : undefined,
            transition:
              resizeMode === "fast-grow-slow-shrink"
                ? `width ${bodyWidthTransitionMs}ms ease`
                : undefined,
          }}
        >
          {content}
        </span>
      ) : !hasMarker ? (
        <span
          style={{
            borderRadius: "999px",
            padding: `${PILL_BODY_VERTICAL_PADDING_PX}px ${PILL_BODY_HORIZONTAL_PADDING_PX}px`,
            backgroundColor,
            color: textColor,
            border: bodyBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            minHeight: "1.9em",
          }}
        >
          {content}
        </span>
      ) : null}
    </div>
  );
};
