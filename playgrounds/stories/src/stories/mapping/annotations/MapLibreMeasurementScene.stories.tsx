import type { Meta, StoryObj } from "@storybook/react";
import { carma } from "@carma-api";
import type { CssPixels, Degrees, Milliseconds, Ratio } from "@carma-units";
import { REFERENCE_OBJECT_SCALING_MODES } from "@carma-commons/math";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type { AnnotationReferenceObjectSizingOptions } from "@carma-mapping/annotations/runtime";

import {
  MeasurementStory,
  measurementStoryArgTypes,
  measurementStoryDefaultArgs,
  type MeasurementStoryProps,
  type MeasurementStoryView,
} from "./measurement-story-harness";
import {
  fixtureCoordinates,
  loadMeasurementStoryFixture,
  measurementStoryCameraView,
  pointDraftAtNextNode,
  waitForMeasurementStory,
} from "./measurement-story-play";

/** The real measurement3d test scene and the sampler's configurable sizing. */

type SamplerCameraView = "courtyard" | "near" | "far" | "grazing";

type MeasurementSceneArgs = Pick<
  MeasurementStoryProps,
  "surfaceTiles" | "showAllTools" | "meterMarkers" | "components"
> & {
  samplerTargetScreenRadiusCssPx: number;
  samplerMinimumScreenRadiusCssPx: number;
  samplerMaximumViewportRadiusRatio: number;
  samplerSceneResizeFactor: number;
  samplerResizeHysteresisRatio: number;
  samplerRadiusLabelVisibleDurationMs: number;
  samplerRadiusLabelFadeDurationMs: number;
  samplerResizeAnimationDurationMs: number;
  samplerCamera: SamplerCameraView;
};

const SAMPLER_CAMERA_VIEWS = {
  courtyard: { zoom: 19.8, pitch: 60 as Degrees, bearing: 0 as Degrees },
  near: { zoom: 22, pitch: 60 as Degrees, bearing: 0 as Degrees },
  far: { zoom: 16.8, pitch: 55 as Degrees, bearing: 0 as Degrees },
  grazing: { zoom: 19.8, pitch: 80 as Degrees, bearing: 0 as Degrees },
} as const satisfies Record<SamplerCameraView, MeasurementStoryView>;

const measurementSceneProps = (
  args: MeasurementSceneArgs
): MeasurementStoryProps => {
  const referenceObjectSizing: AnnotationReferenceObjectSizingOptions = {
    // Preserve this scene's existing provider defaults for the edit gizmo.
    scalingMode: REFERENCE_OBJECT_SCALING_MODES.SCREEN,
    worldRadiusMeters: 3,
    targetScreenRadiusCssPx: 48,
    resizeWorldRadiusToScreenTarget: false,
    resizeStepFactor: 4,
    quantizeWorldRadius: false,
    pointQueryDiscSizing: {
      targetScreenRadiusCssPx: args.samplerTargetScreenRadiusCssPx as CssPixels,
      minimumScreenRadiusCssPx:
        args.samplerMinimumScreenRadiusCssPx as CssPixels,
      maximumViewportRadiusRatio:
        args.samplerMaximumViewportRadiusRatio as Ratio,
      sceneResizeFactor: args.samplerSceneResizeFactor as Ratio,
      resizeHysteresisRatio: args.samplerResizeHysteresisRatio as Ratio,
      radiusLabelVisibleDurationMs:
        args.samplerRadiusLabelVisibleDurationMs as Milliseconds,
      radiusLabelFadeDurationMs:
        args.samplerRadiusLabelFadeDurationMs as Milliseconds,
      resizeAnimationDurationMs:
        args.samplerResizeAnimationDurationMs as Milliseconds,
    },
  };
  return {
    surfaceTiles: args.surfaceTiles,
    showAllTools: args.showAllTools,
    meterMarkers: args.meterMarkers,
    components: args.components,
    referenceObjectSizing,
  };
};

const MapLibreMeasurementScene = (args: MeasurementSceneArgs) => (
  <MeasurementStory {...measurementSceneProps(args)} />
);

