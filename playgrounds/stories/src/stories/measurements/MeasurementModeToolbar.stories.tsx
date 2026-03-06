import type { Meta, StoryObj } from "@storybook/react";

import { AnnotationToolbar3D } from "@carma-mapping/annotations/provider";
import { useCesiumAnnotations } from "@carma-mapping/annotations/cesium";
import { MeasurementCesiumStoryShell } from "./shared/MeasurementCesiumStoryShell";

const MeasurementToolkitStory = ({
  pixelWidth = 700,
}: {
  pixelWidth?: number;
}) => {
  const {
    measurementMode,
    selectionModeActive,
    pointLabelOnCreate,
    planarMeasurementCreationMode,
    polygonSurfaceTypePreset,
  } = useCesiumAnnotations();

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
        mode: <code>{measurementMode}</code> | selection:{" "}
        <code>{selectionModeActive ? "on" : "off"}</code> | label-on-create:{" "}
        <code>{pointLabelOnCreate ? "on" : "off"}</code> | planar-creation:{" "}
        <code>{planarMeasurementCreationMode}</code> | surface:{" "}
        <code>{polygonSurfaceTypePreset}</code>
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
