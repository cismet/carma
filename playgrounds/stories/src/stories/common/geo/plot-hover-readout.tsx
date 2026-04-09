import { type CSSProperties, type ReactNode } from "react";

import {
  PILLBUTTON_LABEL_MARKER_RESIZE_MODE,
  PILLBUTTON_BADGE_POSITIONS,
  PillbuttonLabelMarker,
  POINT_LABEL_ATTACH,
  type PointLabelAttach,
} from "@carma-providers/label-overlay";

import { GEO_STORY_STYLES } from "./geo-story-styles";
export type PlotHoverAxisValueLabel = {
  text: string;
  x: number;
  y: number;
  width?: number;
  textAnchor?: "start" | "middle" | "end";
  anchorAtSemicircleCenter?: boolean;
};

export type PlotHoverTooltip = {
  x: number;
  y: number;
  width: number;
  height: number;
  children: ReactNode;
  onClose?: () => void;
  anchorAttach?: PointLabelAttach;
  anchorAtSemicircleCenter?: boolean;
};

type PlotHoverReadoutProps = {
  plotLeft: number;
  plotTop: number;
  innerWidth: number;
  innerHeight: number;
  plotX: number;
  plotY: number;
  axisValueLabels: PlotHoverAxisValueLabel[];
  tooltip?: PlotHoverTooltip | null;
  showGuides?: boolean;
  guideLeftX?: number;
  guideRightX?: number;
  guideTopY?: number;
  guideBottomY?: number;
  renderMode?: "all" | "guides" | "overlays";
};

type PlotHoverReadoutLayersProps = PlotHoverReadoutProps & {
  readoutKey?: string;
};

export type PlotHoverTooltipBox = {
  width: number;
  height: number;
  x: number;
  y: number;
};

export const DEFAULT_Y_AXIS_READOUT_ANCHOR_OFFSET_PX = 34;
export const DEFAULT_Y_AXIS_TICK_LENGTH_PX = 6;
export const DEFAULT_Y_AXIS_TITLE_GAP_PX = 24;
export const DEFAULT_X_AXIS_TICK_LENGTH_PX = 6;
export const DEFAULT_X_AXIS_READOUT_BASELINE_GAP_PX = 6;

const PILL_PADDING_X_PX = 4;
const PILL_BACKGROUND = "rgba(255, 255, 255, 0.94)";
const PILL_HEIGHT_PX = 24;
const PILL_FONT_SIZE_PX = Number(GEO_STORY_STYLES.text.svg.fontSize) || 12;
const PILL_FONT_FAMILY = String(GEO_STORY_STYLES.text.svg.fontFamily);

const PILL_BASE_STYLES: CSSProperties = {
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
};

const noopMouseEventHandler = () => {};
const noopMouseUpHandler = () => {};
const CLOSE_BADGE_BACKGROUND = "rgba(239, 68, 68, 0.42)";
const DEFAULT_VALUE_READOUT_OFFSET_PX = 16;
const CLOSE_BADGE_CONTENT = (
  <span
    style={{
      display: "inline-flex",
      width: "1em",
      height: "1em",
      alignItems: "center",
      justifyContent: "center",
      color: "#ffffff",
      fontSize: "13px",
      fontWeight: 700,
      lineHeight: 1,
      transform: "translateY(-0.5px)",
    }}
  >
    ×
  </span>
);

const readLabelWidth = (text: string) =>
  Math.max(40, text.length * 6.5 + PILL_PADDING_X_PX * 2 + 12);

const readLabelRectX = (
  anchorX: number,
  width: number,
  textAnchor: "start" | "middle" | "end",
  anchorAtSemicircleCenter = false
) => {
  if (textAnchor === "start") {
    return anchorAtSemicircleCenter ? anchorX : anchorX - PILL_PADDING_X_PX;
  }

  if (textAnchor === "end") {
    return anchorAtSemicircleCenter
      ? anchorX - width
      : anchorX - width + PILL_PADDING_X_PX;
  }

  return anchorX - width * 0.5;
};

export const readAxisValueLabelRect = (
  label: PlotHoverAxisValueLabel
): {
  x: number;
  width: number;
  textAnchor: "start" | "middle" | "end";
} => {
  const width = label.width ?? readLabelWidth(label.text);
  const textAnchor = label.textAnchor ?? "middle";

  return {
    x: readLabelRectX(
      label.x,
      width,
      textAnchor,
      label.anchorAtSemicircleCenter
    ),
    width,
    textAnchor,
  };
};

export const readAxisValueLabelPerimeterX = (
  label: PlotHoverAxisValueLabel,
  side: "left" | "right"
) => {
  const rect = readAxisValueLabelRect(label);

  return side === "left" ? rect.x : rect.x + rect.width;
};

export const readAxisValueLabelPerimeterY = (
  label: PlotHoverAxisValueLabel,
  side: "top" | "bottom"
) => {
  const rectY = label.y - PILL_HEIGHT_PX * 0.5;

  return side === "top" ? rectY : rectY + PILL_HEIGHT_PX;
};