const meta = {
  title: "Mapping/Annotations/MapLibre Measurement Scene",
  id: "mapping-annotations-maplibre-measurement-scene",
  component: MapLibreMeasurementScene,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Mesh 2024 at the Rathaus Barmen courtyard with one measurement of every type, partly hidden by the pavilion or the dormer; the real MapLibre/Three annotation runtime also accepts the sampler sizing controls.",
      },
    },
  },
  args: {
    ...measurementStoryDefaultArgs,
    samplerTargetScreenRadiusCssPx: 64,
    samplerMinimumScreenRadiusCssPx: 10,
    samplerMaximumViewportRadiusRatio: 0.5,
    samplerSceneResizeFactor: 10,
    samplerResizeHysteresisRatio: 0.15,
    samplerRadiusLabelVisibleDurationMs: 3000,
    samplerRadiusLabelFadeDurationMs: 250,
    samplerResizeAnimationDurationMs: 200,
    samplerCamera: "courtyard",
  },
  argTypes: {
    ...measurementStoryArgTypes,
    samplerTargetScreenRadiusCssPx: {
      name: "Sampler target radius (px)",
      control: { type: "number", min: 1, max: 256, step: 1 },
      description:
        "After moveend, target outer radius at the ground in the viewport centre; the runtime chooses a 1/2/5 metre radius.",
    },
    samplerMinimumScreenRadiusCssPx: {
      name: "Sampler minimum radius (px)",
      control: { type: "number", min: 1, max: 128, step: 1 },
      description:
        "With the camera held, enlarge only when the sampler is smaller than this apparent radius.",
    },
    samplerMaximumViewportRadiusRatio: {
      name: "Sampler maximum viewport ratio",
      control: { type: "number", min: 0.05, max: 1, step: 0.05 },
      description:
        "Maximum apparent radius as a share of the shorter viewport dimension.",
    },
    samplerSceneResizeFactor: {
      name: "Sampler scene resize factor",
      control: { type: "number", min: 2, max: 20, step: 1 },
      description:
        "Preferred radius correction factor with a held camera; a small viewport may need an intermediate 1/2/5 step.",
    },
    samplerResizeHysteresisRatio: {
      name: "Sampler resize hysteresis",
      control: { type: "number", min: 0, max: 0.4, step: 0.01 },
      description:
        "The guard band that avoids jumping back across an apparent-size boundary.",
    },
    samplerRadiusLabelVisibleDurationMs: {
      name: "Radius label visible duration (ms)",
      control: { type: "number", min: 0, max: 10000, step: 100 },
      description:
        "Time since the last selected world-radius change; pointer motion does not restart it.",
    },
    samplerRadiusLabelFadeDurationMs: {
      name: "Radius label fade duration (ms)",
      control: { type: "number", min: 0, max: 2000, step: 50 },
      description:
        "Fade after the unchanged-radius hold; reduced motion disables the fade.",
    },
    samplerResizeAnimationDurationMs: {
      name: "Sampler resize transition (ms)",
      control: { type: "number", min: 0, max: 1000, step: 50 },
      description:
        "Short visual size transition; zero or reduced motion keeps changes immediate. Selected radii remain 1/2/5 steps.",
    },
    samplerCamera: {
      name: "Sampler camera",
      control: "select",
      options: ["courtyard", "near", "far", "grazing"],
      description:
        "Scaling stories move the real camera around the same ground point.",
    },
  },
} satisfies Meta<typeof MapLibreMeasurementScene>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RathausBarmenCourtyard: Story = {};

export const StableToolsOnly: Story = {
  args: { showAllTools: false },
};

const SamplerScalingScene = (args: MeasurementSceneArgs) => (
  <MeasurementStory
    {...measurementSceneProps(args)}
    focusAnnotationId="scene-point-1"
    state={{ kind: "drafting", toolId: ANNOTATION_TYPES.POINT, nodes: 0 }}
    view={SAMPLER_CAMERA_VIEWS[args.samplerCamera]}
  />
);

const scalingStory = (samplerCamera: SamplerCameraView): Story => ({
  render: SamplerScalingScene,
  args: { samplerCamera, showAllTools: false },
  parameters: {
    docs: {
      description: {
        story:
          "The real point sampler on Mesh 2024. Change the sizing and presentation controls, then move the pointer across the courtyard with the camera held: world radius stays fixed until the minimum or viewport maximum is crossed. Pan or zoom and release to choose the next 1/2/5 radius at the viewport-centre ground. Resize the preview to examine the viewport bound and hysteresis. Camera presets use the real MapLibre camera at the fixture point; no scaling is simulated by the story. The label fades after an unchanged radius, and a short size transition indicates each new scale.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    if (!(await waitForMeasurementStory(canvasElement))) return;
    await pointDraftAtNextNode(canvasElement);
  },
});

export const ScalingConfiguration: Story = scalingStory("courtyard");
export const NearGroundSampler: Story = scalingStory("near");
export const FarGroundSampler: Story = scalingStory("far");
export const GrazingGroundSampler: Story = scalingStory("grazing");

/** carma.camera: three look-ats the whole camera morphs to, then back to the start. */
export const CameraTour: Story = {
  play: async ({ canvasElement }) => {
    if (!(await waitForMeasurementStory(canvasElement))) return;
    const fixture = await loadMeasurementStoryFixture();
    const start = carma.camera.getPose();
    for (const id of ["scene-distance-2", "scene-planar-5", "scene-point-1"]) {
      const { eye, target } = measurementStoryCameraView(
        fixtureCoordinates(fixture, id)
      );
      if (!(await carma.camera.lookAt(eye, target, { durationMs: 2500 })))
        return;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (start) await carma.camera.flyToPose(start, { durationMs: 2500 });
  },
};
