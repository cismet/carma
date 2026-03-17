import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "antd";
import { SELECT_TOOL_TYPE } from "@carma-mapping/annotations/core";
import {
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  distanceToolPlugin,
  pointToolPlugin,
  polylineToolPlugin,
  selectToolPlugin,
  verticalAreaToolPlugin,
  useAnnotationsRuntime,
  type AnnotationToolPlugin,
} from "@carma-mapping/annotations/runtime-v2";
import {
  ResponsiveStatusBar,
} from "@carma-commons/ui/components";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { AnnotationCesiumStoryShell } from "./shared/AnnotationCesiumStoryShell";

type MeasurementToolkitStoryProps = {
  enablePoint: boolean;
  enableDistance: boolean;
  enablePolyline: boolean;
  enableVerticalArea: boolean;
};

const buildEnabledPlugins = ({
  enablePoint,
  enableDistance,
  enablePolyline,
  enableVerticalArea,
}: MeasurementToolkitStoryProps): readonly AnnotationToolPlugin[] => {
  const plugins: AnnotationToolPlugin[] = [selectToolPlugin];

  if (enablePoint) {
    plugins.push(pointToolPlugin);
  }
  if (enableDistance) {
    plugins.push(distanceToolPlugin);
  }
  if (enablePolyline) {
    plugins.push(polylineToolPlugin);
  }
  if (enableVerticalArea) {
    plugins.push(verticalAreaToolPlugin);
  }

  return plugins;
};

const RuntimeToolbar = () => {
  const { registry, activeToolType, requestModeChange } =
    useAnnotationsRuntime();

  return (
    <Control position="topcenter" order={20}>
      <div className="w-full h-9 z-[999] pointer-events-auto">
        <div className="relative w-[calc(100%-40px)] mx-auto h-full">
          <div className="w-full flex justify-center items-center h-full gap-2">
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0,
                minHeight: 32,
                padding: "0 8px",
                borderRadius: 999,
                background: "rgba(255, 255, 255, 0.92)",
                boxShadow: "0 6px 16px rgba(2, 6, 23, 0.22)",
              }}
            >
              {registry.orderedDescriptors.map((descriptor) => {
                const isActive = descriptor.id === activeToolType;
                const showSeparator = descriptor.id === SELECT_TOOL_TYPE;

                return (
                  <div
                    key={descriptor.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Tooltip title={descriptor.tooltip} placement="bottom">
                      <span style={{ display: "inline-block" }}>
                        <button
                          type="button"
                          onClick={() => requestModeChange(descriptor.id)}
                          aria-pressed={isActive}
                          aria-label={descriptor.tooltip}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 44,
                            minWidth: 44,
                            height: 32,
                            border: 0,
                            borderRadius: 0,
                            color: isActive ? "#111827" : "#374151",
                            background: isActive
                              ? "rgba(255,255,255,0.96)"
                              : "transparent",
                            boxShadow: isActive
                              ? "inset 0 0 0 1px rgba(148, 163, 184, 0.45)"
                              : "none",
                            cursor: "pointer",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 18,
                              lineHeight: 1,
                            }}
                          >
                            {descriptor.icon}
                          </span>
                        </button>
                      </span>
                    </Tooltip>
                    {showSeparator ? (
                      <span
                        aria-hidden="true"
                        style={{
                          display: "inline-block",
                          width: 1,
                          height: 18,
                          background: "#d1d5db",
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Control>
  );
};

const RuntimeStatusBar = () => {
  const { registry, activeToolType, annotationEntries } =
    useAnnotationsRuntime();
  const activePlugin = registry.getPlugin(activeToolType);
  const primaryHint = activePlugin?.helpText?.[0] ?? "Tool ready.";
  const secondaryHint = `${annotationEntries.length} annotation(s) saved`;

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
        label="annotations toolkit"
        values={[
          activePlugin?.descriptor.label ?? "Tool",
          primaryHint,
          secondaryHint,
        ]}
      />
    </div>
  );
};

const RuntimeInfoBox = () => (
  <Control position="topright" order={12}>
    <div style={{ marginTop: 12, marginRight: 12 }}>
      <RuntimeAnnotationInfoBox pixelWidth={330} />
    </div>
  </Control>
);

const MeasurementRuntimeOverlay = ({
  plugins,
}: {
  plugins: readonly AnnotationToolPlugin[];
}) => {
  const initialActiveToolType =
    plugins.find((plugin) => plugin.kind === "measurement")?.id ??
    plugins[0]?.id;

  if (!initialActiveToolType) {
    return null;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <AnnotationCesiumStoryShell>
        {({ scene }) =>
          scene ? (
            <AnnotationsProvider
              scene={scene}
              plugins={plugins}
              initialActiveToolType={initialActiveToolType}
            >
              <ControlLayout ifStorybook={false}>
                <RuntimeToolbar />
                <RuntimeInfoBox />
              </ControlLayout>
              <RuntimeStatusBar />
            </AnnotationsProvider>
          ) : null
        }
      </AnnotationCesiumStoryShell>
    </div>
  );
};

const MeasurementToolkitStory = (args: MeasurementToolkitStoryProps) => {
  const plugins = useMemo(() => buildEnabledPlugins(args), [
    args.enableDistance,
    args.enablePoint,
    args.enablePolyline,
    args.enableVerticalArea,
  ]);

  return <MeasurementRuntimeOverlay plugins={plugins} />;
};

const meta = {
  title: "Mapping/Annotations",
  component: MeasurementToolkitStory,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    enablePoint: true,
    enableDistance: true,
    enablePolyline: true,
    enableVerticalArea: true,
  },
  argTypes: {
    enablePoint: { control: { type: "boolean" } },
    enableDistance: { control: { type: "boolean" } },
    enablePolyline: { control: { type: "boolean" } },
    enableVerticalArea: { control: { type: "boolean" } },
  },
} satisfies Meta<typeof MeasurementToolkitStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Toolkit: Story = {
  name: "Toolkit",
};
