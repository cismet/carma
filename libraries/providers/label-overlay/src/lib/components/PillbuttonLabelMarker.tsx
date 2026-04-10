import React, { type CSSProperties, type MouseEvent } from "react";

import type { CssPixelPosition } from "@carma-units";

import {
  POINT_LABEL_ATTACH,
  type PointLabelAttach,
} from "../core/pointLabelAttach";

const DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME =
  "carma-default-annotation-typography";
import { DEFAULT_PILL_LABEL_HEIGHT_EM } from "../core/pillConnectorGeometry";

export const PILLBUTTON_BADGE_POSITIONS = {
  LEFT: "left",
  RIGHT: "right",
} as const;

export const DEFAULT_POINT_LABEL_FONT_SIZE = "14px";
export const DEFAULT_POINT_LABEL_FONT_FAMILY =
  '"Helvetica Neue", Arial, Helvetica, sans-serif';
export const DEFAULT_POINT_LABEL_FONT_WEIGHT = 500;

const PILLBUTTON_LABEL_HEIGHT_EM = DEFAULT_PILL_LABEL_HEIGHT_EM;
const PILLBUTTON_CAP_RADIUS_EM = PILLBUTTON_LABEL_HEIGHT_EM / 2;
const PILLBUTTON_BADGE_HORIZONTAL_PADDING_EM = Math.max(
  0.08,
  PILLBUTTON_CAP_RADIUS_EM * 0.35
);

export type PillbuttonBadgePosition =
  (typeof PILLBUTTON_BADGE_POSITIONS)[keyof typeof PILLBUTTON_BADGE_POSITIONS];

export type PillbuttonLabelMarkerAnchorPoints = Readonly<{
  left: CssPixelPosition;
  center: CssPixelPosition;
  right: CssPixelPosition;
}>;

export const resolvePillbuttonLabelMarkerLocalAnchorPoints = ({
  heightPx,
  widthPx,
}: {
  heightPx: number;
  widthPx: number;
}): PillbuttonLabelMarkerAnchorPoints => {
  const labelHeightPx =
    Number.isFinite(heightPx) && heightPx > 0 ? heightPx : 28;
  const capRadiusPx = labelHeightPx / 2;
  const centerY = labelHeightPx / 2;

  return {
    left: {
      x: capRadiusPx,
      y: centerY,
    } as CssPixelPosition,
    center: {
      x: widthPx / 2,
      y: centerY,
    } as CssPixelPosition,
    right: {
      x: widthPx - capRadiusPx,
      y: centerY,
    } as CssPixelPosition,
  };
};

const PILLBUTTON_DEFAULT_BADGE_POSITION_BY_ATTACH = {
  [POINT_LABEL_ATTACH.LEFT]: PILLBUTTON_BADGE_POSITIONS.LEFT,
  [POINT_LABEL_ATTACH.RIGHT]: PILLBUTTON_BADGE_POSITIONS.RIGHT,
  [POINT_LABEL_ATTACH.CENTER]: PILLBUTTON_BADGE_POSITIONS.LEFT,
} as const satisfies Record<PointLabelAttach, PillbuttonBadgePosition>;

export interface PillbuttonLabelMarkerProps {
  pointId?: string;
  attach: PointLabelAttach;
  containerStyle: CSSProperties;
  badgeStyle?: CSSProperties;
  badgeContent?: React.ReactNode;
  badgePosition?: PillbuttonBadgePosition;
  content?: React.ReactNode;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
  onMouseEnter: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: (event: MouseEvent<HTMLDivElement>) => void;
}

