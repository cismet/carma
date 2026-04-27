import type { CSSProperties } from "react";

import type { Meta, StoryObj } from "@storybook/react";

import {
  ConnectorRibbon as ConnectorRibbonComponent,
  type ConnectorRibbonCurveMode,
} from "@carma-commons/ui/components";

import { CenteredStoryFrame } from "./centered-story-frame";

type ConnectorRibbonStoryAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ButtonCount = 1 | 2 | 4;

type ConnectorRibbonStoryArgs = {
  topWidth: number;
  bottomWidth: number;
  offsetX: number;
  verticalGap: number;
  topHeight: number;
  bottomHeight: number;
  color: string;
  background: string;
  buttonOpacity: number;
  topButtonCount: ButtonCount;
  bottomButtonCount: ButtonCount;
  capEdgeOpacity: number;
  controlOffsetFactor: number;
  curveMode: ConnectorRibbonCurveMode;
  showMiddleControlPoints: boolean;
};

type ConnectorRibbonSceneProps = ConnectorRibbonStoryArgs & {
  showDecorations: boolean;
  showDebugOverlay: boolean;
};

const SCENE_CENTER_X = 360;
const SCENE_PADDING_Y = 8;
const CANVAS_PADDING_X = 48;
const TOP_BUTTON_LABELS = ["L", "F", "M", "A"];
const BOTTOM_BUTTON_LABELS = ["S", "P", "D", "A"];
const TOOL_BUTTON_GAP = 12;

const storyFontFamily =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const demoStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
};

const variantGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 16,
  width: "100%",
};

const variantTitleStyle: CSSProperties = {
  margin: "0 0 4px",
  color: "#475569",
  fontFamily: storyFontFamily,
  fontSize: 13,
  fontWeight: 700,
};

const buildCanvasStyle = (
  height: number,
  showDecorations: boolean
): CSSProperties => ({
  position: "relative",
  width: "100%",
  height,
  border: showDecorations ? "1px solid #d1d5db" : 0,
  backgroundImage: showDecorations
    ? "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)"
    : undefined,
  backgroundSize: showDecorations ? "24px 24px" : undefined,
  overflow: "visible",
});

const buttonSurfaceStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 4px 14px rgba(15,23,42,0.16)",
  background: "#fff",
  color: "#111827",
  fontFamily: storyFontFamily,
  fontSize: 15,
  fontWeight: 600,
};

const toolRowStyle: CSSProperties = {
  position: "absolute",
  zIndex: 10,
  display: "flex",
  alignItems: "center",
};

const centerLineStyle: CSSProperties = {
  position: "absolute",
  left: CANVAS_PADDING_X,
  right: CANVAS_PADDING_X,
  height: 1,
  zIndex: 1,
  background:
    "repeating-linear-gradient(90deg, rgba(37,99,235,0.42) 0 6px, transparent 6px 12px)",
};

const debugControlLineStyle: CSSProperties = {
  stroke: "rgba(239,68,68,0.68)",
  strokeWidth: 1.5,
  strokeDasharray: "4 4",
};

const debugControlPointStyle: CSSProperties = {
  fill: "#ef4444",
  stroke: "#fff",
  strokeWidth: 2,
};

const componentPropTable = {
  table: { category: "Component props" },
};

const testOptionTable = {
  table: { category: "Test setup" },
};

const variantDefaults: ConnectorRibbonStoryArgs = {
  topWidth: 184,
  bottomWidth: 304,
  offsetX: 0,
  verticalGap: 64,
  topHeight: 36,
  bottomHeight: 44,
  color: "rgba(255, 255, 255, 0.8)",
  background: "#eef2f7",
  buttonOpacity: 1,
  topButtonCount: 1,
  bottomButtonCount: 4,
  capEdgeOpacity: 0,
  controlOffsetFactor: 1,
  curveMode: "bezier",
  showMiddleControlPoints: false,
};

