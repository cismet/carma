import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  resolvePillbuttonMountSide,
  type PillbuttonMountSide,
  type PointLabelAttach,
} from "./PointLabelMarker";

const COMPACT_DIAMETER_EM = 1.9;
const COMPACT_HORIZONTAL_PADDING_PX = 6;
const COMPACT_WIDTH_SHRINK_PX = 2;
const COMPACT_WIDTH_EXTRA_PADDING_PX = 6;
const COMPACT_PILL_TEXT_LENGTH_THRESHOLD = 2;
const EXTENDED_VERTICAL_PADDING_PX = 0;
const EXTENDED_HORIZONTAL_PADDING_PX = 8;
const COMPACT_EXTENDED_GAP_PX = 4;
const EXTENDED_LEFT_EXTRA_PADDING_PX = 2;
const EXTENDED_RIGHT_EXTRA_PADDING_PX = 2;
const GROW_SHRINK_WIDTH_TRANSITION_MS = 200;
const SHRINK_WIDTH_TRANSITION_DELAY_MS = 3000;

const estimateCompactAnchorOffsetPx = (fontSize: string): number => {
  const parsed = Number.parseFloat(fontSize);
  if (!Number.isFinite(parsed) || parsed <= 0) return 8;
  return parsed * (COMPACT_DIAMETER_EM / 2);
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
  compactBorderless?: boolean;
  anchorAtSemicircleCenter?: boolean;
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
  compactBorderless = false,
  anchorAtSemicircleCenter: anchorAtSemicircleCenterOverride,
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
  const hasCompact =
    markerContent !== undefined &&
    markerContent !== null &&
    (typeof markerContent !== "string" || markerContent.trim().length > 0);
  const hasExtendedContent =
    content !== undefined &&
    content !== null &&
    (typeof content !== "string" || content.trim().length > 0);
  const showExtended = !collapse && hasExtendedContent;
  const effectiveMarkerBorderStyle =
    fullBorder && solidBorderStyle ? solidBorderStyle : labelBorderStyle;
  const extendedBorderStyle = fullBorder ? effectiveMarkerBorderStyle : "none";
  const compactAnchorOffsetPx = estimateCompactAnchorOffsetPx(fontSize);
  const anchorAtSemicircleCenter =
    anchorAtSemicircleCenterOverride ?? (hasCompact || fullBorder);
  const extendedPaddingBySide =
    hasCompact && showExtended
      ? mountSide === "right"
        ? {
            paddingRight: `calc(${EXTENDED_HORIZONTAL_PADDING_PX}px + ${
              COMPACT_DIAMETER_EM / 2
            }em + ${COMPACT_EXTENDED_GAP_PX}px + ${EXTENDED_RIGHT_EXTRA_PADDING_PX}px)`,
            paddingLeft: `${
              EXTENDED_HORIZONTAL_PADDING_PX + EXTENDED_LEFT_EXTRA_PADDING_PX
            }px`,
          }
        : mountSide === "left"
        ? {
            paddingLeft: `calc(${EXTENDED_HORIZONTAL_PADDING_PX}px + ${
              COMPACT_DIAMETER_EM / 2
            }em + ${COMPACT_EXTENDED_GAP_PX}px + ${EXTENDED_LEFT_EXTRA_PADDING_PX}px)`,
          }
        : {
            paddingLeft: `calc(${EXTENDED_HORIZONTAL_PADDING_PX}px + ${
              COMPACT_DIAMETER_EM / 2
            }em + ${COMPACT_EXTENDED_GAP_PX}px + ${EXTENDED_LEFT_EXTRA_PADDING_PX}px)`,
            paddingRight: `calc(${EXTENDED_HORIZONTAL_PADDING_PX}px + ${
              COMPACT_DIAMETER_EM / 2
            }em + ${COMPACT_EXTENDED_GAP_PX}px + ${EXTENDED_RIGHT_EXTRA_PADDING_PX}px)`,
          }
      : null;
  const extendedOffsetBySide =
    hasCompact && showExtended
      ? mountSide === "right"
        ? { marginRight: `-${COMPACT_DIAMETER_EM / 2}em` }
        : mountSide === "left"
        ? { marginLeft: `-${COMPACT_DIAMETER_EM / 2}em` }
        : null
      : null;
  const compactRef = useRef<HTMLSpanElement | null>(null);
  const [compactWidthPx, setCompactWidthPx] = useState<number | null>(null);
  const compactTextLength =
    typeof markerContent === "string" ? markerContent.trim().length : 0;
  const shouldForceCompactPill =
    compactTextLength > COMPACT_PILL_TEXT_LENGTH_THRESHOLD;

  useLayoutEffect(() => {
    const el = compactRef.current;
    if (!el || !hasCompact) {
      setCompactWidthPx(null);
      return;
    }
    const scrollW = Math.ceil(el.scrollWidth);
    const circlePx = el.offsetHeight;
    if (shouldForceCompactPill || scrollW > circlePx) {
      setCompactWidthPx(
        Math.max(
          scrollW +
            COMPACT_HORIZONTAL_PADDING_PX * 2 +
            COMPACT_WIDTH_EXTRA_PADDING_PX -
            COMPACT_WIDTH_SHRINK_PX,
          circlePx + 1
        )
      );
    } else {
      setCompactWidthPx(null);
    }
  }, [
    hasCompact,
    markerContent,
    fontSize,
    fontFamily,
    fontWeight,
    shouldForceCompactPill,
  ]);

  const extendedRef = useRef<HTMLSpanElement | null>(null);
  const previousExtendedWidthPxRef = useRef<number | null>(null);
  const [animatedExtendedWidthPx, setAnimatedExtendedWidthPx] = useState<
    number | null
  >(null);
  const [extendedWidthTransitionMs, setExtendedWidthTransitionMs] = useState(0);
  const [extendedWidthTransitionDelayMs, setExtendedWidthTransitionDelayMs] =
    useState(0);

  useLayoutEffect(() => {
    if (resizeMode !== "fast-grow-slow-shrink" || !showExtended) {
      previousExtendedWidthPxRef.current = null;
      setAnimatedExtendedWidthPx(null);
      setExtendedWidthTransitionMs(0);
      setExtendedWidthTransitionDelayMs(0);
      return;
    }

    const extendedElement = extendedRef.current;
    if (!extendedElement) return;

    const nextWidthPx = Math.ceil(extendedElement.scrollWidth);
    const previousWidthPx = previousExtendedWidthPxRef.current;

    if (previousWidthPx === null) {
      setExtendedWidthTransitionMs(0);
      setExtendedWidthTransitionDelayMs(0);
    } else if (nextWidthPx > previousWidthPx) {
      setExtendedWidthTransitionMs(GROW_SHRINK_WIDTH_TRANSITION_MS);
      setExtendedWidthTransitionDelayMs(0);
    } else if (nextWidthPx < previousWidthPx) {
      setExtendedWidthTransitionMs(GROW_SHRINK_WIDTH_TRANSITION_MS);
      setExtendedWidthTransitionDelayMs(SHRINK_WIDTH_TRANSITION_DELAY_MS);
    } else {
      setExtendedWidthTransitionDelayMs(0);
    }

    previousExtendedWidthPxRef.current = nextWidthPx;
    setAnimatedExtendedWidthPx(nextWidthPx);
  }, [resizeMode, showExtended, content, fontFamily, fontSize, fontWeight]);

  const getCompactStylesByMountSide = (
    side: PillbuttonMountSide
  ): React.CSSProperties => {
    if (side === "right") {
      return {
        right: 0,
        transform: "translate(50%, -50%)",
      };
    }
    if (side === "left") {
      return {
        left: 0,
        transform: "translate(-50%, -50%)",
      };
    }
    return {
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  };

  const anchorTransform = useMemo(() => {
    if (mountSide === "right") {
      if (!anchorAtSemicircleCenter || hasCompact) {
        return "translate(-100%, -50%)";
      }
      return `translate(calc(-100% + ${compactAnchorOffsetPx}px), -50%)`;
    }
    if (mountSide === "center") {
      return "translate(-50%, -50%)";
    }
    if (!anchorAtSemicircleCenter || hasCompact) {
      return "translate(0%, -50%)";
    }
    return `translate(${-compactAnchorOffsetPx}px, -50%)`;
  }, [anchorAtSemicircleCenter, compactAnchorOffsetPx, hasCompact, mountSide]);

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
        fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: '"tnum"',
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
      {hasCompact ? (
        <span
          ref={compactRef}
          style={{
            position: "absolute",
            ...getCompactStylesByMountSide(mountSide),
            top: "50%",
            width:
              compactWidthPx != null
                ? `${compactWidthPx}px`
                : `${COMPACT_DIAMETER_EM}em`,
            minWidth: `${COMPACT_DIAMETER_EM}em`,
            height: `${COMPACT_DIAMETER_EM}em`,
            padding:
              compactWidthPx != null
                ? `0 ${COMPACT_HORIZONTAL_PADDING_PX}px`
                : 0,
            borderRadius: "999px",
            border: compactBorderless ? "none" : effectiveMarkerBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            whiteSpace: "nowrap",
            backgroundColor: markerBackgroundColor ?? backgroundColor,
            color: markerTextColor ?? textColor,
            lineHeight: 1,
            zIndex: 2,
          }}
        >
          {markerContent}
        </span>
      ) : null}

      {showExtended ? (
        <span
          ref={extendedRef}
          style={{
            borderRadius: "999px",
            padding: `${EXTENDED_VERTICAL_PADDING_PX}px ${EXTENDED_HORIZONTAL_PADDING_PX}px`,
            paddingLeft: `${
              EXTENDED_HORIZONTAL_PADDING_PX + EXTENDED_LEFT_EXTRA_PADDING_PX
            }px`,
            ...(extendedPaddingBySide ?? null),
            ...(extendedOffsetBySide ?? null),
            backgroundColor,
            color: textColor,
            border: extendedBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            minHeight: "1.9em",
            position: "relative",
            zIndex: 1,
            width:
              resizeMode === "fast-grow-slow-shrink" &&
              animatedExtendedWidthPx !== null
                ? `${animatedExtendedWidthPx}px`
                : undefined,
            overflow:
              resizeMode === "fast-grow-slow-shrink" ? "hidden" : undefined,
            transition:
              resizeMode === "fast-grow-slow-shrink"
                ? `width ${extendedWidthTransitionMs}ms ease ${extendedWidthTransitionDelayMs}ms`
                : undefined,
          }}
        >
          {content}
        </span>
      ) : !hasCompact ? (
        <span
          style={{
            borderRadius: "999px",
            padding: `${EXTENDED_VERTICAL_PADDING_PX}px ${EXTENDED_HORIZONTAL_PADDING_PX}px`,
            backgroundColor,
            color: textColor,
            border: extendedBorderStyle,
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
