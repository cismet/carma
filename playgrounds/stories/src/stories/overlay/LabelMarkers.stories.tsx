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
} from "../../../../../libraries/providers/label-overlay/src";

type LabelMarkersStoryArgs = PointLabelStyleProps & {
  content: ReactNode;
  compactContent?: ReactNode;
  markerContent?: ReactNode;
  pitch: number;
  selected: boolean;
  isOccluded: boolean;
  hideMarker: boolean;
  hideLabelAndStem: boolean;
  collapse: boolean;
  forceCollapse: boolean;
  fullBorder: boolean;
  resizeMode: "none" | "fast-grow-slow-shrink";
  labelAttach: PointLabelAttach;
  labelOffsetX: number;
  labelOffsetY: number;
  stemAngleRad: number;
  stemStartDistancePx: number;
  stemEndDistancePx: number;
};

const ATTACHES: PointLabelAttach[] = ["left", "center", "right"];

const sampleCellStyle: CSSProperties = {
  position: "relative",
  width: 230,
  height: 112,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#ffffff",
  overflow: "hidden",
};

const centeredAnchorStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
};

const pageStyle: CSSProperties = {
  fontFamily: "sans-serif",
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

const NodeMarkerStory = ({ markerContent, ...args }: LabelMarkersStoryArgs) => {
  const effectiveMarkerContent =
    markerContent ?? args.compactContent ?? args.markerContent;

  return (
    <div style={pageStyle}>
      <p>
        Node marker only. Left: plain node. Right: compact badge marker used by
        measurement labels.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={sampleCellStyle}>
          <div style={centeredAnchorStyle}>
            <PointLabelMarker
              pointId="node-marker-outline"
              markerSize={args.markerSize ?? 10}
              markerStrokeWidth={args.markerStrokeWidth ?? 1}
              markerContent={undefined}
              isOccluded={args.isOccluded}
              markerBackgroundColor={
                args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"
              }
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
        </div>
        <div style={sampleCellStyle}>
          <div style={centeredAnchorStyle}>
            <PointLabelMarker
              pointId="node-marker-badge"
              markerSize={args.markerSize ?? 10}
              markerStrokeWidth={args.markerStrokeWidth ?? 1}
              markerContent={effectiveMarkerContent}
              isOccluded={args.isOccluded}
              markerBackgroundColor={
                args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"
              }
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
        </div>
      </div>
    </div>
  );
};

const StemStory = (args: LabelMarkersStoryArgs) => (
  <div style={pageStyle}>
    <p>Stem only. Adjust angle and start/end anchors via controls.</p>
    <div style={sampleCellStyle}>
      <div style={centeredAnchorStyle}>
        <PointLabelStem
          angleRad={args.stemAngleRad}
          anchors={{
            startDistancePx: args.stemStartDistancePx,
            endDistancePx: args.stemEndDistancePx,
          }}
          lineColor={args.lineColor ?? "white"}
          lineWidth={args.lineWidth ?? 1}
          isOccluded={args.isOccluded}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 6,
          height: 6,
          borderRadius: "999px",
          background: "#6b7280",
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  </div>
);

const LabelStory = (args: LabelMarkersStoryArgs) => {
  const sharedStyleProps = makeSharedStyleProps(args);
  const labelBorderStyle = `${sharedStyleProps.lineWidth ?? 1}px ${
    args.isOccluded ? "dashed" : "solid"
  } ${sharedStyleProps.lineColor ?? "white"}`;

  return (
    <div style={pageStyle}>
      <p>
        Label only (pill/capsule). Anchor placements are shown for all sides.
      </p>
      <table>
        <thead>
          <tr>
            <th>Anchor</th>
            <th>Pill Label</th>
          </tr>
        </thead>
        <tbody>
          {ATTACHES.map((attach) => (
            <tr key={attach}>
              <td>
                <code>{attach}</code>
              </td>
              <td>
                <div style={sampleCellStyle}>
                  <div style={{ position: "absolute", left: 110, top: 56 }}>
                    <PillbuttonLabelMarker
                      pointId={`pill-${attach}`}
                      labelAttach={attach}
                      labelOffsetX={args.labelOffsetX}
                      labelOffsetY={args.labelOffsetY}
                      baseStyles={pointLabelBaseStyles}
                      labelBorderStyle={labelBorderStyle}
                      fontSize={sharedStyleProps.fontSize ?? "12px"}
                      fontFamily={
                        sharedStyleProps.fontFamily ?? "Arial, sans-serif"
                      }
                      fontWeight={sharedStyleProps.fontWeight ?? "400"}
                      backgroundColor={
                        sharedStyleProps.textBackgroundColor ??
                        POINT_LABEL_TEXT_BACKGROUND_COLOR
                      }
                      textColor={sharedStyleProps.textColor ?? "black"}
                      pointerEvents="auto"
                      cursor="pointer"
                      collapse={args.collapse}
                      markerContent={args.compactContent}
                      markerBackgroundColor={
                        sharedStyleProps.markerBackgroundColor
                      }
                      markerTextColor={sharedStyleProps.markerTextColor}
                      compactBorderless={args.compactBorderless}
                      fullBorder={args.fullBorder}
                      solidBorderStyle={labelBorderStyle}
                      resizeMode={args.resizeMode}
                      content={args.content}
                      onClick={noopMouseEventHandler}
                      onDoubleClick={noopMouseEventHandler}
                      onMouseDown={noopMouseEventHandler}
                      onMouseUp={noopMouseEventHandler}
                      onMouseEnter={noopHoverHandler}
                      onMouseLeave={noopHoverHandler}
                    />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const CombinedStory = (args: LabelMarkersStoryArgs) => {
  const sharedStyleProps = makeSharedStyleProps(args);
  return (
    <div style={pageStyle}>
      <p>
        Combined marker + stem + label using measurement-mode defaults. Use
        controls to inspect all props.
      </p>
      <div style={sampleCellStyle}>
        <div style={{ position: "absolute", left: 30, top: 78 }}>
          <PointLabel
            pointId="combined-label"
            content={args.content}
            compactContent={args.compactContent}
            pitch={args.pitch}
            selected={args.selected}
            isOccluded={args.isOccluded}
            hideLabelAndStem={args.hideLabelAndStem}
            hideMarker={args.hideMarker}
            labelAttach={args.labelAttach}
            collapse={args.collapse}
            forceCollapse={args.forceCollapse}
            fullBorder={args.fullBorder}
            resizeMode={args.resizeMode}
            {...sharedStyleProps}
          />
        </div>
      </div>
    </div>
  );
};

const MEASUREMENT_MODE_DEFAULTS: LabelMarkersStoryArgs = {
  content: "14,92 m",
  compactContent: "7",
  markerContent: "7",
  pitch: -Math.PI / 4,
  selected: false,
  isOccluded: false,
  hideMarker: false,
  hideLabelAndStem: false,
  collapse: true,
  forceCollapse: false,
  fullBorder: false,
  resizeMode: "none",
  labelAttach: "left",
  labelOffsetX: 32,
  labelOffsetY: -12,
  stemAngleRad: -Math.PI / 4,
  stemStartDistancePx: 5,
  stemEndDistancePx: 36,
  fontSize: "12px",
  fontFamily: "Arial, sans-serif",
  fontWeight: "400",
  textColor: "black",
  textBackgroundColor: POINT_LABEL_TEXT_BACKGROUND_COLOR,
  selectedBackgroundColor: POINT_LABEL_SELECTED_BACKGROUND_COLOR,
  hoverBackgroundColor: POINT_LABEL_HOVER_BACKGROUND_COLOR,
  lineColor: "white",
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
  title: "Overlay/Label Markers",
  component: PointLabel,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    content: { control: { type: "text" } },
    compactContent: { control: { type: "text" } },
    markerContent: { control: { type: "text" } },
    selected: { control: { type: "boolean" } },
    isOccluded: { control: { type: "boolean" } },
    hideMarker: { control: { type: "boolean" } },
    hideLabelAndStem: { control: { type: "boolean" } },
    collapse: { control: { type: "boolean" } },
    forceCollapse: { control: { type: "boolean" } },
    fullBorder: { control: { type: "boolean" } },
    compactBorderless: { control: { type: "boolean" } },
    resizeMode: {
      control: { type: "inline-radio" },
      options: ["none", "fast-grow-slow-shrink"],
    },
    labelAttach: {
      control: { type: "inline-radio" },
      options: ATTACHES,
    },
    pitch: { control: { type: "range", min: -1.4, max: 1.4, step: 0.02 } },
    labelDistance: { control: { type: "range", min: 10, max: 90, step: 1 } },
    lineWidth: { control: { type: "range", min: 1, max: 4, step: 0.5 } },
    markerSize: { control: { type: "range", min: 8, max: 24, step: 1 } },
    markerStrokeWidth: {
      control: { type: "range", min: 1, max: 3, step: 0.5 },
    },
    labelOffsetX: { control: { type: "range", min: -120, max: 120, step: 1 } },
    labelOffsetY: { control: { type: "range", min: -120, max: 120, step: 1 } },
    stemAngleRad: {
      control: { type: "range", min: -Math.PI, max: Math.PI, step: 0.02 },
    },
    stemStartDistancePx: {
      control: { type: "range", min: 0, max: 80, step: 1 },
    },
    stemEndDistancePx: {
      control: { type: "range", min: 0, max: 140, step: 1 },
    },
    fontSize: { control: { type: "text" } },
  },
};

export default meta;

export const NodeMarker: StoryObj<LabelMarkersStoryArgs> = {
  args: MEASUREMENT_MODE_DEFAULTS,
  render: (args) => <NodeMarkerStory {...args} />,
};

export const Stem: StoryObj<LabelMarkersStoryArgs> = {
  args: MEASUREMENT_MODE_DEFAULTS,
  render: (args) => <StemStory {...args} />,
};

export const Labels: StoryObj<LabelMarkersStoryArgs> = {
  args: MEASUREMENT_MODE_DEFAULTS,
  render: (args) => <LabelStory {...args} />,
};

export const CombinedMeasurementDefaults: StoryObj<LabelMarkersStoryArgs> = {
  args: MEASUREMENT_MODE_DEFAULTS,
  render: (args) => <CombinedStory {...args} />,
};
