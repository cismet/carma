import {
  buildWorldVersorRotationFromArcballVectors,
  mapPointerToArcballVector,
} from "@carma-commons/interaction/rotation";
import {
  deriveOrbitAngles,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import { clamp, isFiniteNumber, PI, PI_OVER_TWO } from "@carma/math";
import {
  degToRadNumeric,
  radToDegNumeric,
  zeroToTwoPi,
} from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
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
import type { BufferGeometry, Camera } from "three";
import {
  buildCirclePoints,
  buildHorizontalArcPoints,
  buildMaxPitchRingPoints,
  buildPitchArcPoints,
  PLANAR_CURVE_AXES,
  pointOnBearingCircle,
} from "./derived/angle-cue-geometry";
import {
  buildAltitudeStemGeometry,
  readGroundDistance,
} from "./derived/altitude-stem-geometry";
import {
  buildImagePlaneGeometry,
  cameraSpherePositionToViewingBearingPitch,
  computeUnitHemisphereCameraPosition,
  viewingBearingPitchToCameraSpherePosition,
} from "./derived/camera-view-geometry";
import {
  createPointToCanvasProjector,
  projectOrthogonalLineLabelAnchor,
  projectOrthogonalPolylineLabelAnchor,
} from "./projection/label-anchors";
import { createAltitude } from "./parts/altitude/altitude";
import { createCameraView } from "./parts/camera/camera-view";
import { createAngleCues } from "./parts/cues/angle-cues";
import { createMaxPitchRing } from "./parts/cues/max-pitch-ring";
import { createHemisphereSurface } from "./parts/sphere/hemisphere-surface";
import { createWorldAxes } from "./parts/world-axes/world-axes";
import { isPointerInsideProjectedMesh } from "./interaction/projected-mesh-hit-test";
import type {
  ResolvedViewStateVisualizerDisplayOptions,
  ResolvedViewStateVisualizerOverviewOptions,
  ResolvedViewStateVisualizerVisualizedOptions,
  ViewStateVisualizerCueKey,
  ViewStateVisualizerDisplayOptions,
  ViewStateVisualizerLabelAnchors,
  ViewStateVisualizerOverviewOptions,
  ViewStateVisualizerOptions,
  ViewStateVisualizerPrimitive,
  ViewStateVisualizerVisualizedOptions,
  ViewStateVisualizerSize,
} from "./view-state-visualizer-types";
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

type PointerDragMode =
  | (typeof POINTER_DRAG_MODE)[keyof typeof POINTER_DRAG_MODE]
  | null;

type ResolvedDisplayVisibility = {
  showSurface: boolean;
  showWorldAxes: boolean;
  showAngleCues: boolean;
  showCameraImagePlane: boolean;
  showCameraImagePlaneOffset: boolean;
  showCameraAxes: boolean;
  showCameraFrustum: boolean;
  showAltitude: boolean;
  showCameraMarker: boolean;
  showCameraLink: boolean;
  showAltitudeScaleBreak: boolean;
  rotateSurfaceWithPose: boolean;
};

type ResolvedLineWidths = {
  worldAxesLineWidthPx: number;
  angleCueLineWidthPx: number;
  cameraImagePlaneFrameLineWidthPx: number;
  cameraAxesLineWidthPx: number;
  cameraFrustumLineWidthPx: number;
  cameraLinkLineWidthPx: number;
  altitudeLineWidthPx: number;
};

const normalizeBearing = (bearingRadians: number): number =>
  zeroToTwoPi(bearingRadians as Radians) as number;

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
    showAltitude: display.altitude.show,
    showCameraMarker: display.cameraView.marker.show,
    showCameraLink: display.cameraView.link.show,
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
    cameraImagePlaneFrameLineWidthPx: Math.max(
      MIN_RENDER_LINE_WIDTH_PX,
      display.cameraView.imagePlane.frameLineWidthPx
    ),
    cameraAxesLineWidthPx: Math.max(
      MIN_RENDER_LINE_WIDTH_PX,
      display.cameraView.axes.lineWidthPx
    ),
    cameraFrustumLineWidthPx: Math.max(
      MIN_RENDER_LINE_WIDTH_PX,
      display.cameraView.frustum.lineWidthPx
    ),
    cameraLinkLineWidthPx: Math.max(
      MIN_RENDER_LINE_WIDTH_PX,
      display.cameraView.link.lineWidthPx
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
  viewState: ViewState,
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

  // --- Cameras ---
  // Keep sphere visually constant: distance adjusts with FOV so projected size stays the same.
  const initialFovDeg = clampPerspectiveFovDeg(currentOverview.fovDeg);
  const baseTangentProduct = resolveDefaultFrameHalfExtent();
  let currentFovDeg = initialFovDeg;
  const getOrbitRadius = () =>
    baseTangentProduct / Math.tan(degToRadNumeric(currentFovDeg)! * 0.5);

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
  let lastViewState = viewState;
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
    rangeOpacity: MATERIALS.camera.linkOpacity,
  });

  const worldAxes = createWorldAxes(scene, size, {
    initialColors: {
      east: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.east,
      north: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.north,
      up: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.up,
    },
    opacity: MATERIALS.axes.opacity,
  });

  const cameraView = createCameraView(scene, size, {
    cameraBoxSize: GEOMETRY.frame.cameraBoxSize,
    initialEdgeColor: MATERIALS.camera.edgeColor,
    initialImageXColor: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.imageX,
    initialImageYColor: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.imageY,
    imagePlane: {
      outlineOpacity: MATERIALS.imagePlane.outlineOpacity,
      surfaceOpacity: MATERIALS.imagePlane.surfaceOpacity,
      offsetSurfaceOpacity: MATERIALS.imagePlane.offsetSurfaceOpacity,
      offsetOutlineOpacity: MATERIALS.imagePlane.offsetOutlineOpacity,
      forwardOpacity: MATERIALS.imagePlane.forwardOpacity,
      rightOpacity: MATERIALS.imagePlane.rightOpacity,
      upOpacity: MATERIALS.imagePlane.upOpacity,
      originOpacity: MATERIALS.imagePlane.originOpacity,
      neutralColor: MATERIALS.imagePlane.neutralColor,
    },
    camera: {
      fillColor: MATERIALS.camera.fillColor,
      edgeColor: MATERIALS.camera.edgeColor,
      emissiveColor: MATERIALS.camera.emissiveColor,
      linkOpacity: MATERIALS.camera.linkOpacity,
      markerEmissiveIntensity: MATERIALS.camera.markerEmissiveIntensity,
    },
    frustum: {
      color: MATERIALS.frustum.color,
      opacity: MATERIALS.frustum.opacity,
    },
  });

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

    cameraView.setDisplay({
      showImagePlane: visibility.showCameraImagePlane,
      showImagePlaneOffset: visibility.showCameraImagePlaneOffset,
      showAxes: visibility.showCameraAxes,
      showFrustum: visibility.showCameraFrustum,
      showMarker: visibility.showCameraMarker,
      showLink: visibility.showCameraLink,
      frameLineWidthPx: lineWidths.cameraImagePlaneFrameLineWidthPx,
      axisLineWidthPx: lineWidths.cameraAxesLineWidthPx,
      frustumLineWidthPx: lineWidths.cameraFrustumLineWidthPx,
      linkLineWidthPx: lineWidths.cameraLinkLineWidthPx,
      cueColors: {
        imageX: cueColors.imageX,
        imageY: cueColors.imageY,
        range: cueColors.range,
      },
      edgeColor: MATERIALS.camera.edgeColor,
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
    const aspect = size.widthPx / size.heightPx;
    orthographicCamera.left = -baseTangentProduct * aspect;
    orthographicCamera.right = baseTangentProduct * aspect;
    orthographicCamera.top = baseTangentProduct;
    orthographicCamera.bottom = -baseTangentProduct;
    orthographicCamera.updateProjectionMatrix();
    syncCamerasToOrbit();
  };

  const capturePointerDrag = (pointerId: number) => {
    canvas.setPointerCapture(pointerId);
    canvas.style.cursor = POINTER_CURSOR.DRAGGING;
  };

  const readCurrentDisplayPose = () => {
    const displayCameraPosition = computeUnitHemisphereCameraPosition({
      viewState: lastViewState,
      hemisphereRadius: HEMISPHERE_RADIUS,
    });
    return cameraSpherePositionToViewingBearingPitch(displayCameraPosition);
  };

  const beginCameraMarkerArcballPoseDrag = (
    pointerId: number,
    clientX: number,
    clientY: number
  ) => {
    dragMode = POINTER_DRAG_MODE.CAMERA_MARKER_ARCBALL_POSE;
    dragStartArcballVector = readPointerArcballVector(clientX, clientY);
    const displayPose = readCurrentDisplayPose();
    dragStartBearing = displayPose.bearing;
    dragStartPitch = displayPose.pitch;
    capturePointerDrag(pointerId);
  };

  const beginOrbitDrag = (
    pointerId: number,
    clientX: number,
    clientY: number
  ) => {
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

    options.onPoseChange?.(next.bearing, clamp(next.pitch, 0, maxPitch));
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
    const anchors = update(lastViewState);
    options.onInteraction?.(anchors);
  };

  // Apply initial runtime options
  applyDisplayOptions(currentDisplay);
  applyOverviewOptions(currentOverview);

  // --- Update ---
  const update = (
    nextViewState: ViewState
  ): ViewStateVisualizerLabelAnchors => {
    lastViewState = nextViewState;
    const activeCamera = getActiveCamera();
    const { range } = deriveOrbitAngles(nextViewState);

    const displayCameraPosition = computeUnitHemisphereCameraPosition({
      viewState: nextViewState,
      hemisphereRadius: HEMISPHERE_RADIUS,
    });
    const { bearing: viewingBearing, elevation } =
      cameraSpherePositionToViewingBearingPitch(displayCameraPosition);
    const visualBearing = normalizeBearing(viewingBearing);
    const cameraSideBearing = normalizeBearing(viewingBearing + PI);
    const { groundDistance, overflow } = readGroundDistance({
      altitudeMeters: nextViewState.anchorCartographic.altitude ?? 0,
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

    const visual = buildImagePlaneGeometry({
      viewState: nextViewState,
      visualized: currentVisualized,
      hemisphereRadius: HEMISPHERE_RADIUS,
      imagePlaneDefaults: GEOMETRY.imagePlane,
      epsilon: NUMERIC_EPSILON,
    });
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
      eastLength: GEOMETRY.axes.axisLength,
      northDirection: WORLD_NORTH,
      northLength: GEOMETRY.arcs.outerRadius,
      upDirection: WORLD_UP,
      upLength: GEOMETRY.axes.axisLength,
    });
    cameraView.update(visual);
    hemisphereSurface.update(visual.cameraPosition);

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

    currentLabelAnchors = {
      bearing: bearingAnchor,
      pitch: pitchAnchor,
      range: rangeAnchor,
      altitude: {
        leftPx: altitudeAnchor.leftPx + labelFontSizePx,
        topPx: altitudeAnchor.topPx,
      },
      east: projectPoint(
        WORLD_EAST.clone().multiplyScalar(GEOMETRY.axes.axisLength)
      ),
      north: projectPoint(
        WORLD_NORTH.clone()
          .multiplyScalar(
            GEOMETRY.axes.axisLength + GEOMETRY.axes.northLabelExtraLength
          )
          .add(commonPlanarLabelOffset)
      ),
      up: projectPoint(
        WORLD_UP.clone().multiplyScalar(GEOMETRY.axes.axisLength)
      ),
      imageX: projectPoint(
        visual.imagePlaneXAxisEnd
          .clone()
          .add(
            visual.right
              .clone()
              .multiplyScalar(
                GEOMETRY.imagePlane.basisLineLength *
                  GEOMETRY.imagePlane.labelOffsetFactor
              )
          )
      ),
      imageY: projectPoint(
        visual.imagePlaneYAxisEnd.clone().add(
          visual.imagePlaneYAxisEnd
            .clone()
            .sub(visual.imagePlaneAxisOrigin)
            .normalize()
            .multiplyScalar(
              GEOMETRY.imagePlane.basisLineLength *
                GEOMETRY.imagePlane.labelOffsetFactor
            )
        )
      ),
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

    const sphereHits = raycaster.intersectObject(hemisphereSurface.mesh, false);

    // Check camera cube first, but only if it is not occluded by the hemisphere.
    const canUseCameraMarkerDrag =
      currentDisplay.cameraView.marker.show && Boolean(options.onPoseChange);
    const cubeHits = canUseCameraMarkerDrag
      ? raycaster.intersectObject(cameraView.cameraMarker, false)
      : [];
    const cubeHit = cubeHits[0];
    const sphereHit = sphereHits[0];
    const cubeIsInFrontOfSphere =
      cubeHit && (!sphereHit || cubeHit.distance <= sphereHit.distance);
    const pointerInsideCubeSilhouette =
      canUseCameraMarkerDrag &&
      Boolean(cubeHit) &&
      isPointerInsideProjectedMesh({
        clientX: e.clientX,
        clientY: e.clientY,
        mesh: cameraView.cameraMarker,
        geometry: cameraView.cameraMarker.geometry as BufferGeometry,
        size,
        camera: getActiveCamera(),
        canvas,
      });
    if (
      canUseCameraMarkerDrag &&
      cubeIsInFrontOfSphere &&
      pointerInsideCubeSilhouette &&
      options.onPoseChange
    ) {
      beginCameraMarkerArcballPoseDrag(e.pointerId, e.clientX, e.clientY);
      return;
    }
    if (sphereHits.length > 0 && interactive) {
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
    dragMode = null;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = POINTER_CURSOR.IDLE;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
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
    cameraView.resize(size);
    const aspect = size.widthPx / size.heightPx;
    orthographicCamera.left = -baseTangentProduct * aspect;
    orthographicCamera.right = baseTangentProduct * aspect;
    orthographicCamera.top = baseTangentProduct;
    orthographicCamera.bottom = -baseTangentProduct;
    orthographicCamera.updateProjectionMatrix();
    orthographicCamera.updateMatrixWorld();

    currentLabelAnchors = update(lastViewState);
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
    currentLabelAnchors = update(lastViewState);
    return currentLabelAnchors;
  };

  const setVisualized = (
    visualizedOptions: ViewStateVisualizerVisualizedOptions
  ): ViewStateVisualizerLabelAnchors | null => {
    currentVisualized = mergeViewStateVisualizerVisualizedOptions(
      currentVisualized,
      visualizedOptions
    );
    currentLabelAnchors = update(lastViewState);
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

    currentLabelAnchors = update(lastViewState);
    return currentLabelAnchors;
  };

  const setInteractive = (nextInteractive: boolean) => {
    interactive = nextInteractive;
    if (!dragMode) {
      canvas.style.cursor = POINTER_CURSOR.IDLE;
    }
  };

  // --- Dispose ---
  const dispose = () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);

    renderer.dispose();
    hemisphereSurface.dispose();
    maxPitchRing.dispose();
    altitude.dispose();
    angleCues.dispose();
    worldAxes.dispose();
    cameraView.dispose();
  };

  return {
    update,
    resize,
    setOverview,
    setVisualized,
    setDisplay,
    setInteractive,
    readLabelAnchors: () => currentLabelAnchors,
    dispose,
  };
};
