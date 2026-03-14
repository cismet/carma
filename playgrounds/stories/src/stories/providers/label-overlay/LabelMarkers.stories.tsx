import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties, ReactNode } from "react";
import type { CssPixelPosition } from "@carma/units/types";
import { createScreenPointSvgLineVisualizers } from "@carma-commons/svg";
import {
  PillbuttonLabelMarker,
  PointLabel,
  PointLabelMarker,
  type PointLabelAttach,
  type PointLabelStyleProps,
} from "@carma-providers/label-overlay";

type LabelMarkersStoryArgs = PointLabelStyleProps & {
  content: ReactNode;
  compactContent?: ReactNode;
  markerContent?: ReactNode;
  showDebugAnchors?: boolean;
};

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const LABEL_MARKERS_FONT_FAMILY =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const frameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: 560,
  overflow: "auto",
  background: "#f8fafc",
};

const pageStyle: CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "20px 24px 28px",
  color: "#0f172a",
  fontSize: 14,
  lineHeight: 1.45,
  fontFamily: LABEL_MARKERS_FONT_FAMILY,
  userSelect: "text",
};

const headingStyle: CSSProperties = {
  marginBottom: 16,
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
};

const sectionStyle: CSSProperties = {
  marginBottom: 18,
};

const sectionTitleStyle: CSSProperties = {
  marginBottom: 10,
  fontSize: 14,
  fontWeight: 600,
  color: "#334155",
};

const rowListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 34,
};

const rowLabelStyle: CSSProperties = {
  width: 240,
  textAlign: "left",
  whiteSpace: "nowrap",
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.3,
};

const rowGraphicStyle: CSSProperties = {
  position: "relative",
  minWidth: 320,
  height: 34,
  overflow: "visible",
};

const anchorStyle: CSSProperties = {
  position: "absolute",
  left: 24,
  top: "50%",
  transform: "translateY(-50%)",
};

const AnchorHairlineDebug = ({ visible }: { visible: boolean }) => {
  if (!visible) {
    return null;
  }

  const hairlinePx =
    typeof window !== "undefined" && window.devicePixelRatio > 0
      ? 1 / window.devicePixelRatio
      : 1;

  return (
    <>
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 16,
          height: hairlinePx,
          transform: "translate(-8px, -50%)",
          background: "rgba(59, 130, 246, 0.55)",
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: hairlinePx,
          height: 16,
          transform: "translate(-50%, -8px)",
          background: "rgba(59, 130, 246, 0.55)",
          pointerEvents: "none",
        }}
      />
    </>
  );
};

const pointLabelBaseStyles: CSSProperties = {
  padding: "2px 4px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
};

const noopMouseEventHandler = () => undefined;
const noopHoverHandler = () => undefined;

const makeSharedStyleProps = (
  args: LabelMarkersStoryArgs
): PointLabelStyleProps => ({
  fontSize: args.fontSize,
  fontFamily: args.fontFamily,
  fontWeight: args.fontWeight,
  textColor: args.textColor,
  textBackgroundColor: args.textBackgroundColor,
  selectedBackgroundColor: args.selectedBackgroundColor,
  hoverBackgroundColor: args.hoverBackgroundColor,
  lineColor: args.lineColor,
  lineWidth: args.lineWidth,
  markerSize: args.markerSize,
  markerStrokeWidth: args.markerStrokeWidth,
  stemStartDistance: args.stemStartDistance,
  markerBackgroundColor: args.markerBackgroundColor,
  markerTextColor: args.markerTextColor,
  labelDistance: args.labelDistance,
});

const InlineRow = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div style={rowStyle}>
    <div style={rowLabelStyle}>{label}</div>
    <div style={rowGraphicStyle}>{children}</div>
  </div>
);