export const createPrimaryYAxisReadoutLabel = ({
  axisLineX,
  text,
  y,
  width,
  anchorOffsetPx = DEFAULT_Y_AXIS_READOUT_ANCHOR_OFFSET_PX,
}: {
  axisLineX: number;
  text: string;
  y: number;
  width: number;
  anchorOffsetPx?: number;
}): PlotHoverAxisValueLabel => ({
  text,
  x: axisLineX - anchorOffsetPx,
  y,
  width,
  textAnchor: "end",
  anchorAtSemicircleCenter: true,
});

export const readGuideLeftXFromPrimaryYAxisReadout = (
  label: PlotHoverAxisValueLabel,
  tickLengthPx = DEFAULT_Y_AXIS_TICK_LENGTH_PX
) => readAxisValueLabelPerimeterX(label, "right") + tickLengthPx;

export const readPrimaryYAxisTitleX = (
  axisLineX: number,
  {
    anchorOffsetPx = DEFAULT_Y_AXIS_READOUT_ANCHOR_OFFSET_PX,
    titleGapPx = DEFAULT_Y_AXIS_TITLE_GAP_PX,
  }: {
    anchorOffsetPx?: number;
    titleGapPx?: number;
  } = {}
) => axisLineX - anchorOffsetPx - titleGapPx;

export const createBottomXAxisReadoutLabel = ({
  axisLineY,
  text,
  x,
  width,
  tickLengthPx = DEFAULT_X_AXIS_TICK_LENGTH_PX,
  baselineGapPx = DEFAULT_X_AXIS_READOUT_BASELINE_GAP_PX,
}: {
  axisLineY: number;
  text: string;
  x: number;
  width?: number;
  tickLengthPx?: number;
  baselineGapPx?: number;
}): PlotHoverAxisValueLabel => ({
  text,
  x,
  y: axisLineY + tickLengthPx + baselineGapPx,
  width,
});

export const readGuideBottomYFromBottomXAxisReadout = (
  label: PlotHoverAxisValueLabel,
  tickLengthPx = DEFAULT_X_AXIS_TICK_LENGTH_PX
) => readAxisValueLabelPerimeterY(label, "top") + tickLengthPx;

const readAttachFromTextAnchor = (
  textAnchor: "start" | "middle" | "end"
): PointLabelAttach =>
  textAnchor === "start" ? "left" : textAnchor === "end" ? "right" : "center";

export const readSampleAnchoredTooltipBox = ({
  plotX,
  plotY,
  width,
  height,
  offsetPx = DEFAULT_VALUE_READOUT_OFFSET_PX,
}: {
  plotX: number;
  plotY: number;
  width: number;
  height: number;
  offsetPx?: number;
}): PlotHoverTooltipBox => ({
  width,
  height,
  x: plotX + offsetPx,
  y: plotY - offsetPx,
});

