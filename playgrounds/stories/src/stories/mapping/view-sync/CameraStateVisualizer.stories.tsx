import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { ViewStateVisualizer } from "@carma-mapping/components";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useMemo, useState } from "react";
import type {
  ViewStateVisualizerDisplayOptions,
  ViewStateVisualizerSpecification,
} from "@carma-mapping/engines/three/primitives";

type CameraStateVisualizerStoryProps = {
  altitudeM: number;
  headingDeg: number;
  pitchDeg: number;
  showMaxPitchDeg: boolean;
  maxPitchDeg: number;
  rollDeg: number;
  rangeM: number;
  imagePlaneDistanceUnit: number;
  fovVerticalDeg: number;
  aspect: number;
  nearM: number;
  farM: number;
  sizePx: number;
  // Display options
  displayFovDeg: number;
  displayOrthographic: boolean;
  displayInteractive: boolean;
  showGraticule: boolean;
  showSurface: boolean;
  showAxes: boolean;
  showAngleArcs: boolean;
  showImagePlane: boolean;
  showFrustum: boolean;
  showAltitudeStem: boolean;
  showCameraLink: boolean;
  showAxisLabels: boolean;
  showAngleLabels: boolean;
  showImagePlaneLabels: boolean;
  labelFontSizePx: number;
  graticuleLineWidth: number;
  axisLineWidth: number;
  arcLineWidth: number;
  imagePlaneLineWidth: number;
  frustumLineWidth: number;
  cameraLinkLineWidth: number;
  altitudeLineWidth: number;
};

const createSpecification = (
  args: CameraStateVisualizerStoryProps,
  headingRad: number,
  pitchRad: number
): ViewStateVisualizerSpecification => ({
  pose: {
    anchor: {
      altitude: args.altitudeM,
    },
    heading: headingRad,
    pitch: pitchRad,
    roll: degToRadNumeric(args.rollDeg),
    range: args.rangeM,
  },
  limits: args.showMaxPitchDeg
    ? {
        maxPitch: degToRadNumeric(args.maxPitchDeg),
      }
    : undefined,
  display: {
    imagePlaneDistance: args.imagePlaneDistanceUnit,
  },
  intrinsics: {
    type: "PerspectiveCamera",
    fov: degToRadNumeric(args.fovVerticalDeg),
    aspect: args.aspect,
    near: args.nearM,
    far: args.farM,
  },
});

const createDisplayOptions = (
  args: CameraStateVisualizerStoryProps
): ViewStateVisualizerDisplayOptions => ({
  fovDeg: args.displayFovDeg,
  orthographic: args.displayOrthographic,
  interactive: args.displayInteractive,
  showGraticule: args.showGraticule,
  showSurface: args.showSurface,
  showAxes: args.showAxes,
  showAngleArcs: args.showAngleArcs,
  showImagePlane: args.showImagePlane,
  showFrustum: args.showFrustum,
  showAltitudeStem: args.showAltitudeStem,
  showCameraLink: args.showCameraLink,
  showAxisLabels: args.showAxisLabels,
  showAngleLabels: args.showAngleLabels,
  showImagePlaneLabels: args.showImagePlaneLabels,
  labelFontSizePx: args.labelFontSizePx,
  graticuleLineWidth: args.graticuleLineWidth,
  axisLineWidth: args.axisLineWidth,
  arcLineWidth: args.arcLineWidth,
  imagePlaneLineWidth: args.imagePlaneLineWidth,
  frustumLineWidth: args.frustumLineWidth,
  cameraLinkLineWidth: args.cameraLinkLineWidth,
  altitudeLineWidth: args.altitudeLineWidth,
});

