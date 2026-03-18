import type { Meta, StoryObj } from "@storybook/react";
import {
  AnnotationsProvider,
  AnnotationToolbar3D,
  AnnotationInfoBox,
  useTools,
  useEntries,
} from "@carma-mapping/annotations/runtime";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { AnnotationCesiumStoryShell } from "./shared/AnnotationCesiumStoryShell";

const INFOBOX_WIDTH_PX = 330;

const RuntimeToolbar = () => (
  <div
    style={{
      position: "absolute",
      top: 12,
      left: 72,
      right: 12,
      zIndex: 1600,
      display: "flex",
      justifyContent: "center",
      pointerEvents: "none",
    }}
  >
    <div
      style={{
        width: "max-content",
        maxWidth: "calc(100vw - 120px)",
        pointerEvents: "auto",
      }}
    >
      <AnnotationToolbar3D
        secondaryToolbarCollapsedByDefault={true}
        enableMultiDeleteHotkey={false}
      />
    </div>
  </div>
);

const RuntimeInfoBox = () => (
  <div
    style={{
      position: "absolute",
      top: 56,
      right: 12,
      zIndex: 1600,
      pointerEvents: "auto",
    }}
  >
    <AnnotationInfoBox pixelWidth={INFOBOX_WIDTH_PX} useControlLayout={false} />
  </div>
);

const RuntimeStatusBar = () => {
  const { activeToolType } = useTools();
  const entries = useEntries();

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1800,
        pointerEvents: "none",
      }}
    >
      <ResponsiveStatusBar
        label="annotations toolkit v1"
        values={[
          `tool: ${activeToolType ?? "none"}`,
          `${entries.length} annotation(s)`,
        ]}
      />
    </div>
  );
};

const V1RuntimeOverlay = () => (
  <div style={{ position: "relative", width: "100%", height: "100vh" }}>
    <AnnotationCesiumStoryShell>
      {({ scene }) =>
        scene ? (
          <AnnotationsProvider
            enabled={true}
            cesiumScene={scene}
            options={{
              initialToolType: "distance",
            }}
          >
            <RuntimeToolbar />
            <RuntimeInfoBox />
            <RuntimeStatusBar />
          </AnnotationsProvider>
        ) : null
      }
    </AnnotationCesiumStoryShell>
  </div>
);

const meta = {
  title: "Mapping/Annotations",
  component: V1RuntimeOverlay,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof V1RuntimeOverlay>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ToolkitV1: Story = {
  name: "Toolkit V1",
};