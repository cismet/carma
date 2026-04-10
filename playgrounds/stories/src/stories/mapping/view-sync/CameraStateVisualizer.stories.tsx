import { useEffect, useMemo, useState, type CSSProperties } from "react";

import type { Meta, StoryObj } from "@storybook/react";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { ViewStateVisualizer } from "@carma-mapping/components";
import {
  buildViewState,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import {
  DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS,
  VIEW_STATE_VISUALIZER_CAMERA_MODEL,
  type ViewStateVisualizerCameraModel,
  type ViewStateVisualizerDisplayOptions,
  type ViewStateVisualizerOverviewOptions,
  type ViewStateVisualizerVisualizedOptions,
} from "@carma-mapping/engines/three/primitives";
import { clamp, PI_OVER_TWO } from "@carma-commons/math";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";
type CameraStateVisualizerStoryProps = {
  altitudeM: number;
  bearingDeg: number;
  pitchDeg: number;
  showMaxPitchDeg: boolean;
  maxPitchDeg: number;
  rollDeg: number;
  rangeM: number;
  nearPlaneM: number;
  farPlaneM: number;
  cameraModel: ViewStateVisualizerCameraModel;
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
  showProjectionPlane: boolean;
  showAltitudeStem: boolean;
  showAltitudeScaleBreak: boolean;
  showCameraMarker: boolean;
  showAxisLabels: boolean;
  showAngleLabels: boolean;
  showImagePlaneLabels: boolean;
  labelFontSizePx: number;
  axisLineWidthPx: number;
  arcLineWidthPx: number;
  frustumLineWidthPx: number;
  altitudeLineWidthPx: number;
  cameras?: MultiCameraStoryCameraSpec[];
};

type MultiCameraStoryCameraSpec = {
  label?: string;
  cameraModel?: ViewStateVisualizerCameraModel;
  altitudeM?: number;
  bearingDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  rangeM?: number;
};

const DEFAULT_MULTI_CAMERA_SPECS: readonly MultiCameraStoryCameraSpec[] = [
  {
    label: "Perspective A",
    cameraModel: VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE,
    altitudeM: 222.4,
    bearingDeg: 214,
    pitchDeg: 42,
    rollDeg: 0,
    rangeM: 620,
  },
  {
    label: "Orthographic B",
    cameraModel: VIEW_STATE_VISUALIZER_CAMERA_MODEL.ORTHOGRAPHIC,
    altitudeM: 222.4,
    bearingDeg: 152,
    pitchDeg: 55,
    rollDeg: 0,
    rangeM: 620,
  },
  {
    label: "Perspective C",
    cameraModel: VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE,
    altitudeM: 222.4,
    bearingDeg: 286,
    pitchDeg: 36,
    rollDeg: 0,
    rangeM: 540,
  },
] as const;

const OUTER_BACKGROUND_STYLE: CSSProperties = {
  width: "100%",
  height: "100vh",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#e2e8f0",
};

const STATUS_BAR_WRAPPER_STYLE: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const CENTERED_PAGE_CONTENT_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  boxSizing: "border-box",
};

const VISUALIZER_STACK_STYLE: CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
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

const buildPerspectiveIntrinsics = (args: CameraStateVisualizerStoryProps) => ({
  type: CAMERA_TYPE.PERSPECTIVE,
  fov: degToRadNumeric(args.fovVerticalDeg),
  fovHorizontal: degToRadNumeric(args.fovHorizontalDeg),
  viewOffset: buildViewOffset(args),
  ...buildOptionalFrustum(args),
});

const buildOptionalFrustum = (args: CameraStateVisualizerStoryProps) => ({
  ...(args.nearPlaneM > 0 || args.farPlaneM > 0
    ? {
        frustum: {
          ...(args.nearPlaneM > 0 ? { near: args.nearPlaneM } : {}),
          ...(args.farPlaneM > 0 ? { far: args.farPlaneM } : {}),
        },
      }
    : {}),
});

const buildOrthographicIntrinsics = (
  args: CameraStateVisualizerStoryProps
) => ({
  type: CAMERA_TYPE.ORTHOGRAPHIC,
  orthographicScale: {
    metersPerCssPixel: 1,
  },
  ...buildOptionalFrustum(args),
});

const createViewState = (
  args: CameraStateVisualizerStoryProps,
  cameraModel: ViewStateVisualizerCameraModel,
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
    intrinsics:
      cameraModel === VIEW_STATE_VISUALIZER_CAMERA_MODEL.ORTHOGRAPHIC
        ? buildOrthographicIntrinsics(args)
        : buildPerspectiveIntrinsics(args),
    metadata: {
      frameId: 0,
      timestampMs: 0,
      sourceId: "camera-state-visualizer-story",
      source: "restore",
    },
  });

