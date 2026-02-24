import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties, ReactNode } from "react";
import {
  PointLabel,
  type PointLabelAttach,
  type PointLabelStyleProps,
} from "../../../../../libraries/providers/label-overlay/src";

type LabelMarkersStoryProps = PointLabelStyleProps & {
  content: ReactNode;
  compactContent?: ReactNode;
  pitch: number;
  selected: boolean;
  isOccluded: boolean;
  hideMarker: boolean;
  collapse: boolean;
  fullBorder: boolean;
  resizeMode: "none" | "fast-grow-slow-shrink";
};

const ATTACHES: PointLabelAttach[] = [
  "bottomLeft",
  "bottomRight",
  "topRight",
  "topLeft",
];

const sampleCellStyle: CSSProperties = {
  position: "relative",
  width: 230,
  height: 112,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#fff",
  overflow: "hidden",
};

const pageStyle: CSSProperties = {
  fontFamily: "sans-serif",
};

const makeSharedStyleProps = (
  args: LabelMarkersStoryProps
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
  markerBackgroundColor: args.markerBackgroundColor,
  markerTextColor: args.markerTextColor,
  labelDistance: args.labelDistance,
});

const LabelMarkersStory = ({
  content,
  compactContent,
  pitch,
  selected,
  isOccluded,
  hideMarker,
  collapse,
  fullBorder,
  resizeMode,
  ...styleArgs
}: LabelMarkersStoryProps) => {
  const args: LabelMarkersStoryProps = {
    content,
    compactContent,
    pitch,
    selected,
    isOccluded,
    hideMarker,
    collapse,
    fullBorder,
    resizeMode,
    ...styleArgs,
  };
  const sharedStyleProps = makeSharedStyleProps(args);

  return (
    <div style={pageStyle}>
      <p>
        PointLabel variants used in Geoportal measurements. Includes both
        PointLabelMarker and PillbuttonLabelMarker with all 4 anchor points.
      </p>
      <table>
        <thead>
          <tr>
            <th>Anchor</th>
            <th>PointLabelMarker</th>
            <th>PillbuttonLabelMarker</th>
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
                  <div style={{ position: "absolute", left: 20, top: 78 }}>
                    <PointLabel
                      pointId={`point-${attach}`}
                      content={content}
                      labelAttach={attach}
                      pitch={pitch}
                      selected={selected}
                      isOccluded={isOccluded}
                      hideMarker={hideMarker}
                      collapse={false}
                      {...sharedStyleProps}
                    />
                  </div>
                </div>
              </td>
              <td>
                <div style={sampleCellStyle}>
                  <div style={{ position: "absolute", left: 20, top: 78 }}>
                    <PointLabel
                      pointId={`pill-${attach}`}
                      content={content}
                      compactContent={compactContent}
                      fullBorder={fullBorder}
                      resizeMode={resizeMode}
                      labelAttach={attach}
                      pitch={pitch}
                      selected={selected}
                      isOccluded={isOccluded}
                      hideMarker={hideMarker}
                      collapse={collapse}
                      {...sharedStyleProps}
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

const meta: Meta<LabelMarkersStoryProps> = {
  title: "Overlay/Label Markers",
  component: LabelMarkersStory,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    content: { control: { type: "text" } },
    compactContent: { control: { type: "text" } },
    selected: { control: { type: "boolean" } },
    isOccluded: { control: { type: "boolean" } },
    hideMarker: { control: { type: "boolean" } },
    collapse: { control: { type: "boolean" } },
    fullBorder: { control: { type: "boolean" } },
    resizeMode: {
      control: { type: "inline-radio" },
      options: ["none", "fast-grow-slow-shrink"],
    },
    pitch: { control: { type: "range", min: -1.4, max: 1.4, step: 0.02 } },
    labelDistance: { control: { type: "range", min: 10, max: 90, step: 1 } },
    lineWidth: { control: { type: "range", min: 1, max: 4, step: 0.5 } },
    markerSize: { control: { type: "range", min: 8, max: 24, step: 1 } },
    markerStrokeWidth: {
      control: { type: "range", min: 1, max: 3, step: 0.5 },
    },
    fontSize: { control: { type: "text" } },
  },
};

export default meta;

export const Labels: StoryObj<LabelMarkersStoryProps> = {
  args: {
    content: "A 132,1m",
    compactContent: "A",
    pitch: -Math.PI / 4,
    selected: false,
    isOccluded: false,
    hideMarker: false,
    collapse: true,
    fullBorder: false,
    resizeMode: "none",
    fontSize: "12px",
    fontFamily: "sans-serif",
    fontWeight: "400",
    textColor: "black",
    textBackgroundColor: "rgba(200, 200, 200, 0.7)",
    selectedBackgroundColor: "rgba(255, 229, 143, 0.7)",
    hoverBackgroundColor: "rgba(255, 247, 230, 0.7)",
    lineColor: "white",
    lineWidth: 1,
    markerSize: 10,
    markerStrokeWidth: 1,
    markerBackgroundColor: "rgba(200, 200, 200, 0.92)",
    markerTextColor: "#111111",
    stemStartDistance: 5,
    labelDistance: 20,
  },
};