const CameraStateVisualizerStory = (
  args: CameraStateVisualizerStoryProps
) => {
  const [headingRad, setHeadingRad] = useState(degToRadNumeric(args.headingDeg));
  const [pitchRad, setPitchRad] = useState(degToRadNumeric(args.pitchDeg));

  useEffect(() => {
    setHeadingRad(degToRadNumeric(args.headingDeg));
    setPitchRad(degToRadNumeric(args.pitchDeg));
  }, [args.headingDeg, args.pitchDeg]);

  const specification = useMemo(
    () => createSpecification(args, headingRad, pitchRad),
    [args, headingRad, pitchRad]
  );
  const displayOptions = useMemo(
    () => createDisplayOptions(args),
    [args]
  );
  const summary = [
    `${args.altitudeM.toFixed(1)} m`,
    `h ${radToDegNumeric(headingRad).toFixed(1)}°`,
    `p ${radToDegNumeric(pitchRad).toFixed(1)}°`,
    args.showMaxPitchDeg ? `p max ${args.maxPitchDeg.toFixed(1)}°` : null,
    `r ${args.rangeM.toFixed(1)} m`,
    `plane ${args.imagePlaneDistanceUnit.toFixed(2)}u`,
    `fov ${args.fovVerticalDeg.toFixed(1)}°`,
    `a ${args.aspect.toFixed(2)}`,
  ]
    .filter((value): value is string => value !== null)
    .join(" • ");

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background:
          "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(226,232,240,1) 100%)",
      }}
    >
      <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <ResponsiveStatusBar text={summary} tone="dark" />
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            padding: 20,
            border: "1px solid rgba(15, 23, 42, 0.18)",
            backgroundColor: "#ffffff",
            backgroundImage:
              "linear-gradient(45deg, rgba(148,163,184,0.18) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.18) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.18) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.18) 75%)",
            backgroundSize: "24px 24px",
            backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.10)",
          }}
        >
          <ViewStateVisualizer
            specification={specification}
            displayOptions={displayOptions}
            onPoseChange={(heading, pitch) => {
              setHeadingRad(heading);
              setPitchRad(pitch);
            }}
            width={args.sizePx}
            height={args.sizePx}
            headingLabel="h"
            pitchLabel="p"
            style={{
              outline: "1px solid rgba(15, 23, 42, 0.16)",
            }}
          />
        </div>
      </div>
    </div>
  );
};

