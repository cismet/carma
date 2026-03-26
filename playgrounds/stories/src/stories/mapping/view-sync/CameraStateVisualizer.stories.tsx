import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { ViewStateVisualizer } from "@carma-mapping/components";
import {
  DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS,
  type ViewStateVisualizerDisplayOptions,
  type ViewStateVisualizerOverviewOptions,
  type ViewStateVisualizerVisualizedOptions,
} from "@carma-mapping/engines/three/primitives";
import {
  buildViewState,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import { clamp, PI_OVER_TWO } from "@carma/math";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type CameraStateVisualizerStoryProps = {
  altitudeM: number;
  bearingDeg: number;
  pitchDeg: number;
  showMaxPitchDeg: boolean;
  maxPitchDeg: number;
  rollDeg: number;
  rangeM: number;
  fovVerticalDeg: number;
  fovHorizontalDeg: number;
  enableViewOffset: boolean;
  viewOffsetFullWidthPx: number;
  viewOffsetFullHeightPx: number;
  viewOffsetXRatio: number;
  viewOffsetYRatio: number;
  viewOffsetWidthRatio: number;
  viewOffsetHeightRatio: number;
  imagePlaneDistanceUnit: number;
  sizePx: number;
  fovDeg: number;
  orthographic: boolean;
  interactive: boolean;
  showCheckerboardBackground: boolean;
  showSurface: boolean;
  showAxes: boolean;
  showAngleArcs: boolean;
  showImagePlane: boolean;
  showFrustum: boolean;
  showAltitudeStem: boolean;
  showAltitudeScaleBreak: boolean;
  showCameraMarker: boolean;
  showCameraLink: boolean;
  showAxisLabels: boolean;
  showAngleLabels: boolean;
  showImagePlaneLabels: boolean;
  labelFontSizePx: number;
  axisLineWidthPx: number;
  arcLineWidthPx: number;
  frustumLineWidthPx: number;
  cameraLinkLineWidthPx: number;
  altitudeLineWidthPx: number;
};

const OUTER_BACKGROUND_STYLE: CSSProperties = {
  width: "100%",
  height: "100vh",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#e2e8f0",
};

const buildFrameStyle = (
  showCheckerboardBackground: boolean
): CSSProperties => ({
  backgroundColor: "#ffffff",
  backgroundImage: showCheckerboardBackground
    ? "linear-gradient(45deg, rgba(148,163,184,0.18) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.18) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.18) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.18) 75%)"
    : "none",
  backgroundSize: showCheckerboardBackground ? "24px 24px" : undefined,
  backgroundPosition: showCheckerboardBackground
    ? "0 0, 0 12px, 12px -12px, -12px 0px"
    : undefined,
  lineHeight: 0,
});

const clampUnitInterval = (value: number): number => clamp(value, 0, 1);

const buildViewOffset = (args: CameraStateVisualizerStoryProps) => {
  if (!args.enableViewOffset) {
    return undefined;
  }

  const fullWidth = Math.max(1, args.viewOffsetFullWidthPx);
  const fullHeight = Math.max(1, args.viewOffsetFullHeightPx);
  const offsetXRatio = clampUnitInterval(args.viewOffsetXRatio);
  const offsetYRatio = clampUnitInterval(args.viewOffsetYRatio);
  const widthRatio = clamp(
    args.viewOffsetWidthRatio,
    0,
    Math.max(0, 1 - offsetXRatio)
  );
  const heightRatio = clamp(
    args.viewOffsetHeightRatio,
    0,
    Math.max(0, 1 - offsetYRatio)
  );

  return {
    fullWidth,
    fullHeight,
    offsetX: fullWidth * offsetXRatio,
    offsetY: fullHeight * offsetYRatio,
    width: fullWidth * widthRatio,
    height: fullHeight * heightRatio,
  };
};

const createViewState = (
  args: CameraStateVisualizerStoryProps,
  bearingRad: number,
  pitchRad: number
): ViewState =>
  buildViewState({
    longitude: 0,
    latitude: 0,
    altitude: args.altitudeM,
    bearing: bearingRad,
    pitch: pitchRad,
    roll: degToRadNumeric(args.rollDeg),
    range: args.rangeM,
    intrinsics: {
      type: CAMERA_TYPE.PERSPECTIVE,
      fov: degToRadNumeric(args.fovVerticalDeg),
      fovHorizontal: degToRadNumeric(args.fovHorizontalDeg),
      viewOffset: buildViewOffset(args),
    },
    metadata: {
      frameId: 0,
      timestampMs: 0,
      sourceId: "camera-state-visualizer-story",
      source: "restore",
    },
  });

const createVisualizedOptions = (
  args: CameraStateVisualizerStoryProps
): ViewStateVisualizerVisualizedOptions => ({
  imagePlaneDistance: args.imagePlaneDistanceUnit,
  ...(args.showMaxPitchDeg
    ? { maxPitch: degToRadNumeric(args.maxPitchDeg) }
    : {}),
});

const createOverviewOptions = (
  args: CameraStateVisualizerStoryProps
): ViewStateVisualizerOverviewOptions => ({
  fovDeg: args.fovDeg,
  orthographic: args.orthographic,
});

const createDisplayOptions = (
  args: CameraStateVisualizerStoryProps
): ViewStateVisualizerDisplayOptions => ({
  surface: {
    show: args.showSurface,
    sphereCapRad: PI_OVER_TWO,
  },
  worldAxes: {
    show: args.showAxes,
    lineWidthPx: args.axisLineWidthPx,
  },
  angleCues: {
    show: args.showAngleArcs,
    lineWidthPx: args.arcLineWidthPx,
  },
  cameraView: {
    imagePlane: {
      show: args.showImagePlane,
      showOffset: args.enableViewOffset,
      frameLineWidthPx: args.frustumLineWidthPx,
    },
    axes: {
      show: args.showAxes,
      lineWidthPx: args.axisLineWidthPx,
    },
    frustum: {
      show: args.showFrustum,
      lineWidthPx: args.frustumLineWidthPx,
    },
    marker: {
      show: args.showCameraMarker,
    },
    link: {
      show: args.showCameraLink,
      lineWidthPx: args.cameraLinkLineWidthPx,
    },
  },
  altitude: {
    show: args.showAltitudeStem,
    showScaleBreak: args.showAltitudeScaleBreak,
    lineWidthPx: args.altitudeLineWidthPx,
  },
  labels: {
    showAxes: args.showAxisLabels,
    showAngles: args.showAngleLabels,
    showImagePlane: args.showImagePlaneLabels,
    fontSizePx: args.labelFontSizePx,
  },
});

const CameraStateVisualizerStory = (args: CameraStateVisualizerStoryProps) => {
  const [bearingRad, setBearingRad] = useState(
    degToRadNumeric(args.bearingDeg)
  );
  const [pitchRad, setPitchRad] = useState(degToRadNumeric(args.pitchDeg));

  useEffect(() => {
    setBearingRad(degToRadNumeric(args.bearingDeg));
    setPitchRad(degToRadNumeric(args.pitchDeg));
  }, [args.bearingDeg, args.pitchDeg]);

  const viewState = useMemo(
    () => createViewState(args, bearingRad, pitchRad),
    [args, bearingRad, pitchRad]
  );
  const overviewOptions = useMemo(() => createOverviewOptions(args), [args]);
  const visualizedOptions = useMemo(
    () => createVisualizedOptions(args),
    [args]
  );
  const displayOptions = useMemo(() => createDisplayOptions(args), [args]);
  const summary = [
    `${args.altitudeM.toFixed(1)} m`,
    `b ${radToDegNumeric(bearingRad).toFixed(1)}°`,
    `p ${radToDegNumeric(pitchRad).toFixed(1)}°`,
    args.showMaxPitchDeg ? `p max ${args.maxPitchDeg.toFixed(1)}°` : null,
    `r ${args.rangeM.toFixed(1)} m`,
    `plane ${args.imagePlaneDistanceUnit.toFixed(2)}u`,
    `fov v ${args.fovVerticalDeg.toFixed(1)}°`,
    `fov h ${args.fovHorizontalDeg.toFixed(1)}°`,
    args.enableViewOffset
      ? `offset ${args.viewOffsetXRatio.toFixed(
          2
        )},${args.viewOffsetYRatio.toFixed(
          2
        )} ${args.viewOffsetWidthRatio.toFixed(
          2
        )}x${args.viewOffsetHeightRatio.toFixed(2)}`
      : null,
    args.showCheckerboardBackground ? "bg checker" : "bg solid",
  ]
    .filter((value): value is string => value !== null)
    .join(" • ");

  return (
    <div style={OUTER_BACKGROUND_STYLE}>
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
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        <div style={buildFrameStyle(args.showCheckerboardBackground)}>
          <ViewStateVisualizer
            viewState={viewState}
            overviewOptions={overviewOptions}
            interactive={args.interactive}
            visualizedOptions={visualizedOptions}
            displayOptions={displayOptions}
            onPoseChange={(bearing, pitch) => {
              setBearingRad(bearing);
              setPitchRad(pitch);
            }}
            width={args.sizePx}
            height={args.sizePx}
            bearingLabel="b"
            pitchLabel="p"
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
    bearingDeg: 214,
    pitchDeg: 42,
    showMaxPitchDeg: false,
    maxPitchDeg: 75,
    rollDeg: 0,
    rangeM: 620,
    fovVerticalDeg: 60,
    fovHorizontalDeg: 85.461115,
    enableViewOffset: false,
    viewOffsetFullWidthPx: 1,
    viewOffsetFullHeightPx: 1,
    viewOffsetXRatio: 0,
    viewOffsetYRatio: 0,
    viewOffsetWidthRatio: 1,
    viewOffsetHeightRatio: 1,
    imagePlaneDistanceUnit: 0.42,
    sizePx: 420,
    fovDeg: 38,
    orthographic: false,
    interactive: true,
    showCheckerboardBackground: false,
    showSurface: DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.surface.show,
    showAxes: DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.worldAxes.show,
    showAngleArcs: DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.angleCues.show,
    showImagePlane:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.imagePlane.show,
    showFrustum:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.frustum.show,
    showAltitudeStem:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.altitude.show,
    showAltitudeScaleBreak:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.altitude.showScaleBreak,
    showCameraMarker:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.marker.show,
    showCameraLink:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.link.show,
    showAxisLabels:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.labels.showAxes,
    showAngleLabels:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.labels.showAngles,
    showImagePlaneLabels:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.labels.showImagePlane,
    labelFontSizePx:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.labels.fontSizePx,
    axisLineWidthPx:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.worldAxes.lineWidthPx,
    arcLineWidthPx:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.angleCues.lineWidthPx,
    frustumLineWidthPx:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.frustum
        .lineWidthPx,
    cameraLinkLineWidthPx:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.link.lineWidthPx,
    altitudeLineWidthPx:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.altitude.lineWidthPx,
  },
  argTypes: {
    altitudeM: {
      name: "altitude m",
      control: { type: "range", min: 0, max: 2000, step: 1 },
      table: { category: "Pose" },
    },
    bearingDeg: {
      name: "bearing deg",
      control: { type: "range", min: 0, max: 360, step: 1 },
      table: { category: "Pose" },
    },
    pitchDeg: {
      name: "pitch deg",
      control: { type: "range", min: 0, max: 90, step: 1 },
      table: { category: "Pose" },
    },
    showMaxPitchDeg: {
      name: "show max pitch",
      control: { type: "boolean" },
      table: { category: "Pose" },
    },
    maxPitchDeg: {
      name: "max pitch deg",
      control: { type: "range", min: 0, max: 90, step: 1 },
      if: { arg: "showMaxPitchDeg", truthy: true },
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
    fovVerticalDeg: {
      name: "fov v deg",
      control: { type: "range", min: 0.1, max: 179.9, step: 0.1 },
      table: { category: "Intrinsics" },
    },
    fovHorizontalDeg: {
      name: "fov h deg",
      control: { type: "range", min: 0.1, max: 179.9, step: 0.1 },
      table: { category: "Intrinsics" },
    },
    enableViewOffset: {
      name: "enable view offset",
      control: { type: "boolean" },
      table: { category: "Intrinsics/ViewOffset" },
    },
    viewOffsetFullWidthPx: {
      name: "full width px",
      control: { type: "range", min: 1, max: 4096, step: 1 },
      if: { arg: "enableViewOffset", truthy: true },
      table: { category: "Intrinsics/ViewOffset" },
    },
    viewOffsetFullHeightPx: {
      name: "full height px",
      control: { type: "range", min: 1, max: 4096, step: 1 },
      if: { arg: "enableViewOffset", truthy: true },
      table: { category: "Intrinsics/ViewOffset" },
    },
    viewOffsetXRatio: {
      name: "offset x",
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      if: { arg: "enableViewOffset", truthy: true },
      table: { category: "Intrinsics/ViewOffset" },
    },
    viewOffsetYRatio: {
      name: "offset y",
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      if: { arg: "enableViewOffset", truthy: true },
      table: { category: "Intrinsics/ViewOffset" },
    },
    viewOffsetWidthRatio: {
      name: "offset width",
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      if: { arg: "enableViewOffset", truthy: true },
      table: { category: "Intrinsics/ViewOffset" },
    },
    viewOffsetHeightRatio: {
      name: "offset height",
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      if: { arg: "enableViewOffset", truthy: true },
      table: { category: "Intrinsics/ViewOffset" },
    },
    imagePlaneDistanceUnit: {
      name: "image plane dist u",
      control: { type: "range", min: 0.08, max: 1.5, step: 0.01 },
      table: { category: "Visualized" },
    },
    sizePx: {
      name: "size px",
      control: { type: "range", min: 160, max: 720, step: 1 },
      table: { category: "Display/Layout" },
    },
    fovDeg: {
      name: "display fov deg",
      control: { type: "range", min: 0.1, max: 179.9, step: 0.1 },
      table: { category: "Display/Layout" },
    },
    orthographic: {
      name: "orthographic",
      control: { type: "boolean" },
      table: { category: "Display/Layout" },
    },
    interactive: {
      name: "interactive orbit",
      control: { type: "boolean" },
      table: { category: "Display/Layout" },
    },
    showSurface: {
      name: "surface",
      control: { type: "boolean" },
      table: { category: "Display/Visibility" },
    },
    showAxes: {
      name: "axes",
      control: { type: "boolean" },
      table: { category: "Display/Visibility" },
    },
    showAngleArcs: {
      name: "angle arcs",
      control: { type: "boolean" },
      table: { category: "Display/Visibility" },
    },
    showImagePlane: {
      name: "image plane",
      control: { type: "boolean" },
      table: { category: "Display/Visibility" },
    },
    showFrustum: {
      name: "frustum",
      control: { type: "boolean" },
      table: { category: "Display/Visibility" },
    },
    showAltitudeStem: {
      name: "altitude stem",
      control: { type: "boolean" },
      table: { category: "Display/Visibility" },
    },
    showAltitudeScaleBreak: {
      name: "altitude scale break",
      control: { type: "boolean" },
      table: { category: "Display/Visibility" },
    },
    showCameraMarker: {
      name: "camera marker",
      control: { type: "boolean" },
      table: { category: "Display/Visibility" },
    },
    showCameraLink: {
      name: "camera link",
      control: { type: "boolean" },
      table: { category: "Display/Visibility" },
    },
    showAxisLabels: {
      name: "axis labels",
      control: { type: "boolean" },
      table: { category: "Display/Labels" },
    },
    showAngleLabels: {
      name: "angle labels",
      control: { type: "boolean" },
      table: { category: "Display/Labels" },
    },
    showImagePlaneLabels: {
      name: "image plane labels",
      control: { type: "boolean" },
      table: { category: "Display/Labels" },
    },
    labelFontSizePx: {
      name: "label font px",
      control: { type: "range", min: 8, max: 24, step: 1 },
      table: { category: "Display/Labels" },
    },
    axisLineWidthPx: {
      name: "axis line width",
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      table: { category: "Display/Line Widths" },
    },
    arcLineWidthPx: {
      name: "arc width",
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      table: { category: "Display/Line Widths" },
    },
    frustumLineWidthPx: {
      name: "frustum width",
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      table: { category: "Display/Line Widths" },
    },
    cameraLinkLineWidthPx: {
      name: "camera link width",
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      table: { category: "Display/Line Widths" },
    },
    altitudeLineWidthPx: {
      name: "altitude width",
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      table: { category: "Display/Line Widths" },
    },
    showCheckerboardBackground: {
      name: "checkerboard bg",
      control: { type: "boolean" },
      table: { category: "Display/Frame" },
    },
  },
};

export default meta;

export const CameraStateVisualizer: StoryObj<CameraStateVisualizerStoryProps> =
  {
    name: "Camera State Visualizer",
    render: (args) => <CameraStateVisualizerStory {...args} />,
  };