export const PlotHoverReadout = ({
  plotLeft,
  plotTop,
  innerWidth,
  innerHeight,
  plotX,
  plotY,
  axisValueLabels,
  tooltip,
  showGuides = false,
  guideLeftX,
  guideRightX,
  guideTopY,
  guideBottomY,
  renderMode = "all",
}: PlotHoverReadoutProps) => {
  const showGuideLayer = showGuides && renderMode !== "overlays";
  const showOverlayLayer = renderMode !== "guides";
  const tooltipRectX =
    tooltip && tooltip.anchorAttach
      ? readLabelRectX(
          tooltip.x,
          tooltip.width,
          tooltip.anchorAttach === POINT_LABEL_ATTACH.LEFT
            ? "start"
            : tooltip.anchorAttach === POINT_LABEL_ATTACH.RIGHT
            ? "end"
            : "middle",
          tooltip.anchorAtSemicircleCenter
        )
      : tooltip?.x ?? 0;
  const tooltipRectY =
    tooltip && tooltip.anchorAttach
      ? tooltip.y - tooltip.height * 0.5
      : tooltip?.y ?? 0;

  return (
    <g pointerEvents="none">
      {showGuideLayer ? (
        <>
          <line
            x1={guideLeftX ?? plotLeft}
            x2={guideRightX ?? plotLeft + innerWidth}
            y1={plotTop + plotY}
            y2={plotTop + plotY}
            stroke="#0f172a"
            strokeWidth={1}
            opacity={0.4}
          />
          <line
            x1={plotLeft + plotX}
            x2={plotLeft + plotX}
            y1={guideTopY ?? plotTop}
            y2={guideBottomY ?? plotTop + innerHeight}
            stroke="#0f172a"
            strokeWidth={1}
            opacity={0.4}
          />
        </>
      ) : null}
      {showOverlayLayer
        ? axisValueLabels.map((label) => {
            const {
              width,
              textAnchor,
              x: rectX,
            } = readAxisValueLabelRect(label);
            const rectY = label.y - PILL_HEIGHT_PX * 0.5;
            const attach = readAttachFromTextAnchor(textAnchor);
            const anchorLocalX =
              attach === POINT_LABEL_ATTACH.LEFT
                ? 0
                : attach === POINT_LABEL_ATTACH.RIGHT
                ? width
                : width * 0.5;
            const anchorLocalY = PILL_HEIGHT_PX * 0.5;

            return (
              <foreignObject
                key={`${label.text}-${label.x}-${label.y}`}
                x={rectX}
                y={rectY}
                width={width}
                height={PILL_HEIGHT_PX}
                style={{ overflow: "visible", pointerEvents: "none" }}
              >
                <div
                  xmlns="http://www.w3.org/1999/xhtml"
                  style={{
                    position: "relative",
                    width: `${width}px`,
                    height: `${PILL_HEIGHT_PX}px`,
                    overflow: "visible",
                  }}
                >
                  <PillbuttonLabelMarker
                    placement={{
                      attach,
                      offsetX: anchorLocalX,
                      offsetY: anchorLocalY,
                    }}
                    containerStyle={{
                      ...PILL_BASE_STYLES,
                      border: "none",
                      fontSize: `${PILL_FONT_SIZE_PX}px`,
                      fontFamily: PILL_FONT_FAMILY,
                      fontWeight: "400",
                      backgroundColor: PILL_BACKGROUND,
                      color: "#334155",
                      pointerEvents: "none",
                      cursor: "default",
                    }}
                    collapse={false}
                    badgeOptions={{
                      compactBorderless: true,
                      fullBorder: false,
                    }}
                    motionOptions={{
                      resizeMode: PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE,
                    }}
                    content={label.text}
                    onClick={noopMouseEventHandler}
                    onDoubleClick={noopMouseEventHandler}
                    onMouseDown={noopMouseEventHandler}
                    onMouseUp={noopMouseUpHandler}
                    onMouseEnter={noopMouseEventHandler}
                    onMouseLeave={noopMouseEventHandler}
                  />
                </div>
              </foreignObject>
            );
          })
        : null}
      {showOverlayLayer && tooltip ? (
        <foreignObject
          x={tooltipRectX}
          y={tooltipRectY}
          width={tooltip.width}
          height={tooltip.height}
          style={{
            overflow: "visible",
            pointerEvents: tooltip.onClose ? "all" : "none",
          }}
        >
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            style={{
              position: "relative",
              width: `${tooltip.width}px`,
              height: `${tooltip.height}px`,
              overflow: "visible",
              pointerEvents: tooltip.onClose ? "all" : "none",
            }}
          >
            <PillbuttonLabelMarker
              placement={{
                attach:
                  tooltip.anchorAttach ??
                  (tooltip.onClose
                    ? POINT_LABEL_ATTACH.RIGHT
                    : POINT_LABEL_ATTACH.CENTER),
                offsetX:
                  tooltip.anchorAttach === POINT_LABEL_ATTACH.LEFT
                    ? 0
                    : tooltip.anchorAttach === POINT_LABEL_ATTACH.RIGHT
                    ? tooltip.width
                    : tooltip.onClose
                    ? tooltip.width
                    : tooltip.width * 0.5,
                offsetY: tooltip.height * 0.5,
              }}
              containerStyle={{
                ...PILL_BASE_STYLES,
                border: "none",
                fontSize: "11px",
                fontFamily: PILL_FONT_FAMILY,
                fontWeight: "400",
                backgroundColor: PILL_BACKGROUND,
                color: "#334155",
                pointerEvents: tooltip.onClose ? "auto" : "none",
                cursor: tooltip.onClose ? "pointer" : "default",
              }}
              badgeStyle={{
                backgroundColor: tooltip.onClose
                  ? CLOSE_BADGE_BACKGROUND
                  : undefined,
                color: tooltip.onClose ? "#ffffff" : undefined,
              }}
              collapse={false}
              badgeContent={tooltip.onClose ? CLOSE_BADGE_CONTENT : undefined}
              badgeOptions={{
                position: tooltip.onClose
                  ? PILLBUTTON_BADGE_POSITIONS.RIGHT
                  : undefined,
                compactBorderless: false,
                fullBorder: false,
              }}
              motionOptions={{
                resizeMode: PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE,
              }}
              content={
                <span style={{ fontSize: `${PILL_FONT_SIZE_PX}px` }}>
                  {tooltip.children}
                </span>
              }
              onClick={tooltip.onClose ?? noopMouseEventHandler}
              onDoubleClick={noopMouseEventHandler}
              onMouseDown={noopMouseEventHandler}
              onMouseUp={noopMouseUpHandler}
              onMouseEnter={noopMouseEventHandler}
              onMouseLeave={noopMouseEventHandler}
            />
          </div>
        </foreignObject>
      ) : null}
    </g>
  );
};

export const PlotHoverReadoutLayers = ({
  readoutKey,
  ...props
}: PlotHoverReadoutLayersProps) => (
  <>
    <PlotHoverReadout
      key={readoutKey ? `${readoutKey}-guides` : undefined}
      {...props}
      axisValueLabels={[]}
      renderMode="guides"
    />
    <PlotHoverReadout
      key={readoutKey ? `${readoutKey}-overlay` : undefined}
      {...props}
      renderMode="overlays"
    />
  </>
);