const comparisonVariants: ReadonlyArray<{
  label: string;
  args: Partial<ConnectorRibbonStoryArgs>;
}> = [
  {
    label: "Centered groups",
    args: {},
  },
  {
    label: "Offset groups",
    args: {
      offsetX: -112,
      bottomWidth: 412,
      verticalGap: 88,
    },
  },
  {
    label: "Wide primary group",
    args: {
      topWidth: 256,
      topHeight: 38,
      offsetX: 12,
      bottomWidth: 320,
    },
  },
  {
    label: "Compact secondary group",
    args: {
      bottomButtonCount: 2,
      bottomWidth: 292,
      offsetX: -24,
    },
  },
];

const resolveControlPointOffsets = ({
  topHalfHeight,
  bottomHalfHeight,
  factor,
}: {
  topHalfHeight: number;
  bottomHalfHeight: number;
  factor: number;
}) => {
  const offsetFactor = Math.max(0, factor);

  return {
    topOffset: topHalfHeight * offsetFactor,
    bottomOffset: bottomHalfHeight * offsetFactor,
  };
};

const resolveSceneAnchors = ({
  topWidth,
  bottomWidth,
  offsetX,
  verticalGap,
  topHeight,
  bottomHeight,
}: Pick<
  ConnectorRibbonStoryArgs,
  | "topWidth"
  | "bottomWidth"
  | "offsetX"
  | "verticalGap"
  | "topHeight"
  | "bottomHeight"
>) => {
  const top: ConnectorRibbonStoryAnchor = {
    x: SCENE_CENTER_X - topWidth / 2,
    y: SCENE_PADDING_Y,
    width: topWidth,
    height: topHeight,
  };
  const bottom: ConnectorRibbonStoryAnchor = {
    x: SCENE_CENTER_X - bottomWidth / 2 + offsetX,
    y: SCENE_PADDING_Y + topHeight / 2 + verticalGap - bottomHeight / 2,
    width: bottomWidth,
    height: bottomHeight,
  };

  return { top, bottom };
};

const resolveSceneHeight = ({
  top,
  bottom,
}: {
  top: ConnectorRibbonStoryAnchor;
  bottom: ConnectorRibbonStoryAnchor;
}) => Math.max(top.y + top.height, bottom.y + bottom.height) + SCENE_PADDING_Y;

const MiddleControlPointsDebug = ({
  top,
  bottom,
  controlOffsetFactor,
  curveMode,
}: {
  top: ConnectorRibbonStoryAnchor;
  bottom: ConnectorRibbonStoryAnchor;
  controlOffsetFactor: number;
  curveMode: ConnectorRibbonCurveMode;
}) => {
  const topCenterY = top.y + top.height / 2;
  const bottomCenterY = bottom.y + bottom.height / 2;
  const middleHeight = bottomCenterY - topCenterY;
  const topLeft = top.x;
  const topRight = top.x + top.width;
  const bottomLeft = bottom.x;
  const bottomRight = bottom.x + bottom.width;
  const { topOffset, bottomOffset } = resolveControlPointOffsets({
    topHalfHeight: top.height / 2,
    bottomHalfHeight: bottom.height / 2,
    factor: curveMode === "linear" ? 0 : controlOffsetFactor,
  });
  const controlPairs = (() => {
    if (curveMode === "linear") {
      return [];
    }

    if (curveMode === "spline") {
      const midRight = (topRight + bottomRight) / 2;
      const midLeft = (topLeft + bottomLeft) / 2;
      const midY = topCenterY + middleHeight / 2;
      const rightHandleX = (bottomRight - topRight) / 6;
      const leftHandleX = (bottomLeft - topLeft) / 6;

      return [
        {
          start: { x: topRight, y: topCenterY },
          control: { x: topRight, y: topCenterY + topOffset },
        },
        {
          start: { x: midRight, y: midY },
          control: { x: midRight - rightHandleX, y: midY },
        },
        {
          start: { x: midRight, y: midY },
          control: { x: midRight + rightHandleX, y: midY },
        },
        {
          start: { x: bottomRight, y: bottomCenterY },
          control: { x: bottomRight, y: bottomCenterY - bottomOffset },
        },
        {
          start: { x: bottomLeft, y: bottomCenterY },
          control: { x: bottomLeft, y: bottomCenterY - bottomOffset },
        },
        {
          start: { x: midLeft, y: midY },
          control: { x: midLeft + leftHandleX, y: midY },
        },
        {
          start: { x: midLeft, y: midY },
          control: { x: midLeft - leftHandleX, y: midY },
        },
        {
          start: { x: topLeft, y: topCenterY },
          control: { x: topLeft, y: topCenterY + topOffset },
        },
      ];
    }

    return [
      {
        start: { x: topRight, y: topCenterY },
        control: { x: topRight, y: topCenterY + topOffset },
      },
      {
        start: { x: bottomRight, y: bottomCenterY },
        control: { x: bottomRight, y: bottomCenterY - bottomOffset },
      },
      {
        start: { x: bottomLeft, y: bottomCenterY },
        control: { x: bottomLeft, y: bottomCenterY - bottomOffset },
      },
      {
        start: { x: topLeft, y: topCenterY },
        control: { x: topLeft, y: topCenterY + topOffset },
      },
    ];
  })();

  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 11,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      {controlPairs.map(({ start, control }) => (
        <g key={`${start.x}-${start.y}-${control.y}`}>
          <line
            x1={start.x}
            y1={start.y}
            x2={control.x}
            y2={control.y}
            style={debugControlLineStyle}
          />
          <circle
            cx={control.x}
            cy={control.y}
            r={5}
            style={debugControlPointStyle}
          />
        </g>
      ))}
    </svg>
  );
};

