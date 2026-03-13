import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties, ReactNode } from "react";
import {
  PillbuttonLabelMarker,
  PointLabel,
  PointLabelMarker,
  PointLabelStem,
  POINT_LABEL_HOVER_BACKGROUND_COLOR,
  POINT_LABEL_SELECTED_BACKGROUND_COLOR,
  POINT_LABEL_TEXT_BACKGROUND_COLOR,
  type PointLabelAttach,
  type PointLabelStyleProps,
} from "@carma-providers/label-overlay";

type LabelMarkersStoryArgs = PointLabelStyleProps & {
  content: ReactNode;
  compactContent?: ReactNode;
  markerContent?: ReactNode;
};

const frameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: 560,
  overflow: "auto",
  background: "#fff",
};

const pageStyle: CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: "8px 16px 16px",
  color: "#000",
  fontSize: 12,
  lineHeight: 1.2,
  fontFamily: "monospace",
  userSelect: "text",
};

const headingStyle: CSSProperties = {
  marginBottom: 10,
};

const sectionStyle: CSSProperties = {
  marginBottom: 10,
};

const sectionTitleStyle: CSSProperties = {
  marginBottom: 4,
};

const rowListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const rowLabelStyle: CSSProperties = {
  width: 280,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const rowGraphicStyle: CSSProperties = {
  position: "relative",
  minWidth: 280,
  height: 30,
  overflow: "visible",
};

const anchorStyle: CSSProperties = {
  position: "absolute",
  left: 20,
  top: "50%",
  transform: "translateY(-50%)",
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

const RepresentativeCasesStory = (args: LabelMarkersStoryArgs) => {
  const sharedStyleProps = makeSharedStyleProps(args);
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
                <PointLabelStem
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
                <PointLabelStem
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
                <PointLabelStem
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
                <PointLabelStem
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
                <PointLabelStem
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
                backgroundColor: POINT_LABEL_SELECTED_BACKGROUND_COLOR,
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
                  <PillbuttonLabelMarker
                    pointId={`pill-${entry.id}`}
                    labelAttach={entry.attach}
                    labelOffsetX={32}
                    labelOffsetY={-12}
                    baseStyles={pointLabelBaseStyles}
                    labelBorderStyle={labelBorderStyle}
                    fontSize={sharedStyleProps.fontSize ?? "12px"}
                    fontFamily={sharedStyleProps.fontFamily ?? "monospace"}
                    fontWeight={sharedStyleProps.fontWeight ?? "400"}
                    backgroundColor={
                      entry.backgroundColor ??
                      sharedStyleProps.textBackgroundColor ??
                      POINT_LABEL_TEXT_BACKGROUND_COLOR
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
  fontFamily: "monospace",
  fontWeight: "400",
  textColor: "black",
  textBackgroundColor: POINT_LABEL_TEXT_BACKGROUND_COLOR,
  selectedBackgroundColor: POINT_LABEL_SELECTED_BACKGROUND_COLOR,
  hoverBackgroundColor: POINT_LABEL_HOVER_BACKGROUND_COLOR,
  lineColor: "rgba(30, 64, 175, 0.95)",
  lineWidth: 1,
  markerSize: 10,
  markerStrokeWidth: 1,
  markerBackgroundColor: "rgba(200, 200, 200, 0.92)",
  markerTextColor: "#111111",
  stemStartDistance: 5,
  labelDistance: 20,
  compactBorderless: false,
};

const meta: Meta<LabelMarkersStoryArgs> = {
  title: "SVG/Label Markers",
  component: PointLabel,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const RepresentativeCases: StoryObj<LabelMarkersStoryArgs> = {
  args: MEASUREMENT_MODE_DEFAULTS,
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: (args) => <RepresentativeCasesStory {...args} />,
};