const GeneratedStemPreview = ({
  angleRad,
  anchors,
  lineColor,
  lineWidth,
  isOccluded,
}: {
  angleRad: number;
  anchors: { startDistancePx: number; endDistancePx: number };
  lineColor: string;
  lineWidth: number;
  isOccluded: boolean;
}) => {
  const [line] = createScreenPointSvgLineVisualizers({
    id: "stem-preview",
    start: toCssPixelPosition(anchors.startDistancePx, 0),
    end: toCssPixelPosition(anchors.endDistancePx, 0),
    stroke: lineColor,
    strokeWidth: Math.max(lineWidth, 1),
    dashed: isOccluded,
    capStyle: "round",
    dashLengthRatio: 1,
    dashGapRatio: 1,
  });

  const strokeWidth = Math.max(line.strokeWidth ?? lineWidth, 1);
  const sidePadding = Math.max(strokeWidth * 1.5, 3);
  const minX = Math.min(anchors.startDistancePx, anchors.endDistancePx) - sidePadding;
  const maxX = Math.max(anchors.startDistancePx, anchors.endDistancePx) + sidePadding;
  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(16, strokeWidth * 4);
  const centerY = height * 0.5;
  const x1 = anchors.startDistancePx - minX;
  const x2 = anchors.endDistancePx - minX;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transformOrigin: "0 0",
        transform: `rotate(${angleRad}rad)`,
        pointerEvents: "none",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          position: "absolute",
          left: minX,
          top: -centerY,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <line
          x1={x1}
          y1={centerY}
          x2={x2}
          y2={centerY}
          stroke={line.stroke ?? lineColor}
          strokeWidth={strokeWidth}
          strokeLinecap={line.strokeLinecap ?? "round"}
          strokeDasharray={line.strokeDasharray ?? "none"}
          strokeDashoffset={line.strokeDashoffset ?? 0}
          opacity={line.opacity ?? 1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};

const RepresentativeCasesStory = (args: LabelMarkersStoryArgs) => {
  const sharedStyleProps = makeSharedStyleProps(args);
  const showDebugAnchors = args.showDebugAnchors === true;
  const labelBorderStyle = `${sharedStyleProps.lineWidth ?? 1}px solid ${
    sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
  }`;

  return (
    <div style={frameStyle}>
      <div style={pageStyle}>
        <div style={headingStyle}>Representative Cases</div>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>varying: marker content, size, occlusion</div>
          <div style={rowListStyle}>
            <InlineRow label="outline (size 8)">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <PointLabelMarker
                  pointId="node-outline-sm"
                  markerSize={8}
                  markerStrokeWidth={args.markerStrokeWidth ?? 1}
                  isOccluded={false}
                  markerBackgroundColor={args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"}
                  markerTextColor={args.markerTextColor ?? "#111111"}
                  pointerEvents="auto"
                  cursor="pointer"
                  onClick={noopMouseEventHandler}
                  onDoubleClick={noopMouseEventHandler}
                  onMouseDown={noopMouseEventHandler}
                  onMouseUp={noopMouseEventHandler}
                  onMouseEnter={noopHoverHandler}
                  onMouseLeave={noopHoverHandler}
                />
              </div>
            </InlineRow>
            <InlineRow label="outline (size 16)">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <PointLabelMarker
                  pointId="node-outline-lg"
                  markerSize={16}
                  markerStrokeWidth={args.markerStrokeWidth ?? 1}
                  isOccluded={false}
                  markerBackgroundColor={args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"}
                  markerTextColor={args.markerTextColor ?? "#111111"}
                  pointerEvents="auto"
                  cursor="pointer"
                  onClick={noopMouseEventHandler}
                  onDoubleClick={noopMouseEventHandler}
                  onMouseDown={noopMouseEventHandler}
                  onMouseUp={noopMouseEventHandler}
                  onMouseEnter={noopHoverHandler}
                  onMouseLeave={noopHoverHandler}
                />
              </div>
            </InlineRow>
            <InlineRow label="badge (7)">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <PointLabelMarker
                  pointId="node-badge-7"
                  markerSize={10}
                  markerStrokeWidth={args.markerStrokeWidth ?? 1}
                  markerContent={args.compactContent ?? "7"}
                  isOccluded={false}
                  markerBackgroundColor={args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"}
                  markerTextColor={args.markerTextColor ?? "#111111"}
                  pointerEvents="auto"
                  cursor="pointer"
                  onClick={noopMouseEventHandler}
                  onDoubleClick={noopMouseEventHandler}
                  onMouseDown={noopMouseEventHandler}
                  onMouseUp={noopMouseEventHandler}
                  onMouseEnter={noopHoverHandler}
                  onMouseLeave={noopHoverHandler}
                />
              </div>
            </InlineRow>
            <InlineRow label="badge (12)">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <PointLabelMarker
                  pointId="node-badge-12"
                  markerSize={10}
                  markerStrokeWidth={args.markerStrokeWidth ?? 1}
                  markerContent="12"
                  isOccluded={false}
                  markerBackgroundColor={args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"}
                  markerTextColor={args.markerTextColor ?? "#111111"}
                  pointerEvents="auto"
                  cursor="pointer"
                  onClick={noopMouseEventHandler}
                  onDoubleClick={noopMouseEventHandler}
                  onMouseDown={noopMouseEventHandler}
                  onMouseUp={noopMouseEventHandler}
                  onMouseEnter={noopHoverHandler}
                  onMouseLeave={noopHoverHandler}
                />
              </div>
            </InlineRow>
            <InlineRow label="badge occluded">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <PointLabelMarker
                  pointId="node-badge-occluded"
                  markerSize={10}
                  markerStrokeWidth={args.markerStrokeWidth ?? 1}
                  markerContent={args.compactContent ?? "7"}
                  isOccluded
                  markerBackgroundColor={args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"}
                  markerTextColor={args.markerTextColor ?? "#111111"}
                  pointerEvents="auto"
                  cursor="pointer"
                  onClick={noopMouseEventHandler}
                  onDoubleClick={noopMouseEventHandler}
                  onMouseDown={noopMouseEventHandler}
                  onMouseUp={noopMouseEventHandler}
                  onMouseEnter={noopHoverHandler}
                  onMouseLeave={noopHoverHandler}
                />
              </div>
            </InlineRow>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>varying: stem angle, distances, occlusion</div>
          <div style={rowListStyle}>
            <InlineRow label="-90°, start 5, end 36">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <GeneratedStemPreview
                  angleRad={-Math.PI * 0.5}
                  anchors={{ startDistancePx: 5, endDistancePx: 36 }}
                  lineColor={sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"}
                  lineWidth={sharedStyleProps.lineWidth ?? 1}
                  isOccluded={false}
                />
              </div>
            </InlineRow>
            <InlineRow label="-45°, start 5, end 44">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <GeneratedStemPreview
                  angleRad={-Math.PI * 0.25}
                  anchors={{ startDistancePx: 5, endDistancePx: 44 }}
                  lineColor={sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"}
                  lineWidth={sharedStyleProps.lineWidth ?? 1}
                  isOccluded={false}
                />
              </div>
            </InlineRow>
            <InlineRow label="0°, start 8, end 52">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <GeneratedStemPreview
                  angleRad={0}
                  anchors={{ startDistancePx: 8, endDistancePx: 52 }}
                  lineColor={sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"}
                  lineWidth={sharedStyleProps.lineWidth ?? 1}
                  isOccluded={false}
                />
              </div>
            </InlineRow>
            <InlineRow label="+45°, start 5, end 60">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <GeneratedStemPreview
                  angleRad={Math.PI * 0.25}
                  anchors={{ startDistancePx: 5, endDistancePx: 60 }}
                  lineColor={sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"}
                  lineWidth={sharedStyleProps.lineWidth ?? 1}
                  isOccluded={false}
                />
              </div>
            </InlineRow>
            <InlineRow label="+90°, occluded">
              <div style={anchorStyle}>
                <AnchorHairlineDebug visible={showDebugAnchors} />
                <GeneratedStemPreview
                  angleRad={Math.PI * 0.5}
                  anchors={{ startDistancePx: 5, endDistancePx: 36 }}
                  lineColor={sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"}
                  lineWidth={sharedStyleProps.lineWidth ?? 1}
                  isOccluded
                />
              </div>
            </InlineRow>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>varying: attach, collapse, content length</div>
          <div style={rowListStyle}>
            {([
              {
                id: "label-left",
                label: "attach left",
                attach: "left" as PointLabelAttach,
                content: "14,92 m",
                collapse: false,
                fullBorder: false,
                compactBorderless: false,
              },
              {
                id: "label-center",
                label: "attach center",
                attach: "center" as PointLabelAttach,
                content: "392.5px screen distance",
                collapse: false,
                fullBorder: false,
                compactBorderless: false,
              },
              {
                id: "label-right-selected",
                label: "attach right (selected)",
                attach: "right" as PointLabelAttach,
                content: "selected",
                collapse: false,
                fullBorder: true,
                compactBorderless: false,
                backgroundColor: "rgba(251, 191, 36, 0.95)",
              },
              {
                id: "label-collapsed",
                label: "collapsed compact",
                attach: "left" as PointLabelAttach,
                content: "14,92 m",
                collapse: true,
                fullBorder: false,
                compactBorderless: false,
                markerContent: args.compactContent ?? "7",
              },
            ] as const).map((entry) => (
              <InlineRow key={entry.id} label={entry.label}>
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <PillbuttonLabelMarker
                    pointId={`pill-${entry.id}`}
                    labelAttach={entry.attach}
                    labelOffsetX={0}
                    labelOffsetY={0}
                    baseStyles={pointLabelBaseStyles}
                    labelBorderStyle={labelBorderStyle}
                    fontSize={sharedStyleProps.fontSize ?? "12px"}
                    fontFamily={
                      sharedStyleProps.fontFamily ?? LABEL_MARKERS_FONT_FAMILY
                    }
                    fontWeight={sharedStyleProps.fontWeight ?? "400"}
                    backgroundColor={
                      entry.backgroundColor ??
                      sharedStyleProps.textBackgroundColor ??
                      "rgba(255, 255, 255, 0.98)"
                    }
                    textColor={sharedStyleProps.textColor ?? "black"}
                    pointerEvents="auto"
                    cursor="pointer"
                    collapse={entry.collapse}
                    markerContent={entry.markerContent}
                    markerBackgroundColor={sharedStyleProps.markerBackgroundColor}
                    markerTextColor={sharedStyleProps.markerTextColor}
                    compactBorderless={entry.compactBorderless}
                    fullBorder={entry.fullBorder}
                    solidBorderStyle={labelBorderStyle}
                    resizeMode="none"
                    content={entry.content}
                    onClick={noopMouseEventHandler}
                    onDoubleClick={noopMouseEventHandler}
                    onMouseDown={noopMouseEventHandler}
                    onMouseUp={noopMouseEventHandler}
                    onMouseEnter={noopHoverHandler}
                    onMouseLeave={noopHoverHandler}
                  />
                </div>
              </InlineRow>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>varying: combined defaults</div>
          <div style={rowListStyle}>
            {([
              {
                id: "combined-default",
                label: "default",
                selected: false,
                isOccluded: false,
                collapse: true,
                forceCollapse: false,
                pitch: -Math.PI / 4,
                labelAttach: "left" as PointLabelAttach,
                hideMarker: false,
                hideLabelAndStem: false,
              },
              {
                id: "combined-selected",
                label: "selected",
                selected: true,
                isOccluded: false,
                collapse: true,
                forceCollapse: false,
                pitch: -Math.PI / 4,
                labelAttach: "left" as PointLabelAttach,
                hideMarker: false,
                hideLabelAndStem: false,
              },
              {
                id: "combined-occluded",
                label: "occluded",
                selected: false,
                isOccluded: true,
                collapse: true,
                forceCollapse: false,
                pitch: -Math.PI / 4,
                labelAttach: "left" as PointLabelAttach,
                hideMarker: false,
                hideLabelAndStem: false,
              },
            ] as const).map((entry) => (
              <InlineRow key={entry.id} label={entry.label}>
                <div style={{ ...anchorStyle, top: "54%" }}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <PointLabel
                    pointId={entry.id}
                    content={args.content}
                    compactContent={args.compactContent}
                    pitch={entry.pitch}
                    selected={entry.selected}
                    isOccluded={entry.isOccluded}
                    hideLabelAndStem={entry.hideLabelAndStem}
                    hideMarker={entry.hideMarker}
                    labelAttach={entry.labelAttach}
                    collapse={entry.collapse}
                    forceCollapse={entry.forceCollapse}
                    fullBorder={false}
                    resizeMode="none"
                    {...sharedStyleProps}
                  />
                </div>
              </InlineRow>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

const MEASUREMENT_MODE_DEFAULTS: LabelMarkersStoryArgs = {
  content: "14,92 m",
  compactContent: "7",
  markerContent: "7",
  fontSize: "12px",
  fontFamily: LABEL_MARKERS_FONT_FAMILY,
  fontWeight: "500",
  textColor: "#0f172a",
  textBackgroundColor: "rgba(255, 255, 255, 0.98)",
  selectedBackgroundColor: "rgba(251, 191, 36, 0.95)",
  hoverBackgroundColor: "rgba(254, 243, 199, 0.98)",
  lineColor: "rgba(30, 58, 138, 0.98)",
  lineWidth: 1,
  markerSize: 10,
  markerStrokeWidth: 1,
  markerBackgroundColor: "rgba(15, 23, 42, 0.94)",
  markerTextColor: "#f8fafc",
  stemStartDistance: 5,
  labelDistance: 20,
  compactBorderless: false,
  showDebugAnchors: false,
};

const meta: Meta<LabelMarkersStoryArgs> = {
  title: "Providers/LabelOverlay",
  component: PointLabel,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const RepresentativeCases: StoryObj<LabelMarkersStoryArgs> = {
  name: "Representative Cases",
  args: MEASUREMENT_MODE_DEFAULTS,
  parameters: {
    controls: {
      include: ["showDebugAnchors"],
    },
  },
  argTypes: {
    showDebugAnchors: {
      control: { type: "boolean" },
    },
  },
  render: (args) => <RepresentativeCasesStory {...args} />,
};