const ToolButtonRow = ({
  x,
  y,
  width,
  height,
  buttonOpacity,
  buttonCount,
  singleLabel,
  labels,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  buttonOpacity: number;
  buttonCount: ButtonCount;
  singleLabel: string;
  labels: readonly string[];
}) => {
  const buttonWidth =
    (width - TOOL_BUTTON_GAP * (buttonCount - 1)) / buttonCount;
  const visibleLabels =
    buttonCount === 1 ? [singleLabel] : labels.slice(0, buttonCount);

  return (
    <div
      style={{
        ...toolRowStyle,
        left: x,
        top: y,
        width,
        height,
        gap: TOOL_BUTTON_GAP,
      }}
    >
      {visibleLabels.map((label) => (
        <div
          key={label}
          style={{
            ...buttonSurfaceStyle,
            width: buttonWidth,
            height,
            opacity: buttonOpacity,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
};

const ConnectorRibbonScene = ({
  topWidth,
  bottomWidth,
  offsetX,
  verticalGap,
  topHeight,
  bottomHeight,
  color,
  buttonOpacity,
  topButtonCount,
  bottomButtonCount,
  capEdgeOpacity,
  controlOffsetFactor,
  curveMode,
  showDecorations,
  showDebugOverlay,
}: ConnectorRibbonSceneProps) => {
  const { top, bottom } = resolveSceneAnchors({
    topWidth,
    bottomWidth,
    offsetX,
    verticalGap,
    topHeight,
    bottomHeight,
  });
  const topCenterY = top.y + top.height / 2;
  const bottomCenterY = bottom.y + bottom.height / 2;
  const bottomEdgeY = bottom.y + bottom.height;
  const sceneHeight = resolveSceneHeight({ top, bottom });

  return (
    <div style={buildCanvasStyle(sceneHeight, showDecorations)}>
      {showDecorations ? (
        <>
          <div style={{ ...centerLineStyle, top: topCenterY }} />
          <div style={{ ...centerLineStyle, top: bottomCenterY }} />
          <div style={{ ...centerLineStyle, top: bottomEdgeY }} />
        </>
      ) : null}
      <ConnectorRibbonComponent
        top={top}
        bottom={bottom}
        color={color}
        capEdgeOpacity={capEdgeOpacity}
        controlOffsetFactor={controlOffsetFactor}
        curveMode={curveMode}
      />
      {showDebugOverlay ? (
        <MiddleControlPointsDebug
          top={top}
          bottom={bottom}
          controlOffsetFactor={controlOffsetFactor}
          curveMode={curveMode}
        />
      ) : null}
      <ToolButtonRow
        x={top.x}
        y={top.y}
        width={top.width}
        height={top.height}
        buttonOpacity={buttonOpacity}
        buttonCount={topButtonCount}
        singleLabel="Primary"
        labels={TOP_BUTTON_LABELS}
      />
      <ToolButtonRow
        x={bottom.x}
        y={bottom.y}
        width={bottom.width}
        height={bottom.height}
        buttonOpacity={buttonOpacity}
        buttonCount={bottomButtonCount}
        singleLabel="Tool"
        labels={BOTTOM_BUTTON_LABELS}
      />
    </div>
  );
};

const ConnectorRibbonDemo = (args: ConnectorRibbonStoryArgs) => {
  const { top, bottom } = resolveSceneAnchors(args);
  const topCenterY = top.y + top.height / 2;
  const bottomCenterY = bottom.y + bottom.height / 2;

  return (
    <CenteredStoryFrame
      label="ConnectorRibbon"
      values={[
        `top center ${Math.round(topCenterY)}px`,
        `bottom center ${Math.round(bottomCenterY)}px`,
        `curve ${args.curveMode}`,
        `control offset ${args.controlOffsetFactor}x`,
      ]}
      background={args.background}
      contentStyle={{ padding: "1rem" }}
    >
      <div style={demoStackStyle}>
        <ConnectorRibbonScene
          {...args}
          showDecorations
          showDebugOverlay={args.showMiddleControlPoints}
        />
        <div style={variantGridStyle}>
          {comparisonVariants.map(({ label, args: variantArgs }) => (
            <section key={label}>
              <h3 style={variantTitleStyle}>{label}</h3>
              <ConnectorRibbonScene
                {...variantDefaults}
                {...variantArgs}
                background={args.background}
                showDecorations={false}
                showDebugOverlay={false}
              />
            </section>
          ))}
        </div>
      </div>
    </CenteredStoryFrame>
  );
};

const meta = {
  title: "Common/UI",
  component: ConnectorRibbonDemo,
  parameters: {
    layout: "fullscreen",
    controls: { sort: "none" },
  },
  args: {
    color: "rgba(255, 255, 255, 0.8)",
    capEdgeOpacity: 0,
    controlOffsetFactor: 1,
    curveMode: "bezier",
    background: "#eef2f7",
    topWidth: 184,
    bottomWidth: 304,
    offsetX: 0,
    verticalGap: 64,
    topHeight: 36,
    bottomHeight: 44,
    buttonOpacity: 1,
    topButtonCount: 1,
    bottomButtonCount: 4,
    showMiddleControlPoints: true,
  },
  argTypes: {
    color: { control: "color", ...componentPropTable },
    controlOffsetFactor: {
      control: { type: "range", min: 0, max: 5, step: 0.05 },
      ...componentPropTable,
    },
    curveMode: {
      control: "radio",
      options: ["bezier", "spline", "linear"],
      ...componentPropTable,
    },
    capEdgeOpacity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      ...componentPropTable,
    },
    background: { control: "color", ...testOptionTable },
    offsetX: {
      control: { type: "range", min: -220, max: 220, step: 4 },
      ...testOptionTable,
    },
    topWidth: {
      control: { type: "range", min: 96, max: 280, step: 4 },
      ...testOptionTable,
    },
    bottomWidth: {
      control: { type: "range", min: 120, max: 420, step: 4 },
      ...testOptionTable,
    },
    verticalGap: {
      control: { type: "range", min: 24, max: 180, step: 4 },
      ...testOptionTable,
    },
    topHeight: {
      control: { type: "range", min: 28, max: 72, step: 2 },
      ...testOptionTable,
    },
    bottomHeight: {
      control: { type: "range", min: 32, max: 96, step: 2 },
      ...testOptionTable,
    },
    buttonOpacity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      ...testOptionTable,
    },
    topButtonCount: {
      control: "radio",
      options: [1, 2, 4],
      ...testOptionTable,
    },
    bottomButtonCount: {
      control: "radio",
      options: [1, 2, 4],
      ...testOptionTable,
    },
    showMiddleControlPoints: {
      control: "boolean",
      ...testOptionTable,
    },
  },
} satisfies Meta<typeof ConnectorRibbonDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ConnectorRibbon: Story = {};