const normalizeMultiCameraSpecs = (
  cameras: CameraStateVisualizerStoryProps["cameras"],
  args: CameraStateVisualizerStoryProps
): MultiCameraStoryCameraSpec[] => {
  const seedCameras =
    cameras && cameras.length > 0 ? cameras : DEFAULT_MULTI_CAMERA_SPECS;

  return seedCameras.map((camera, index) => ({
    label: camera.label?.trim() || `Camera ${index + 1}`,
    cameraModel:
      camera.cameraModel ?? VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE,
    altitudeM: Number.isFinite(camera.altitudeM)
      ? camera.altitudeM
      : args.altitudeM,
    bearingDeg: Number.isFinite(camera.bearingDeg)
      ? camera.bearingDeg
      : args.bearingDeg,
    pitchDeg: Number.isFinite(camera.pitchDeg)
      ? camera.pitchDeg
      : args.pitchDeg,
    rollDeg: Number.isFinite(camera.rollDeg) ? camera.rollDeg : args.rollDeg,
    rangeM: Number.isFinite(camera.rangeM) ? camera.rangeM : args.rangeM,
  }));
};

const createViewStateFromCameraSpec = (
  args: CameraStateVisualizerStoryProps,
  camera: MultiCameraStoryCameraSpec
): ViewState =>
  buildViewState({
    longitude: 0,
    latitude: 0,
    altitude: camera.altitudeM ?? args.altitudeM,
    bearing: degToRadNumeric(camera.bearingDeg ?? args.bearingDeg),
    pitch: degToRadNumeric(camera.pitchDeg ?? args.pitchDeg),
    roll: degToRadNumeric(camera.rollDeg ?? args.rollDeg),
    range: camera.rangeM ?? args.rangeM,
    intrinsics:
      camera.cameraModel === VIEW_STATE_VISUALIZER_CAMERA_MODEL.ORTHOGRAPHIC
        ? buildOrthographicIntrinsics(args)
        : buildPerspectiveIntrinsics(args),
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
  args: CameraStateVisualizerStoryProps,
  cameraModel: ViewStateVisualizerCameraModel
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
      showOffset:
        cameraModel === VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE &&
        args.enableViewOffset,
    },
    axes: {
      show: args.showAxes,
      lineWidthPx: args.axisLineWidthPx,
    },
    frustum: {
      show: args.showFrustum,
      lineWidthPx: args.frustumLineWidthPx,
    },
    projectionPlane: {
      show: args.showProjectionPlane,
    },
    marker: {
      show: args.showCameraMarker,
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

const createMultiCameraDisplayOptions = ({
  args,
  showActiveCameraCues,
  showOrbitAxes,
}: {
  args: CameraStateVisualizerStoryProps;
  showActiveCameraCues: boolean;
  showOrbitAxes: boolean;
}): ViewStateVisualizerDisplayOptions => {
  const baseDisplayOptions = createDisplayOptions(
    args,
    VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE
  );

  return {
    ...baseDisplayOptions,
    worldAxes: {
      ...baseDisplayOptions.worldAxes,
      show: args.showAxes && showOrbitAxes,
    },
    angleCues: {
      ...baseDisplayOptions.angleCues,
      show: args.showAngleArcs && showActiveCameraCues,
    },
    cameraView: {
      ...baseDisplayOptions.cameraView,
      projectionPlane: {
        ...baseDisplayOptions.cameraView?.projectionPlane,
        show: true,
      },
      axes: {
        ...baseDisplayOptions.cameraView?.axes,
        show: args.showAxes && showActiveCameraCues,
        showInactive: false,
      },
    },
    altitude: {
      ...baseDisplayOptions.altitude,
      show: false,
      showScaleBreak: false,
    },
    labels: {
      ...baseDisplayOptions.labels,
      showAxes: args.showAxisLabels && showOrbitAxes,
      showAngles: args.showAngleLabels && showActiveCameraCues,
      showImagePlane: args.showImagePlaneLabels && showActiveCameraCues,
    },
  };
};

const buildSummary = ({
  args,
  cameraModel,
  bearingRad,
  pitchRad,
}: {
  args: CameraStateVisualizerStoryProps;
  cameraModel: ViewStateVisualizerCameraModel;
  bearingRad: number;
  pitchRad: number;
}) => {
  const showGroundProjection = args.showProjectionPlane;

  return [
    `${args.altitudeM.toFixed(1)} m`,
    cameraModel === VIEW_STATE_VISUALIZER_CAMERA_MODEL.ORTHOGRAPHIC
      ? "cam ortho"
      : "cam persp",
    `b ${radToDegNumeric(bearingRad).toFixed(1)}°`,
    `p ${radToDegNumeric(pitchRad).toFixed(1)}°`,
    args.showMaxPitchDeg ? `p max ${args.maxPitchDeg.toFixed(1)}°` : null,
    `r ${args.rangeM.toFixed(1)} m`,
    args.nearPlaneM > 0 ? `near ${args.nearPlaneM.toFixed(1)} m` : null,
    args.farPlaneM > 0 ? `far ${args.farPlaneM.toFixed(1)} m` : null,
    cameraModel === VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE
      ? `plane ${args.imagePlaneDistanceUnit.toFixed(2)}u`
      : null,
    cameraModel === VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE
      ? `fov v ${args.fovVerticalDeg.toFixed(1)}°`
      : null,
    cameraModel === VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE
      ? `fov h ${args.fovHorizontalDeg.toFixed(1)}°`
      : null,
    args.enableViewOffset &&
    cameraModel === VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE
      ? `offset ${args.viewOffsetXRatio.toFixed(
          2
        )},${args.viewOffsetYRatio.toFixed(
          2
        )} ${args.viewOffsetWidthRatio.toFixed(
          2
        )}x${args.viewOffsetHeightRatio.toFixed(2)}`
      : null,
    args.showCheckerboardBackground ? "bg checker" : "bg solid",
    showGroundProjection ? "ground proj" : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" • ");
};

const buildMultiCameraSummary = ({
  args,
  cameras,
  activeCameraIndex,
}: {
  args: CameraStateVisualizerStoryProps;
  cameras: MultiCameraStoryCameraSpec[];
  activeCameraIndex: number;
}) => {
  const activeCamera =
    cameras[clamp(activeCameraIndex, 0, Math.max(0, cameras.length - 1))];
  const activeCameraLabel = activeCamera?.label ?? "none";
  const activeCameraType =
    activeCamera?.cameraModel ===
    VIEW_STATE_VISUALIZER_CAMERA_MODEL.ORTHOGRAPHIC
      ? "ortho"
      : "persp";

  return [
    `${cameras.length} cams`,
    `active ${activeCameraIndex + 1}/${cameras.length}`,
    activeCameraLabel,
    activeCamera ? activeCameraType : null,
    args.showCheckerboardBackground ? "bg checker" : "bg solid",
    args.showProjectionPlane ? "ground proj" : null,
    "edit cameras control to add/remove",
  ]
    .filter((value): value is string => value !== null)
    .join(" • ");
};

type CameraVisualizerPanelProps = {
  args: CameraStateVisualizerStoryProps;
  cameraModel: ViewStateVisualizerCameraModel;
  bearingRad: number;
  pitchRad: number;
  onPoseChange: (bearing: number, pitch: number) => void;
};

const CameraVisualizerPanel = ({
  args,
  cameraModel,
  bearingRad,
  pitchRad,
  onPoseChange,
}: CameraVisualizerPanelProps) => {
  const viewState = useMemo(
    () => createViewState(args, cameraModel, bearingRad, pitchRad),
    [args, cameraModel, bearingRad, pitchRad]
  );
  const viewStates = useMemo(() => [viewState] as const, [viewState]);
  const overviewOptions = useMemo(() => createOverviewOptions(args), [args]);
  const visualizedOptions = useMemo(
    () => createVisualizedOptions(args),
    [args]
  );
  const displayOptions = useMemo(
    () => createDisplayOptions(args, cameraModel),
    [args, cameraModel]
  );

  return (
    <div style={VISUALIZER_STACK_STYLE}>
      <div style={buildFrameStyle(args.showCheckerboardBackground)}>
        <ViewStateVisualizer
          viewState={viewStates}
          activeCameraIndex={0}
          overviewOptions={overviewOptions}
          interactive={args.interactive}
          visualizedOptions={visualizedOptions}
          displayOptions={displayOptions}
          onCameraPoseChange={(_cameraIndex, bearing, pitch) => {
            onPoseChange(bearing, pitch);
          }}
          width={args.sizePx}
          height={args.sizePx}
          bearingLabel="b"
          pitchLabel="p"
        />
      </div>
    </div>
  );
};

const useSharedPoseState = (args: CameraStateVisualizerStoryProps) => {
  const [bearingRad, setBearingRad] = useState(
    degToRadNumeric(args.bearingDeg)
  );
  const [pitchRad, setPitchRad] = useState(degToRadNumeric(args.pitchDeg));

  useEffect(() => {
    setBearingRad(degToRadNumeric(args.bearingDeg));
    setPitchRad(degToRadNumeric(args.pitchDeg));
  }, [args.bearingDeg, args.pitchDeg]);

  return {
    bearingRad,
    pitchRad,
    setBearingRad,
    setPitchRad,
  };
};

const CameraStateVisualizerStory = (args: CameraStateVisualizerStoryProps) => {
  const { bearingRad, pitchRad, setBearingRad, setPitchRad } =
    useSharedPoseState(args);

  const summary = useMemo(
    () =>
      buildSummary({
        args,
        cameraModel: args.cameraModel,
        bearingRad,
        pitchRad,
      }),
    [args, bearingRad, pitchRad]
  );

  return (
    <div style={OUTER_BACKGROUND_STYLE}>
      <div style={STATUS_BAR_WRAPPER_STYLE}>
        <ResponsiveStatusBar text={summary} tone="dark" />
      </div>
      <div style={CENTERED_PAGE_CONTENT_STYLE}>
        <CameraVisualizerPanel
          args={args}
          cameraModel={args.cameraModel}
          bearingRad={bearingRad}
          pitchRad={pitchRad}
          onPoseChange={(bearing, pitch) => {
            setBearingRad(bearing);
            setPitchRad(pitch);
          }}
        />
      </div>
    </div>
  );
};

const CameraStateVisualizerMultiCameraStory = (
  args: CameraStateVisualizerStoryProps
) => {
  const [cameraSpecs, setCameraSpecs] = useState<MultiCameraStoryCameraSpec[]>(
    () => normalizeMultiCameraSpecs(args.cameras, args)
  );
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const [isCameraPoseDragging, setIsCameraPoseDragging] = useState(false);
  const [isOrbitDragging, setIsOrbitDragging] = useState(false);

  useEffect(() => {
    setCameraSpecs(normalizeMultiCameraSpecs(args.cameras, args));
  }, [
    args.altitudeM,
    args.bearingDeg,
    args.cameras,
    args.pitchDeg,
    args.rangeM,
    args.rollDeg,
  ]);

  useEffect(() => {
    setActiveCameraIndex((currentActiveCameraIndex) =>
      clamp(currentActiveCameraIndex, 0, Math.max(0, cameraSpecs.length - 1))
    );
  }, [cameraSpecs.length]);

  const viewStates = useMemo(
    () =>
      cameraSpecs.map((camera) => createViewStateFromCameraSpec(args, camera)),
    [args, cameraSpecs]
  );
  const overviewOptions = useMemo(() => createOverviewOptions(args), [args]);
  const visualizedOptions = useMemo(
    () => createVisualizedOptions(args),
    [args]
  );
  const displayOptions = useMemo(
    () =>
      createMultiCameraDisplayOptions({
        args,
        showActiveCameraCues: isCameraPoseDragging,
        showOrbitAxes: isOrbitDragging,
      }),
    [args, isCameraPoseDragging, isOrbitDragging]
  );
  const summary = useMemo(
    () =>
      buildMultiCameraSummary({
        args,
        cameras: cameraSpecs,
        activeCameraIndex,
      }),
    [args, cameraSpecs, activeCameraIndex]
  );

  return (
    <div style={OUTER_BACKGROUND_STYLE}>
      <div style={STATUS_BAR_WRAPPER_STYLE}>
        <ResponsiveStatusBar text={summary} tone="dark" />
      </div>
      <div style={CENTERED_PAGE_CONTENT_STYLE}>
        <div style={buildFrameStyle(args.showCheckerboardBackground)}>
          <ViewStateVisualizer
            viewState={viewStates}
            activeCameraIndex={activeCameraIndex}
            overviewOptions={overviewOptions}
            interactive={args.interactive}
            visualizedOptions={visualizedOptions}
            displayOptions={displayOptions}
            onActiveCameraChange={setActiveCameraIndex}
            onCameraPoseDragStateChange={setIsCameraPoseDragging}
            onOrbitDragStateChange={setIsOrbitDragging}
            onCameraPoseChange={(cameraIndex, bearing, pitch) => {
              setActiveCameraIndex(cameraIndex);
              setCameraSpecs((currentCameraSpecs) =>
                currentCameraSpecs.map((camera, index) =>
                  index === cameraIndex
                    ? {
                        ...camera,
                        bearingDeg: radToDegNumeric(bearing),
                        pitchDeg: radToDegNumeric(pitch),
                      }
                    : camera
                )
              );
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
  title: "Mapping Components/Camera State Visualizer",
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
    nearPlaneM: 0,
    farPlaneM: 0,
    cameraModel: VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE,
    fovVerticalDeg: 60,
    fovHorizontalDeg: 85.461115,
    enableViewOffset: false,
    viewOffsetFullWidthPx: 1,
    viewOffsetFullHeightPx: 1,
    viewOffsetXRatio: 0,
    viewOffsetYRatio: 0,
    viewOffsetWidthRatio: 1,
    viewOffsetHeightRatio: 1,
    imagePlaneDistanceUnit: 0.33,
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
    showProjectionPlane:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.projectionPlane
        .show,
    showAltitudeStem:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.altitude.show,
    showAltitudeScaleBreak:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.altitude.showScaleBreak,
    showCameraMarker:
      DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.marker.show,
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
    nearPlaneM: {
      name: "near m",
      control: { type: "range", min: 0, max: 2000, step: 0.1 },
      table: { category: "Intrinsics/Frustum" },
    },
    farPlaneM: {
      name: "far m",
      control: { type: "range", min: 0, max: 5000, step: 1 },
      table: { category: "Intrinsics/Frustum" },
    },
    cameraModel: {
      name: "camera model",
      control: { type: "select" },
      options: Object.values(VIEW_STATE_VISUALIZER_CAMERA_MODEL),
      table: { category: "Intrinsics" },
    },
    cameras: {
      name: "cameras",
      control: { type: "object" },
      table: { category: "Multi Camera" },
    },
    fovVerticalDeg: {
      name: "fov v deg",
      control: { type: "range", min: 0.1, max: 179.9, step: 0.1 },
      if: {
        arg: "cameraModel",
        eq: VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE,
      },
      table: { category: "Intrinsics" },
    },
    fovHorizontalDeg: {
      name: "fov h deg",
      control: { type: "range", min: 0.1, max: 179.9, step: 0.1 },
      if: {
        arg: "cameraModel",
        eq: VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE,
      },
      table: { category: "Intrinsics" },
    },
    enableViewOffset: {
      name: "enable view offset",
      control: { type: "boolean" },
      if: {
        arg: "cameraModel",
        eq: VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE,
      },
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
      control: { type: "range", min: 0.01, max: 1.5, step: 0.01 },
      if: {
        arg: "cameraModel",
        eq: VIEW_STATE_VISUALIZER_CAMERA_MODEL.PERSPECTIVE,
      },
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
    showProjectionPlane: {
      name: "ground projection",
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

type Story = StoryObj<typeof meta>;

const DISABLED_ARG_TYPE = {
  control: false,
  table: {
    disable: true,
  },
} as const;

const FIXED_CAMERA_MODEL_ARG_TYPE = {
  control: false,
  table: {
    disable: true,
  },
} as const;

export const Perspective: Story = {
  args: {
    interactive: true,
  },
  argTypes: {
    cameras: DISABLED_ARG_TYPE,
  },
  render: (args) => <CameraStateVisualizerStory {...args} />,
};

export const Orthographic: Story = {
  args: {
    cameraModel: VIEW_STATE_VISUALIZER_CAMERA_MODEL.ORTHOGRAPHIC,
    imagePlaneDistanceUnit: 0.33,
    interactive: true,
    showProjectionPlane: true,
  },
  argTypes: {
    cameraModel: FIXED_CAMERA_MODEL_ARG_TYPE,
    cameras: DISABLED_ARG_TYPE,
  },
  render: (args) => <CameraStateVisualizerStory {...args} />,
};

export const MultiCameraWorkbench: Story = {
  name: "Multi Camera Workbench",
  args: {
    imagePlaneDistanceUnit: 0.33,
    cameras: [...DEFAULT_MULTI_CAMERA_SPECS],
  },
  argTypes: {
    altitudeM: DISABLED_ARG_TYPE,
    bearingDeg: DISABLED_ARG_TYPE,
    pitchDeg: DISABLED_ARG_TYPE,
    rollDeg: DISABLED_ARG_TYPE,
    rangeM: DISABLED_ARG_TYPE,
    cameraModel: DISABLED_ARG_TYPE,
  },
  render: (args) => <CameraStateVisualizerMultiCameraStory {...args} />,
};
