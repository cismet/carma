import type { Meta, StoryObj } from "@storybook/react";

import {
  AnnotationToolbar3D,
  useAnnotationSelectionState,
  useAnnotationTools,
} from "@carma-mapping/annotations/provider";
import { MeasurementCesiumStoryShell } from "./shared/MeasurementCesiumStoryShell";

const MeasurementToolkitStory = ({
  pixelWidth = 700,
}: {
  pixelWidth?: number;
}) => {
  const tools = useAnnotationTools();
  const selection = useAnnotationSelectionState();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <AnnotationToolbar3D pixelWidth={pixelWidth} />
      <div
        style={{
          width: pixelWidth,
          maxWidth: "100%",
          fontSize: 12,
          padding: "6px 8px",
          borderRadius: 4,
          background: "rgba(255,255,255,0.88)",
          color: "#1f2937",
        }}
      >
        tool: <code>{tools.activeToolType}</code> | selection:{" "}
        <code>{selection.mode.active ? "on" : "off"}</code>
      </div>
    </div>
  );
};

const meta = {
  title: "measurements/Toolkit",
  component: MeasurementToolkitStory,
  decorators: [
    (Story) => (
      <MeasurementCesiumStoryShell overlayWidth={900}>
        <Story />
      </MeasurementCesiumStoryShell>
    ),
  ],
  args: {
    pixelWidth: 700,
  },
  argTypes: {
    pixelWidth: {
      control: {
        type: "range",
        min: 320,
        max: 1200,
        step: 10,
      },
    },
  },
} satisfies Meta<typeof MeasurementToolkitStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllToolsEnabled: Story = {};
