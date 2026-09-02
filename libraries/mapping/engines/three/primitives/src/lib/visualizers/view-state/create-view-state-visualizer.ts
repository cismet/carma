import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Camera } from "three";

import {
  buildWorldVersorRotationFromArcballVectors,
  mapPointerToArcballVector,
} from "@carma-commons/interaction/rotation";
import {
  deriveOrbitAngles,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import { clamp, isFiniteNumber, PI, PI_OVER_TWO } from "@carma-commons/math";
import { degToRadNumeric, radToDegNumeric, zeroToTwoPi } from "@carma-units";
import type { Radians } from "@carma-units";

import {
  buildAltitudeStemGeometry,
  readGroundDistance,
} from "./derived/altitude-stem-geometry";
import {
  buildCirclePoints,
  buildHorizontalArcPoints,
  buildMaxPitchRingPoints,
  buildPitchArcPoints,
  PLANAR_CURVE_AXES,
  pointOnBearingCircle,
} from "./derived/angle-cue-geometry";
import {
  buildImagePlaneGeometry,
  cameraSpherePositionToViewingBearingPitch,
  computeUnitHemisphereCameraPosition,
  viewingBearingPitchToCameraSpherePosition,
} from "./derived/camera-view-geometry";
import { createAltitude } from "./parts/altitude/altitude";
import { createCameraView } from "./parts/camera/camera-view";
import { createAngleCues } from "./parts/cues/angle-cues";
import { createMaxPitchRing } from "./parts/cues/max-pitch-ring";
import { createHemisphereSurface } from "./parts/sphere/hemisphere-surface";
import { createWorldAxes } from "./parts/world-axes/world-axes";
import { createVolumeBoxes } from "./parts/volume-boxes/volume-boxes";
import {
  createPointToCanvasProjector,
  projectOrthogonalLineLabelAnchor,
  projectOrthogonalPolylineLabelAnchor,
} from "./projection/label-anchors";
import {
  DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS,
  DEFAULT_VIEW_STATE_VISUALIZER_INTERACTIVE,
  DEFAULT_VIEW_STATE_VISUALIZER_OVERVIEW_OPTIONS,
  VIEW_STATE_VISUALIZER_DEFAULTS,
  VIEW_STATE_VISUALIZER_GEOMETRY_DEFAULTS,
  VIEW_STATE_VISUALIZER_MATERIAL_DEFAULTS,
  mergeViewStateVisualizerDisplayOptions,
  mergeViewStateVisualizerOverviewOptions,
  mergeViewStateVisualizerVisualizedOptions,
} from "./view-state-visualizer-defaults";
import type {
  ResolvedViewStateVisualizerDisplayOptions,
  ResolvedViewStateVisualizerOverviewOptions,
  ResolvedViewStateVisualizerVisualizedOptions,
  ViewStateVisualizerCueKey,
  ViewStateVisualizerDisplayOptions,
  ViewStateVisualizerInput,
  ViewStateVisualizerLabelAnchors,
  ViewStateVisualizerOverviewOptions,
  ViewStateVisualizerOptions,
  ViewStateVisualizerPrimitive,
  ViewStateVisualizerVolumeBoxesOptions,
  ViewStateVisualizerVisualizedOptions,
  ViewStateVisualizerSize,
} from "./view-state-visualizer-types";
const DEFAULT_SIZE: ViewStateVisualizerSize =
  VIEW_STATE_VISUALIZER_DEFAULTS.size;
const GEOMETRY = VIEW_STATE_VISUALIZER_GEOMETRY_DEFAULTS;
const MATERIALS = VIEW_STATE_VISUALIZER_MATERIAL_DEFAULTS;
const HEMISPHERE_RADIUS = GEOMETRY.hemisphere.radius;
const MIN_RENDER_LINE_WIDTH_PX = GEOMETRY.numeric.minRenderLineWidthPx;
const NUMERIC_EPSILON = GEOMETRY.numeric.epsilon;

const resolveDefaultFrameHalfExtent = () =>
  HEMISPHERE_RADIUS + GEOMETRY.frame.padding;

const WORLD_UP = new Vector3(0, 1, 0);
const WORLD_NORTH = new Vector3(0, 0, -1);
const WORLD_EAST = new Vector3(1, 0, 0);
const ORIGIN = new Vector3(0, 0, 0);
const POINTER_DRAG_MODE = {
  ORBIT: "orbit",
  CAMERA_MARKER_ARCBALL_POSE: "camera-marker-arcball-pose",
} as const;
const POINTER_CURSOR = {
  IDLE: "grab",
  DRAGGING: "grabbing",
} as const;

// Intentionally interleave warm/cool hues so newly added cameras do not step
// through adjacent colors in sequence.
const CAMERA_VIEW_VARIANT_STYLES: readonly CameraViewVariantStyle[] = [
  {
    edgeColor: "#2563eb",
    imageXColor: "#60a5fa",
    imageYColor: "#93c5fd",
    fillColor: 0x2563eb,
    emissiveColor: 0x2563eb,
    frustumColor: 0x2563eb,
  },
  {
    edgeColor: "#d97706",
    imageXColor: "#f59e0b",
    imageYColor: "#fbbf24",
    fillColor: 0xd97706,
    emissiveColor: 0xd97706,
    frustumColor: 0xd97706,
  },
  {
    edgeColor: "#7c3aed",
    imageXColor: "#a855f7",
    imageYColor: "#fb7185",
    fillColor: 0x7c3aed,
    emissiveColor: 0x7c3aed,
    frustumColor: 0x7c3aed,
  },
  {
    edgeColor: "#0f766e",
    imageXColor: "#2dd4bf",
    imageYColor: "#99f6e4",
    fillColor: 0x0f766e,
    emissiveColor: 0x0f766e,
    frustumColor: 0x0f766e,
  },
  {
    edgeColor: "#e11d48",
    imageXColor: "#fb7185",
    imageYColor: "#fda4af",
    fillColor: 0xe11d48,
    emissiveColor: 0xe11d48,
    frustumColor: 0xe11d48,
  },
  {
    edgeColor: "#65a30d",
    imageXColor: "#84cc16",
    imageYColor: "#bef264",
    fillColor: 0x65a30d,
    emissiveColor: 0x65a30d,
    frustumColor: 0x65a30d,
  },
  {
    edgeColor: "#0891b2",
    imageXColor: "#22d3ee",
    imageYColor: "#67e8f9",
    fillColor: 0x0891b2,
    emissiveColor: 0x0891b2,
    frustumColor: 0x0891b2,
  },
  {
    edgeColor: "#c2410c",
    imageXColor: "#fb923c",
    imageYColor: "#fdba74",
    fillColor: 0xc2410c,
    emissiveColor: 0xc2410c,
    frustumColor: 0xc2410c,
  },
] as const;

type PointerDragMode =
  | (typeof POINTER_DRAG_MODE)[keyof typeof POINTER_DRAG_MODE]
  | null;

type CameraViewPartInstance = ReturnType<typeof createCameraView>;

type ResolvedDisplayVisibility = {
  showSurface: boolean;
  showWorldAxes: boolean;
  showAngleCues: boolean;
  showCameraImagePlane: boolean;
  showCameraImagePlaneOffset: boolean;
  showCameraAxes: boolean;
  showCameraFrustum: boolean;
  showCameraProjectionPlane: boolean;
  showAltitude: boolean;
  showCameraMarker: boolean;
  showAltitudeScaleBreak: boolean;
  rotateSurfaceWithPose: boolean;
};

type ResolvedLineWidths = {
  worldAxesLineWidthPx: number;
  angleCueLineWidthPx: number;
  cameraAxesLineWidthPx: number;
  cameraFrustumLineWidthPx: number;
  altitudeLineWidthPx: number;
};

type CameraViewVariantStyle = {
  edgeColor: string;
  imageXColor: string;
  imageYColor: string;
  fillColor: number;
  emissiveColor: number;
  frustumColor: number;
};

const normalizeBearing = (bearingRadians: number): number =>
  zeroToTwoPi(bearingRadians as Radians) as number;

const normalizeViewStateInput = (
  viewState: ViewStateVisualizerInput
): ViewState[] => (Array.isArray(viewState) ? [...viewState] : [viewState]);

const clampActiveCameraIndex = (
  cameraIndex: number,
  viewStates: readonly ViewState[]
): number => {
  if (viewStates.length <= 1) {
    return 0;
  }

  const resolvedCameraIndex = Number.isFinite(cameraIndex)
    ? Math.floor(cameraIndex)
    : 0;

  return clamp(resolvedCameraIndex, 0, viewStates.length - 1);
};

const readCameraViewVariantStyle = (index: number): CameraViewVariantStyle =>
  CAMERA_VIEW_VARIANT_STYLES[
    ((Math.max(0, Math.floor(index)) % CAMERA_VIEW_VARIANT_STYLES.length) +
      CAMERA_VIEW_VARIANT_STYLES.length) %
      CAMERA_VIEW_VARIANT_STYLES.length
  ]!;

const clampPerspectiveFovRad = (fovRadians: number): number =>
  clamp(fovRadians, NUMERIC_EPSILON, PI - NUMERIC_EPSILON);

const clampPerspectiveFovDeg = (fovDeg: number): number => {
  const fovRad = degToRadNumeric(fovDeg);
  if (!isFiniteNumber(fovRad)) {
    return GEOMETRY.overviewCamera.fovDeg;
  }

  return radToDegNumeric(clampPerspectiveFovRad(fovRad));
};

const resolveSphereCapRad = (
  display: ResolvedViewStateVisualizerDisplayOptions
) => clamp(display.surface.sphereCapRad, GEOMETRY.hemisphere.minCapRad, PI);

const resolveSphereOpacity = (
  display: ResolvedViewStateVisualizerDisplayOptions
) => clamp(display.surface.sphereOpacity, 0, 1);

const resolveDisplayVisibility = (
  display: ResolvedViewStateVisualizerDisplayOptions
): ResolvedDisplayVisibility => {
  return {
    showSurface: display.surface.show,
    showWorldAxes: display.worldAxes.show,
    showAngleCues: display.angleCues.show,
    showCameraImagePlane: display.cameraView.imagePlane.show,
    showCameraImagePlaneOffset:
      display.cameraView.imagePlane.show &&
      display.cameraView.imagePlane.showOffset,
    showCameraAxes:
      display.cameraView.imagePlane.show && display.cameraView.axes.show,
    showCameraFrustum:
      display.cameraView.imagePlane.show && display.cameraView.frustum.show,
    showCameraProjectionPlane: display.cameraView.projectionPlane.show,
    showAltitude: display.altitude.show,
    showCameraMarker: display.cameraView.marker.show,
    showAltitudeScaleBreak:
      display.altitude.show && display.altitude.showScaleBreak,
    rotateSurfaceWithPose: display.surface.rotateWithPose,
  };
};

const resolveDisplayLineWidths = (
  display: ResolvedViewStateVisualizerDisplayOptions
): ResolvedLineWidths => {
  const worldAxesLineWidthPx = Math.max(
    MIN_RENDER_LINE_WIDTH_PX,
    display.worldAxes.lineWidthPx
  );

  return {
    worldAxesLineWidthPx,
    angleCueLineWidthPx: Math.max(
      MIN_RENDER_LINE_WIDTH_PX,
      display.angleCues.lineWidthPx
    ),
    cameraAxesLineWidthPx: Math.max(
      MIN_RENDER_LINE_WIDTH_PX,
      display.cameraView.axes.lineWidthPx
    ),
    cameraFrustumLineWidthPx: Math.max(
      MIN_RENDER_LINE_WIDTH_PX,
      display.cameraView.frustum.lineWidthPx
    ),
    altitudeLineWidthPx: Math.max(
      MIN_RENDER_LINE_WIDTH_PX,
      display.altitude.lineWidthPx
    ),
  };
};

const resolveCueColors = (
  display: ResolvedViewStateVisualizerDisplayOptions
): Record<ViewStateVisualizerCueKey, string> => display.cueColors;

const readMaxPitchLimit = (
  visualized: ResolvedViewStateVisualizerVisualizedOptions
): number | null =>
  isFiniteNumber(visualized.maxPitch)
    ? clamp(visualized.maxPitch ?? 0, 0, PI_OVER_TWO)
    : null;

const createOverviewPerspectiveCamera = (fovDeg: number) => {
  const clampedFovDeg = clampPerspectiveFovDeg(fovDeg);
  const camera = new PerspectiveCamera(
    clampedFovDeg,
    1,
    GEOMETRY.overviewCamera.near,
    GEOMETRY.overviewCamera.far
  );
  camera.up.copy(WORLD_UP);
  camera.updateProjectionMatrix();
  return camera;
};

export const createViewStateVisualizerPrimitive = (
  canvas: HTMLCanvasElement,
  viewState: ViewStateVisualizerInput,
  options: ViewStateVisualizerOptions = {}
): ViewStateVisualizerPrimitive => {
  let size: ViewStateVisualizerSize = {
    ...DEFAULT_SIZE,
    ...options.size,
  };
  let currentOverview = mergeViewStateVisualizerOverviewOptions(
    DEFAULT_VIEW_STATE_VISUALIZER_OVERVIEW_OPTIONS,
    options.overview
  );
  let currentVisualized = mergeViewStateVisualizerVisualizedOptions(
    options.visualized
  );
  let currentDisplay = mergeViewStateVisualizerDisplayOptions(options.display);
  let interactive =
    options.interactive ?? DEFAULT_VIEW_STATE_VISUALIZER_INTERACTIVE;

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });

  renderer.setPixelRatio(
    typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio)
  );
  renderer.setSize(size.widthPx, size.heightPx, false);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();

  // --- Orbit state ---
  let orbitPhi =
    currentOverview.orbitPhi ?? GEOMETRY.overviewCamera.orbitPhiRad;
  let orbitTheta =
    currentOverview.orbitTheta ?? GEOMETRY.overviewCamera.rotationAroundUpRad;
  let orbitScale = 1;

  // --- Cameras ---
  // Keep sphere visually constant: distance adjusts with FOV so projected size stays the same.
  const initialFovDeg = clampPerspectiveFovDeg(currentOverview.fovDeg);
  const baseTangentProduct = resolveDefaultFrameHalfExtent();
  let currentFovDeg = initialFovDeg;
  const getOrbitRadius = () =>
    (baseTangentProduct * orbitScale) /
    Math.tan(degToRadNumeric(currentFovDeg)! * 0.5);

  const perspectiveCamera = createOverviewPerspectiveCamera(initialFovDeg);

  const orthoHalf = baseTangentProduct;
  const orthographicCamera = new OrthographicCamera(
    -orthoHalf,
    orthoHalf,
    orthoHalf,
    -orthoHalf,
    GEOMETRY.overviewCamera.near,
    GEOMETRY.overviewCamera.far
  );
  orthographicCamera.position.copy(perspectiveCamera.position);
  orthographicCamera.up.copy(WORLD_UP);
  orthographicCamera.lookAt(0, 0, 0);
  orthographicCamera.updateProjectionMatrix();
  orthographicCamera.updateMatrixWorld();

  let useOrthographic = currentOverview.orthographic;
  const getActiveCamera = (): Camera =>
    useOrthographic ? orthographicCamera : perspectiveCamera;

  const syncOrthographicProjection = (
    overview: ResolvedViewStateVisualizerOverviewOptions
  ) => {
    const aspect = size.widthPx / size.heightPx;
    const scaledHalfExtent = baseTangentProduct * orbitScale;
    const halfWidth = overview.fitOrthographicWidth
      ? scaledHalfExtent
      : scaledHalfExtent * aspect;
    const halfHeight = overview.fitOrthographicWidth
      ? scaledHalfExtent / aspect
      : scaledHalfExtent;
    orthographicCamera.left = -halfWidth;
    orthographicCamera.right = halfWidth;
    orthographicCamera.top = halfHeight;
    orthographicCamera.bottom = -halfHeight;
    orthographicCamera.updateProjectionMatrix();
  };

  const orbitPositionScratch = new Vector3();

  const writeOrbitPosition = ({
    target,
    radius,
    theta,
    phi,
  }: {
    target: Vector3;
    radius: number;
    theta: number;
    phi: number;
  }) => {
    target.setFromSphericalCoords(radius, phi, theta);
  };

  const syncCamerasToOrbit = () => {
    const r = getOrbitRadius();
    writeOrbitPosition({
      target: orbitPositionScratch,
      radius: r,
      theta: orbitTheta,
      phi: orbitPhi,
    });
    perspectiveCamera.position.copy(orbitPositionScratch);
    perspectiveCamera.lookAt(0, 0, 0);
    perspectiveCamera.updateProjectionMatrix();
    perspectiveCamera.updateMatrixWorld();
    orthographicCamera.position.copy(orbitPositionScratch);
    orthographicCamera.lookAt(0, 0, 0);
    orthographicCamera.updateMatrixWorld();
  };

  // --- Raycaster + drag state ---
  const raycaster = new Raycaster();
  let dragMode: PointerDragMode = null;
  let dragStartArcballVector = new Vector3();
  let dragLastClientX = 0;
  let dragLastClientY = 0;
  let dragCameraIndex = 0;
  let isCameraPoseDragging = false;
  let isOrbitDragging = false;
  // For arcball pose drag: the bearing/pitch at drag start
  let dragStartBearing = 0;
  let dragStartPitch = 0;

  const readPointerArcballVector = (
    clientX: number,
    clientY: number
  ): Vector3 => {
    const rect = canvas.getBoundingClientRect();
    return mapPointerToArcballVector({
      clientX,
      clientY,
      viewport: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  // --- Display state ---
  let lastViewStates = normalizeViewStateInput(viewState);
  let activeCameraIndex = clampActiveCameraIndex(
    options.activeCameraIndex ?? 0,
    lastViewStates
  );
  let currentLabelAnchors: ViewStateVisualizerLabelAnchors | null = null;

  // --- Scene objects ---
  scene.add(
    new AmbientLight(
      MATERIALS.scene.ambientLight.color,
      MATERIALS.scene.ambientLight.intensity
    )
  );
  scene.add(
    new HemisphereLight(
      MATERIALS.scene.hemisphereLight.skyColor,
      MATERIALS.scene.hemisphereLight.groundColor,
      MATERIALS.scene.hemisphereLight.intensity
    )
  );
  const sun = new DirectionalLight(
    MATERIALS.scene.directionalLight.color,
    MATERIALS.scene.directionalLight.intensity
  );
  sun.position.set(
    MATERIALS.scene.directionalLight.position.x,
    MATERIALS.scene.directionalLight.position.y,
    MATERIALS.scene.directionalLight.position.z
  );
  scene.add(sun);
  const hemisphereSurface = createHemisphereSurface(scene, {
    radius: HEMISPHERE_RADIUS,
    widthSegments: GEOMETRY.hemisphere.widthSegments,
    heightSegments: GEOMETRY.hemisphere.heightSegments,
    minCapRad: GEOMETRY.hemisphere.minCapRad,
    initialCapRad: resolveSphereCapRad(currentDisplay),
    initialOpacity: resolveSphereOpacity(currentDisplay),
    material: {
      color: MATERIALS.surface.hemisphere.color,
      roughness: MATERIALS.surface.hemisphere.roughness,
      metalness: MATERIALS.surface.hemisphere.metalness,
      clearcoat: MATERIALS.surface.hemisphere.clearcoat,
      clearcoatRoughness: MATERIALS.surface.hemisphere.clearcoatRoughness,
      emissive: MATERIALS.surface.hemisphere.emissive,
      emissiveIntensity: MATERIALS.surface.hemisphere.emissiveIntensity,
    },
  });
  hemisphereSurface.mesh.renderOrder = 0;

  const maxPitchRing = createMaxPitchRing(scene, {
    color: MATERIALS.surface.maxPitchRing.color,
    opacity: MATERIALS.surface.maxPitchRing.opacity,
    dashSize: HEMISPHERE_RADIUS * GEOMETRY.arcs.maxPitchRingDashSize,
    gapSize: HEMISPHERE_RADIUS * GEOMETRY.arcs.maxPitchRingGapSize,
    renderOrder: 4,
  });

  const altitude = createAltitude(scene, size, {
    zeroElevationDiscRadius: GEOMETRY.altitude.zeroElevationDiscRadius,
    discSegments: GEOMETRY.sampling.discSegments,
    discColor: MATERIALS.surface.altitudeDisc.color,
    discOpacity: MATERIALS.surface.altitudeDisc.opacity,
    outlineColor: MATERIALS.surface.altitudeOutline.color,
    outlineOpacity: MATERIALS.surface.altitudeOutline.opacity,
    lineColor: MATERIALS.altitude.lineColor,
    lineOpacity: MATERIALS.altitude.lineOpacity,
    breakOpacity: MATERIALS.altitude.breakOpacity,
  });

  const angleCues = createAngleCues(scene, size, {
    initialColors: {
      bearing: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.bearing,
      pitch: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.pitch,
      range: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.range,
    },
    bearingOpacity: MATERIALS.arcs.bearingOpacity,
    pitchOpacity: MATERIALS.arcs.pitchOpacity,
    rangeOpacity: MATERIALS.camera.rangeOpacity,
  });

  const worldAxes = createWorldAxes(scene, size, {
    initialColors: {
      east: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.east,
      north: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.north,
      up: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.up,
    },
    opacity: MATERIALS.axes.opacity,
  });
  const volumeBoxes = createVolumeBoxes(scene);
  let currentVolumeBoxes: ViewStateVisualizerVolumeBoxesOptions =
    options.volumeBoxes ?? { boxes: [] };
  const applyVolumeBoxes = () => {
    volumeBoxes.update(currentVolumeBoxes.boxes);
    volumeBoxes.setDisplay({
      visible:
        (currentVolumeBoxes.visible ?? true) &&
        currentVolumeBoxes.boxes.length > 0,
      color: currentVolumeBoxes.color ?? "#0f766e",
      opacity: currentVolumeBoxes.opacity ?? 0.55,
    });
  };
  applyVolumeBoxes();

  const cameraViews: CameraViewPartInstance[] = [];

  const createCameraViewInstance = (index: number): CameraViewPartInstance => {
    const style = readCameraViewVariantStyle(index);

    return createCameraView(scene, size, {
      cameraBoxSize: GEOMETRY.frame.cameraBoxSize,
      initialEdgeColor: style.edgeColor,
      initialImageXColor: style.imageXColor,
      initialImageYColor: style.imageYColor,
      imagePlane: {
        surfaceOpacity: MATERIALS.imagePlane.surfaceOpacity,
        offsetSurfaceOpacity: MATERIALS.imagePlane.offsetSurfaceOpacity,
        forwardOpacity: MATERIALS.imagePlane.forwardOpacity,
        rightOpacity: MATERIALS.imagePlane.rightOpacity,
        upOpacity: MATERIALS.imagePlane.upOpacity,
        originOpacity: MATERIALS.imagePlane.originOpacity,
        neutralColor: MATERIALS.imagePlane.neutralColor,
      },
      camera: {
        fillColor: style.fillColor,
        emissiveColor: style.emissiveColor,
        bodyOpacity: MATERIALS.camera.bodyOpacity,
        markerEmissiveIntensity: MATERIALS.camera.markerEmissiveIntensity,
      },
      frustum: {
        color: style.frustumColor,
        opacity: MATERIALS.frustum.opacity,
      },
    });
  };

  const ensureCameraViewCount = (count: number) => {
    while (cameraViews.length < count) {
      cameraViews.push(createCameraViewInstance(cameraViews.length));
    }

    while (cameraViews.length > count) {
      cameraViews.pop()?.dispose();
    }
  };

  // --- Display option application ---
  const applyDisplayOptions = (
    display: ResolvedViewStateVisualizerDisplayOptions
  ) => {
    const visibility = resolveDisplayVisibility(display);
    const lineWidths = resolveDisplayLineWidths(display);
    const cueColors = resolveCueColors(display);

    hemisphereSurface.setDisplay({
      visible: visibility.showSurface,
      opacity: resolveSphereOpacity(display),
      sphereCapRad: resolveSphereCapRad(display),
      rotateWithPose: visibility.rotateSurfaceWithPose,
    });

    worldAxes.setDisplay({
      visible: visibility.showWorldAxes,
      showUp: display.worldAxes.showUp,
      lineWidthPx: lineWidths.worldAxesLineWidthPx,
      cueColors: {
        east: cueColors.east,
        north: cueColors.north,
        up: cueColors.up,
      },
    });

    angleCues.setDisplay({
      visible: visibility.showAngleCues,
      lineWidthPx: lineWidths.angleCueLineWidthPx,
      cueColors: {
        bearing: cueColors.bearing,
        pitch: cueColors.pitch,
        range: cueColors.range,
      },
    });
    maxPitchRing.setDisplay({
      visible: visibility.showAngleCues,
      lineWidthPx: lineWidths.angleCueLineWidthPx,
      color: MATERIALS.surface.maxPitchRing.color,
    });

    cameraViews.forEach((cameraView, index) => {
      const style = readCameraViewVariantStyle(index);
      const showCameraAxes =
        visibility.showCameraAxes &&
        (display.cameraView.axes.showInactive || index === activeCameraIndex);
      const showCameraFrustum =
        visibility.showCameraFrustum &&
        (display.cameraView.frustum.showInactive ||
          index === activeCameraIndex);

      cameraView.setDisplay({
        showImagePlane: visibility.showCameraImagePlane,
        showImagePlaneOffset: visibility.showCameraImagePlaneOffset,
        showAxes: showCameraAxes,
        showFrustum: showCameraFrustum,
        showProjectionPlane: visibility.showCameraProjectionPlane,
        showMarker: visibility.showCameraMarker,
        axisLineWidthPx: lineWidths.cameraAxesLineWidthPx,
        frustumLineWidthPx: lineWidths.cameraFrustumLineWidthPx,
        cueColors: {
          imageX: style.imageXColor,
          imageY: style.imageYColor,
          range: cueColors.range,
        },
      });
    });

    altitude.setDisplay({
      visible: visibility.showAltitude,
      showScaleBreak: visibility.showAltitudeScaleBreak,
      lineWidthPx: lineWidths.altitudeLineWidthPx,
      cueColor: cueColors.altitude,
    });
  };

  const applyOverviewOptions = (
    overview: ResolvedViewStateVisualizerOverviewOptions
  ) => {
    if (overview.orbitTheta !== undefined) {
      orbitTheta = overview.orbitTheta;
    }
    if (overview.orbitPhi !== undefined) {
      orbitPhi = overview.orbitPhi;
    }

    useOrthographic = overview.orthographic;
    const clampedFovDeg = clampPerspectiveFovDeg(overview.fovDeg);
    currentFovDeg = clampedFovDeg;
    perspectiveCamera.fov = clampedFovDeg;
    perspectiveCamera.updateProjectionMatrix();
    syncOrthographicProjection(overview);
    syncCamerasToOrbit();
  };

  const capturePointerDrag = (pointerId: number) => {
    canvas.setPointerCapture(pointerId);
    canvas.style.cursor = POINTER_CURSOR.DRAGGING;
  };

  const readCurrentDisplayPose = (cameraIndex: number) => {
    const displayCameraPosition = computeUnitHemisphereCameraPosition({
      viewState:
        lastViewStates[clampActiveCameraIndex(cameraIndex, lastViewStates)]!,
      hemisphereRadius: HEMISPHERE_RADIUS,
    });
    return cameraSpherePositionToViewingBearingPitch(displayCameraPosition);
  };

  const beginCameraMarkerArcballPoseDrag = (
    cameraIndex: number,
    pointerId: number,
    clientX: number,
    clientY: number
  ) => {
    if (!isCameraPoseDragging) {
      isCameraPoseDragging = true;
      options.onCameraPoseDragStateChange?.(true);
    }
    dragMode = POINTER_DRAG_MODE.CAMERA_MARKER_ARCBALL_POSE;
    dragCameraIndex = clampActiveCameraIndex(cameraIndex, lastViewStates);
    dragStartArcballVector = readPointerArcballVector(clientX, clientY);
    const displayPose = readCurrentDisplayPose(dragCameraIndex);
    dragStartBearing = displayPose.bearing;
    dragStartPitch = displayPose.pitch;
    capturePointerDrag(pointerId);
  };

  const beginOrbitDrag = (
    pointerId: number,
    clientX: number,
    clientY: number
  ) => {
    if (!isOrbitDragging) {
      isOrbitDragging = true;
      options.onOrbitDragStateChange?.(true);
    }
    dragMode = POINTER_DRAG_MODE.ORBIT;
    dragLastClientX = clientX;
    dragLastClientY = clientY;
    capturePointerDrag(pointerId);
  };

  const updateArcballPoseDrag = (clientX: number, clientY: number) => {
    const currentArcballVector = readPointerArcballVector(clientX, clientY);
    const worldRotation = buildWorldVersorRotationFromArcballVectors({
      startVector: dragStartArcballVector,
      currentVector: currentArcballVector,
      cameraWorldQuaternion: getActiveCamera().quaternion,
    });

    const startCamVec = viewingBearingPitchToCameraSpherePosition({
      viewingBearing: dragStartBearing,
      pitch: dragStartPitch,
      hemisphereRadius: 1,
    });
    const rotated = startCamVec.clone().applyQuaternion(worldRotation);
    const next = cameraSpherePositionToViewingBearingPitch(rotated);
    const maxPitch = currentVisualized.maxPitch ?? PI_OVER_TWO;
    const nextPitch = clamp(next.pitch, 0, maxPitch);

    if (options.onCameraPoseChange) {
      options.onCameraPoseChange(dragCameraIndex, next.bearing, nextPitch);
      return;
    }

    if (dragCameraIndex === 0) {
      options.onPoseChange?.(next.bearing, nextPitch);
    }
  };

  const updateOrbitDrag = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const deltaX = (clientX - dragLastClientX) / Math.max(rect.width, 1);
    const deltaY = (clientY - dragLastClientY) / Math.max(rect.height, 1);
    const orbitSensitivity = PI * 1.2;

    orbitTheta -= deltaX * orbitSensitivity;
    orbitPhi = clamp(
      orbitPhi - deltaY * orbitSensitivity,
      GEOMETRY.interaction.minOrbitPhi,
      PI * GEOMETRY.interaction.maxOrbitPhiFactorOfPi
    );
    dragLastClientX = clientX;
    dragLastClientY = clientY;

    syncCamerasToOrbit();
    const anchors = update(lastViewStates);
    options.onInteraction?.(anchors);
  };

  // Apply initial runtime options
  applyDisplayOptions(currentDisplay);
  applyOverviewOptions(currentOverview);

  // --- Update ---
  const update = (
    nextViewStateInput: ViewStateVisualizerInput
  ): ViewStateVisualizerLabelAnchors => {
    const nextViewStates = normalizeViewStateInput(nextViewStateInput);
    const resolvedActiveCameraIndex = clampActiveCameraIndex(
      activeCameraIndex,
      nextViewStates
    );
    const activeViewState = nextViewStates[resolvedActiveCameraIndex]!;

    lastViewStates = nextViewStates;
    activeCameraIndex = resolvedActiveCameraIndex;
    const activeCamera = getActiveCamera();
    const { range } = deriveOrbitAngles(activeViewState);

    const displayCameraPosition = computeUnitHemisphereCameraPosition({
      viewState: activeViewState,
      hemisphereRadius: HEMISPHERE_RADIUS,
    });
    const { bearing: viewingBearing, elevation } =
      cameraSpherePositionToViewingBearingPitch(displayCameraPosition);
    const visualBearing = normalizeBearing(viewingBearing);
    const cameraSideBearing = normalizeBearing(viewingBearing + PI);
    const { groundDistance, overflow } = readGroundDistance({
      altitudeMeters: activeViewState.anchorCartographic.altitude ?? 0,
      rangeMeters: range ?? 0,
      hemisphereRadius: HEMISPHERE_RADIUS,
    });
    const planeDiscY = -groundDistance;

    const showAltitudeScaleBreak = currentDisplay.altitude.showScaleBreak;
    const labelFontSizePx = currentDisplay.labels.fontSizePx;

    const planeDiscPoints = buildCirclePoints({
      radius: GEOMETRY.altitude.zeroElevationDiscRadius,
      axis: PLANAR_CURVE_AXES.XZ,
      offset: new Vector3(0, planeDiscY, 0),
      sampleCount: GEOMETRY.sampling.circleSampleCount,
    });
    const maxPitch = readMaxPitchLimit(currentVisualized);
    const maxPitchRingPoints = buildMaxPitchRingPoints({
      maxPitch,
      hemisphereRadius: HEMISPHERE_RADIUS,
      sampleCount: GEOMETRY.sampling.circleSampleCount,
    });

    ensureCameraViewCount(nextViewStates.length);
    applyDisplayOptions(currentDisplay);

    const cameraVisuals = nextViewStates.map((currentViewState) =>
      buildImagePlaneGeometry({
        viewState: currentViewState,
        visualized: currentVisualized,
        hemisphereRadius: HEMISPHERE_RADIUS,
        imagePlaneDefaults: GEOMETRY.imagePlane,
        epsilon: NUMERIC_EPSILON,
      })
    );
    const activeVisual = cameraVisuals[resolvedActiveCameraIndex]!;
    const altitudeStemGeometry = buildAltitudeStemGeometry({
      planeDiscY,
      overflow,
      showScaleBreak: showAltitudeScaleBreak,
      overflowGapHalfHeight: GEOMETRY.altitude.overflowGapHalfHeight,
      scaleBreakHalfHeight: GEOMETRY.altitude.scaleBreakHalfHeight,
      scaleBreakHalfWidth: GEOMETRY.altitude.scaleBreakHalfWidth,
    });

    maxPitchRing.update(maxPitchRingPoints);
    altitude.update({
      planeDiscY,
      planeDiscPoints,
      stemGeometry: altitudeStemGeometry,
    });
    const bearingArcPoints = buildHorizontalArcPoints({
      radius: GEOMETRY.arcs.outerRadius,
      startAngle: 0,
      endAngle: visualBearing,
      y: 0,
      sampleCount: GEOMETRY.sampling.horizontalArcSampleCount,
    });
    const pitchIndicatorArcPoints = buildPitchArcPoints({
      bearing: cameraSideBearing,
      elevation,
      radius: GEOMETRY.arcs.indicatorRadius,
      sampleCount: GEOMETRY.sampling.pitchArcSampleCount,
    });
    const bearingIndicatorArcPoints = buildHorizontalArcPoints({
      radius: GEOMETRY.arcs.indicatorRadius,
      startAngle: 0,
      endAngle: visualBearing,
      y: 0,
      sampleCount: GEOMETRY.sampling.horizontalArcSampleCount,
    });
    const elevationArcPoints = buildPitchArcPoints({
      bearing: cameraSideBearing,
      elevation,
      radius: GEOMETRY.arcs.outerRadius,
      sampleCount: GEOMETRY.sampling.pitchArcSampleCount,
    });
    const pitchArcStartPoint = pointOnBearingCircle({
      bearing: cameraSideBearing,
      radius: GEOMETRY.arcs.outerRadius,
    });
    // EN radial part for bearing/range cue.
    const bearingEquatorPoint = pointOnBearingCircle({
      bearing: visualBearing,
      radius: GEOMETRY.arcs.outerRadius,
    });
    angleCues.update({
      bearingArcPoints,
      pitchArcPoints: pitchIndicatorArcPoints,
      bearingIndicatorArcPoints,
      bearingRadialPoints: [bearingEquatorPoint, ORIGIN.clone()],
      pitchOriginPoints: [ORIGIN.clone(), pitchArcStartPoint],
      elevationArcPoints,
    });
    worldAxes.update({
      origin: ORIGIN,
      eastDirection: WORLD_EAST,
      eastLength: HEMISPHERE_RADIUS,
      northDirection: WORLD_NORTH,
      northLength: HEMISPHERE_RADIUS,
      upDirection: WORLD_UP,
      upLength: HEMISPHERE_RADIUS,
    });
    cameraVisuals.forEach((visual, index) => {
      cameraViews[index]?.update(visual);
    });
    hemisphereSurface.update(activeVisual.cameraPosition);

    renderer.render(scene, activeCamera);
    const projectPoint = createPointToCanvasProjector(size, activeCamera);

    const commonPlanarLabelOffset = WORLD_UP.clone().multiplyScalar(
      GEOMETRY.axes.labelUpOffset
    );
    const altitudeLabelWorldPoint = new Vector3(0, planeDiscY * 0.5, 0);
    const altitudeAnchor = projectPoint(altitudeLabelWorldPoint);
    const bearingArcMidpoint =
      bearingArcPoints[Math.floor(bearingArcPoints.length * 0.5)] ??
      ORIGIN.clone();
    const pitchArcMidpoint =
      elevationArcPoints[Math.floor(elevationArcPoints.length * 0.5)] ??
      ORIGIN.clone();
    const bearingAnchor = projectOrthogonalPolylineLabelAnchor({
      points: bearingArcPoints,
      size,
      camera: activeCamera,
      projectPoint,
      offsetPx: labelFontSizePx,
      biasToward: bearingArcMidpoint.clone().multiplyScalar(1.08),
    });
    const pitchAnchor = projectOrthogonalPolylineLabelAnchor({
      points: elevationArcPoints,
      size,
      camera: activeCamera,
      projectPoint,
      offsetPx: labelFontSizePx,
      biasToward: pitchArcMidpoint.clone().multiplyScalar(1.08),
    });
    const rangeLabelFallbackBiasPoint = pitchArcStartPoint
      .clone()
      .add(
        WORLD_UP.clone().multiplyScalar(
          HEMISPHERE_RADIUS * GEOMETRY.altitude.rangeLabelFallbackUpFactor
        )
      );
    const rangeAnchor = projectOrthogonalLineLabelAnchor({
      lineStart: ORIGIN,
      lineEnd: pitchArcStartPoint,
      size,
      camera: activeCamera,
      projectPoint,
      offsetPx: labelFontSizePx,
      biasToward: pitchArcMidpoint,
      fallbackBiasToward: rangeLabelFallbackBiasPoint,
    });
    const cameraRightEnd = activeVisual.cameraPosition
      .clone()
      .add(
        activeVisual.right
          .clone()
          .multiplyScalar(GEOMETRY.frame.cameraBoxSize * 1.25)
      );
    const cameraUpEnd = activeVisual.cameraPosition
      .clone()
      .add(
        activeVisual.up
          .clone()
          .multiplyScalar(GEOMETRY.frame.cameraBoxSize * 1.25)
      );
    const cameraForwardEnd = activeVisual.cameraPosition.clone().add(
      activeVisual.forward
        .clone()
        .negate()
        .multiplyScalar(GEOMETRY.frame.cameraBoxSize * 1.25)
    );
    const imagePlaneXEnd = activeVisual.imagePlaneXAxisEnd
      .clone()
      .add(
        activeVisual.right
          .clone()
          .multiplyScalar(
            GEOMETRY.imagePlane.basisLineLength *
              GEOMETRY.imagePlane.labelOffsetFactor
          )
      );
    const imagePlaneYEnd = activeVisual.imagePlaneYAxisEnd.clone().add(
      activeVisual.imagePlaneYAxisEnd
        .clone()
        .sub(activeVisual.imagePlaneAxisOrigin)
        .normalize()
        .multiplyScalar(
          GEOMETRY.imagePlane.basisLineLength *
            GEOMETRY.imagePlane.labelOffsetFactor
        )
    );
    const projectExtendedAxisEndLabel = ({
      lineStart,
      lineEnd,
      extension,
      extraOffset,
    }: {
      lineStart: Vector3;
      lineEnd: Vector3;
      extension: number;
      extraOffset?: Vector3;
    }) =>
      projectPoint(
        lineEnd
          .clone()
          .add(
            lineEnd.clone().sub(lineStart).normalize().multiplyScalar(extension)
          )
          .add(extraOffset ?? ORIGIN)
      );
    const cameraAxisLabelExtension = GEOMETRY.axes.northLabelExtraLength * 0.35;
    const imagePlaneAxisLabelExtension =
      GEOMETRY.imagePlane.basisLineLength *
      GEOMETRY.imagePlane.labelOffsetFactor *
      0.35;

    currentLabelAnchors = {
      bearing: bearingAnchor,
      pitch: pitchAnchor,
      range: rangeAnchor,
      altitude: {
        leftPx: altitudeAnchor.leftPx + labelFontSizePx,
        topPx: altitudeAnchor.topPx,
      },
      east: projectPoint(
        WORLD_EAST.clone()
          .multiplyScalar(
            HEMISPHERE_RADIUS + GEOMETRY.axes.northLabelExtraLength
          )
          .add(commonPlanarLabelOffset)
      ),
      north: projectPoint(
        WORLD_NORTH.clone()
          .multiplyScalar(
            HEMISPHERE_RADIUS + GEOMETRY.axes.northLabelExtraLength
          )
          .add(commonPlanarLabelOffset)
      ),
      up: projectPoint(
        WORLD_UP.clone().multiplyScalar(
          HEMISPHERE_RADIUS + GEOMETRY.axes.labelUpOffset * 2
        )
      ),
      cameraForward: projectExtendedAxisEndLabel({
        lineStart: activeVisual.cameraPosition,
        lineEnd: cameraForwardEnd,
        extension: cameraAxisLabelExtension,
      }),
      cameraRight: projectExtendedAxisEndLabel({
        lineStart: activeVisual.cameraPosition,
        lineEnd: cameraRightEnd,
        extension: cameraAxisLabelExtension,
        extraOffset: commonPlanarLabelOffset,
      }),
      cameraUp: projectExtendedAxisEndLabel({
        lineStart: activeVisual.cameraPosition,
        lineEnd: cameraUpEnd,
        extension: GEOMETRY.axes.labelUpOffset * 2,
      }),
      imageX: projectExtendedAxisEndLabel({
        lineStart: activeVisual.imagePlaneAxisOrigin,
        lineEnd: imagePlaneXEnd,
        extension: imagePlaneAxisLabelExtension,
        extraOffset: commonPlanarLabelOffset,
      }),
      imageY: projectExtendedAxisEndLabel({
        lineStart: activeVisual.imagePlaneAxisOrigin,
        lineEnd: imagePlaneYEnd,
        extension: imagePlaneAxisLabelExtension,
      }),
    };

    return currentLabelAnchors;
  };

  // --- Pointer interaction ---
  const onPointerDown = (e: PointerEvent) => {
    // Raycast to determine drag target
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    raycaster.setFromCamera(new Vector2(ndcX, ndcY), getActiveCamera());

    const dragTarget = cameraViews
      .flatMap((cameraView, cameraIndex) => {
        const dragTargetMesh = cameraView.readDragTargetMesh();
        const canDragTarget =
          Boolean(dragTargetMesh) &&
          dragTargetMesh.visible &&
          (Boolean(options.onCameraPoseChange) ||
            (cameraIndex === 0 && Boolean(options.onPoseChange)));

        if (!canDragTarget || !dragTargetMesh) {
          return [];
        }

        const dragTargetHit = raycaster.intersectObject(
          dragTargetMesh,
          false
        )[0];
        if (!dragTargetHit) {
          return [];
        }

        // Raycaster mesh hits are authoritative enough for draggable camera
        // bodies; an additional projected-silhouette test was rejecting valid
        // visible hits on the standalone camera box.
        return [{ cameraIndex, distance: dragTargetHit.distance }];
      })
      .sort((left, right) => left.distance - right.distance)[0];

    if (dragTarget) {
      const nextActiveCameraIndex = clampActiveCameraIndex(
        dragTarget.cameraIndex,
        lastViewStates
      );

      if (nextActiveCameraIndex !== activeCameraIndex) {
        activeCameraIndex = nextActiveCameraIndex;
        const anchors = update(lastViewStates);
        options.onInteraction?.(anchors);
        options.onActiveCameraChange?.(nextActiveCameraIndex);
      }

      beginCameraMarkerArcballPoseDrag(
        nextActiveCameraIndex,
        e.pointerId,
        e.clientX,
        e.clientY
      );
      return;
    }
    if (interactive) {
      beginOrbitDrag(e.pointerId, e.clientX, e.clientY);
      return;
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragMode) return;

    if (dragMode === POINTER_DRAG_MODE.CAMERA_MARKER_ARCBALL_POSE) {
      updateArcballPoseDrag(e.clientX, e.clientY);
    } else if (dragMode === POINTER_DRAG_MODE.ORBIT) {
      updateOrbitDrag(e.clientX, e.clientY);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragMode) return;
    if (dragMode === POINTER_DRAG_MODE.CAMERA_MARKER_ARCBALL_POSE) {
      isCameraPoseDragging = false;
      options.onCameraPoseDragStateChange?.(false);
    } else if (dragMode === POINTER_DRAG_MODE.ORBIT) {
      isOrbitDragging = false;
      options.onOrbitDragStateChange?.(false);
    }
    dragMode = null;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = POINTER_CURSOR.IDLE;
  };

  const onWheel = (event: WheelEvent) => {
    if (!interactive) return;
    event.preventDefault();
    orbitScale = clamp(orbitScale * Math.exp(event.deltaY * 0.001), 0.25, 6);
    syncOrthographicProjection(currentOverview);
    syncCamerasToOrbit();
    const anchors = update(lastViewStates);
    options.onInteraction?.(anchors);
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.style.cursor = POINTER_CURSOR.IDLE;

  currentLabelAnchors = update(viewState);

  // --- Resize ---
  const resize = (nextSize: ViewStateVisualizerSize) => {
    size = nextSize;
    renderer.setSize(size.widthPx, size.heightPx, false);
    perspectiveCamera.aspect = size.widthPx / size.heightPx;
    perspectiveCamera.updateProjectionMatrix();
    perspectiveCamera.updateMatrixWorld();
    angleCues.resize(size);
    worldAxes.resize(size);
    maxPitchRing.resize(size);
    altitude.resize(size);
    cameraViews.forEach((cameraView) => cameraView.resize(size));
    syncOrthographicProjection(currentOverview);
    orthographicCamera.updateMatrixWorld();

    currentLabelAnchors = update(lastViewStates);
    return currentLabelAnchors;
  };

  const setActiveCameraIndex = (cameraIndex: number) => {
    const nextActiveCameraIndex = clampActiveCameraIndex(
      cameraIndex,
      lastViewStates
    );

    if (nextActiveCameraIndex === activeCameraIndex) {
      return currentLabelAnchors;
    }

    activeCameraIndex = nextActiveCameraIndex;
    currentLabelAnchors = update(lastViewStates);
    return currentLabelAnchors;
  };

  const setOverview = (
    overviewOptions: ViewStateVisualizerOverviewOptions
  ): ViewStateVisualizerLabelAnchors | null => {
    currentOverview = mergeViewStateVisualizerOverviewOptions(
      DEFAULT_VIEW_STATE_VISUALIZER_OVERVIEW_OPTIONS,
      currentOverview,
      overviewOptions
    );
    applyOverviewOptions(currentOverview);
    currentLabelAnchors = update(lastViewStates);
    return currentLabelAnchors;
  };

  const setVisualized = (
    visualizedOptions: ViewStateVisualizerVisualizedOptions
  ): ViewStateVisualizerLabelAnchors | null => {
    currentVisualized = mergeViewStateVisualizerVisualizedOptions(
      currentVisualized,
      visualizedOptions
    );
    currentLabelAnchors = update(lastViewStates);
    return currentLabelAnchors;
  };

  // --- setDisplay ---
  const setDisplay = (
    displayOptions: ViewStateVisualizerDisplayOptions
  ): ViewStateVisualizerLabelAnchors | null => {
    currentDisplay = mergeViewStateVisualizerDisplayOptions(
      currentDisplay,
      displayOptions
    );
    applyDisplayOptions(currentDisplay);

    canvas.style.cursor = dragMode
      ? POINTER_CURSOR.DRAGGING
      : POINTER_CURSOR.IDLE;

    currentLabelAnchors = update(lastViewStates);
    return currentLabelAnchors;
  };

  const setInteractive = (nextInteractive: boolean) => {
    interactive = nextInteractive;
    if (!dragMode) {
      canvas.style.cursor = POINTER_CURSOR.IDLE;
    }
  };

  const setVolumeBoxes = (
    nextVolumeBoxes: ViewStateVisualizerVolumeBoxesOptions
  ) => {
    currentVolumeBoxes = nextVolumeBoxes;
    applyVolumeBoxes();
    currentLabelAnchors = update(lastViewStates);
    return currentLabelAnchors;
  };

  // --- Dispose ---
  const dispose = () => {
    if (isCameraPoseDragging) {
      isCameraPoseDragging = false;
      options.onCameraPoseDragStateChange?.(false);
    }
    if (isOrbitDragging) {
      isOrbitDragging = false;
      options.onOrbitDragStateChange?.(false);
    }
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);

    renderer.dispose();
    hemisphereSurface.dispose();
    maxPitchRing.dispose();
    altitude.dispose();
    angleCues.dispose();
    worldAxes.dispose();
    volumeBoxes.dispose();
    cameraViews.forEach((cameraView) => cameraView.dispose());
  };

  return {
    update,
    resize,
    setActiveCameraIndex,
    setOverview,
    setVisualized,
    setDisplay,
    setVolumeBoxes,
    setInteractive,
    readLabelAnchors: () => currentLabelAnchors,
    dispose,
  };
};