export const PillbuttonLabelMarker = ({
  pointId,
  attach,
  containerStyle,
  badgeStyle,
  badgeContent,
  badgePosition,
  content: contentNode,
  onClick,
  onDoubleClick,
  onMouseDown,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
}: PillbuttonLabelMarkerProps) => {
  const resolvedBadgePosition =
    badgePosition ?? PILLBUTTON_DEFAULT_BADGE_POSITION_BY_ATTACH[attach];
  const hasBadgeContent =
    badgeContent !== undefined &&
    badgeContent !== null &&
    (typeof badgeContent !== "string" || badgeContent.trim().length > 0);
  const hasContent =
    contentNode !== undefined &&
    contentNode !== null &&
    (typeof contentNode !== "string" || contentNode.trim().length > 0);
  const borderStyle =
    typeof containerStyle.border === "string" ? containerStyle.border : "none";
  const borderWidthPx =
    typeof containerStyle.borderWidth === "number"
      ? containerStyle.borderWidth
      : typeof containerStyle.borderWidth === "string"
      ? Number.parseFloat(containerStyle.borderWidth)
      : typeof containerStyle.border === "string"
      ? Number.parseFloat(containerStyle.border)
      : 0;
  const hasStartBadge =
    hasBadgeContent &&
    resolvedBadgePosition === PILLBUTTON_BADGE_POSITIONS.LEFT;
  const hasEndBadge =
    hasBadgeContent &&
    resolvedBadgePosition === PILLBUTTON_BADGE_POSITIONS.RIGHT;
  const isBadgeOnly = hasBadgeContent && !hasContent;
  const resolvedFontSize =
    containerStyle.fontSize ?? DEFAULT_POINT_LABEL_FONT_SIZE;
  const resolvedFontFamily =
    containerStyle.fontFamily ?? DEFAULT_POINT_LABEL_FONT_FAMILY;
  const resolvedFontWeight =
    containerStyle.fontWeight ?? DEFAULT_POINT_LABEL_FONT_WEIGHT;
  const typographyVariableStyles = {
    "--carma-annotation-overlay-line-label-font-family": resolvedFontFamily,
    "--carma-annotation-overlay-line-label-font-size": resolvedFontSize,
    "--carma-annotation-overlay-line-label-font-weight":
      String(resolvedFontWeight),
  } as CSSProperties;
  const badgeOuterBorderOverlap =
    hasContent && borderWidthPx > 0 ? `${-borderWidthPx}px` : undefined;

  const sharedSegmentStyles: CSSProperties = {
    boxSizing: "border-box",
    minHeight: `${PILLBUTTON_LABEL_HEIGHT_EM}em`,
    whiteSpace: "nowrap",
    lineHeight: 1,
    borderRadius: `${PILLBUTTON_CAP_RADIUS_EM}em`,
    verticalAlign: "baseline",
  };
  const badgeSegmentStyles: CSSProperties = {
    ...sharedSegmentStyles,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: `${PILLBUTTON_LABEL_HEIGHT_EM}em`,
    padding: `0 ${PILLBUTTON_BADGE_HORIZONTAL_PADDING_EM}em`,
    border: borderStyle,
    backgroundColor: containerStyle.backgroundColor,
    color: containerStyle.color,
    ...badgeStyle,
  };
  const startBadgeSegmentStyles: CSSProperties = {
    ...badgeSegmentStyles,
    ...(badgeOuterBorderOverlap
      ? {
          marginTop: badgeOuterBorderOverlap,
          marginBottom: badgeOuterBorderOverlap,
          marginLeft: badgeOuterBorderOverlap,
          marginRight: "0.5ex",
        }
      : null),
  };
  const endBadgeSegmentStyles: CSSProperties = {
    ...badgeSegmentStyles,
    ...(badgeOuterBorderOverlap
      ? {
          marginTop: badgeOuterBorderOverlap,
          marginBottom: badgeOuterBorderOverlap,
          marginRight: badgeOuterBorderOverlap,
          marginLeft: "0.5ex",
        }
      : null),
  };
  const contentSegmentStyles: CSSProperties = {
    ...sharedSegmentStyles,
    display: "inline-flex",
    alignItems: "center",
    paddingLeft: hasStartBadge ? "0em" : `1ex`,
    paddingRight: hasEndBadge ? "0em" : `1ex`,
  };
  const rootLabelShellStyles: CSSProperties = {
    ...sharedSegmentStyles,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: containerStyle.backgroundColor,
    color: containerStyle.color,
    border: "none",
  };
  const rootBadgeOnlyStyles: CSSProperties = {
    border: "none",
    backgroundColor: "transparent",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
  };

  return (
    <div
      data-point-label-interactive="true"
      data-point-label-id={pointId}
      data-pillbutton-root="true"
      style={{
        ...containerStyle,
        ...(hasContent || !hasBadgeContent ? rootLabelShellStyles : {}),
        ...(isBadgeOnly ? rootBadgeOnlyStyles : {}),
        ...typographyVariableStyles,
        padding: 0,
        display: "inline-flex",
        fontSize: resolvedFontSize,
        fontFamily: resolvedFontFamily,
        fontWeight: resolvedFontWeight,
        fontVariantNumeric: "tabular-nums lining-nums",
        fontFeatureSettings: '"tnum" 1, "lnum" 1',
        lineHeight: 1,
        verticalAlign: "baseline",
        overflow: "visible",
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {hasStartBadge ? (
        <span
          className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
          data-pillbutton-badge="true"
          data-pillbutton-badge-slot="start"
          style={startBadgeSegmentStyles}
        >
          {badgeContent}
        </span>
      ) : null}
      {hasContent || !hasBadgeContent ? (
        <span
          className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
          data-pillbutton-content="true"
          data-pillbutton-segment="content"
          style={contentSegmentStyles}
        >
          {contentNode}
        </span>
      ) : null}
      {hasEndBadge ? (
        <span
          className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
          data-pillbutton-badge="true"
          data-pillbutton-badge-slot="end"
          style={endBadgeSegmentStyles}
        >
          {badgeContent}
        </span>
      ) : null}
    </div>
  );
};