const meta: Meta<CameraStateVisualizerStoryProps> = {
  title: "Mapping/ViewSync",
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
  },
  args: {
    altitudeM: 222.4,
    headingDeg: 214,
    pitchDeg: -48,
    showMaxPitchDeg: false,
    maxPitchDeg: 0,
    rollDeg: 0,
    rangeM: 620,
    imagePlaneDistanceUnit: 0.42,
    fovVerticalDeg: 60,
    aspect: 1.6,
    nearM: 1,
    farM: 500000,
    sizePx: 420,
    // Display defaults
    displayFovDeg: 38,
    displayOrthographic: false,
    displayInteractive: true,
    showGraticule: true,
    showSurface: true,
    showAxes: true,
    showAngleArcs: true,
    showImagePlane: true,
    showFrustum: true,
    showAltitudeStem: true,
    showCameraLink: true,
    showAxisLabels: true,
    showAngleLabels: true,
    showImagePlaneLabels: true,
    labelFontSizePx: 11,
    graticuleLineWidth: 1,
    axisLineWidth: 2,
    arcLineWidth: 2,
    imagePlaneLineWidth: 2,
    frustumLineWidth: 2,
    cameraLinkLineWidth: 2,
    altitudeLineWidth: 2,
  },
  argTypes: {
    altitudeM: {
      name: "altitude m",
      control: { type: "range", min: 0, max: 2000, step: 1 },
      table: { category: "Pose" },
    },
    headingDeg: {
      name: "heading deg",
      control: { type: "range", min: 0, max: 360, step: 1 },
      table: { category: "Pose" },
    },
    pitchDeg: {
      name: "pitch deg",
      control: { type: "range", min: -90, max: 0, step: 1 },
      table: { category: "Pose" },
    },
    showMaxPitchDeg: {
      name: "show max pitch",
      control: { type: "boolean" },
      table: { category: "Pose" },
    },
    maxPitchDeg: {
      name: "max pitch deg",
      control: { type: "range", min: -90, max: 0, step: 1 },
      table: { category: "Pose" },
    },
    rollDeg: {
      name: "roll deg",
      control: { type: "range", min: -180, max: 180, step: 1 },
      table: { category: "Pose" },
    },
    rangeM: {
      name: "range m",
      control: { type: "range", min: 1, max: 2000, step: 1 },
      table: { category: "Pose" },
    },
    imagePlaneDistanceUnit: {
      name: "image plane dist u",
      control: { type: "range", min: 0.08, max: 1.5, step: 0.01 },
      table: { category: "Display" },
    },
    fovVerticalDeg: {
      name: "fov v deg",
      control: { type: "range", min: 5, max: 120, step: 1 },
      table: { category: "Intrinsics" },
    },
    aspect: {
      name: "aspect",
      control: { type: "range", min: 0.5, max: 3, step: 0.01 },
      table: { category: "Intrinsics" },
    },
    nearM: {
      name: "near m",
      control: { type: "range", min: 0.01, max: 100, step: 0.01 },
      table: { category: "Intrinsics" },
    },
    farM: {
      name: "far m",
      control: { type: "range", min: 100, max: 1000000, step: 100 },
      table: { category: "Intrinsics" },
    },
    sizePx: {
      name: "size px",
      control: { type: "range", min: 160, max: 720, step: 1 },
      table: { category: "Display" },
    },
    displayFovDeg: {
      name: "display fov deg",
      control: { type: "range", min: 10, max: 120, step: 1 },
      table: { category: "Display" },
    },
    displayOrthographic: {
      name: "orthographic",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    displayInteractive: {
      name: "interactive orbit",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showGraticule: {
      name: "graticule",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showSurface: {
      name: "surface",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showAxes: {
      name: "axes",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showAngleArcs: {
      name: "angle arcs",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showImagePlane: {
      name: "image plane",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showFrustum: {
      name: "frustum",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showAltitudeStem: {
      name: "altitude stem",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showCameraLink: {
      name: "camera link",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showAxisLabels: {
      name: "axis labels",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showAngleLabels: {
      name: "angle labels",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    showImagePlaneLabels: {
      name: "image plane labels",
      control: { type: "boolean" },
      table: { category: "Display" },
    },
    labelFontSizePx: {
      name: "label font px",
      control: { type: "range", min: 8, max: 24, step: 1 },
      table: { category: "Display" },
    },
    graticuleLineWidth: {
      name: "graticule width",
      control: { type: "range", min: 1, max: 5, step: 0.5 },
      table: { category: "Display" },
    },
    axisLineWidth: {
      name: "axis width",
      control: { type: "range", min: 1, max: 5, step: 0.5 },
      table: { category: "Display" },
    },
    arcLineWidth: {
      name: "arc width",
      control: { type: "range", min: 1, max: 5, step: 0.5 },
      table: { category: "Display" },
    },
    imagePlaneLineWidth: {
      name: "image plane width",
      control: { type: "range", min: 1, max: 5, step: 0.5 },
      table: { category: "Display" },
    },
    frustumLineWidth: {
      name: "frustum width",
      control: { type: "range", min: 1, max: 5, step: 0.5 },
      table: { category: "Display" },
    },
    cameraLinkLineWidth: {
      name: "camera link width",
      control: { type: "range", min: 1, max: 5, step: 0.5 },
      table: { category: "Display" },
    },
    altitudeLineWidth: {
      name: "altitude width",
      control: { type: "range", min: 1, max: 5, step: 0.5 },
      table: { category: "Display" },
    },
  },
};

export default meta;

export const CameraStateVisualizer: StoryObj<CameraStateVisualizerStoryProps> = {
  name: "Camera State Visualizer",
  render: (args) => <CameraStateVisualizerStory {...args} />,
};
