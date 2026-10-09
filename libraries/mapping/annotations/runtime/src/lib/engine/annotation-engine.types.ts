import type { Matrix4, Vector3 } from "three";
import type { AnnotationGeographicCoordinate } from "@carma-mapping/annotations/core";
import type { CssPixelPosition } from "@carma-units";

/**
 * Engine-neutral boundary between the annotations runtime and a mapping
 * engine (cismet/carma#680). The runtime owns composition, store, tools and
 * overlay orchestration; an engine adapter owns projection, picking, pointer
 * tracking, frame subscriptions, render requests, fly-to and the scene
 * primitives the runtime draws with. World positions are `THREE.Vector3` in
 * ECEF metres (EPSG:4978), screen positions are CSS pixels relative to the
 * engine canvas.
 *
 * Adapters: `@carma-mapping/annotations/cesium` (the behaviour the runtime
 * had before the split) and `@carma-mapping/annotations/maplibre` (the
 * MapLibre host drawing through the shared Three.js scene).
 */

export const ANNOTATION_ENGINE_KINDS = {
  CESIUM: "cesium",
  MAPLIBRE_THREE: "maplibre-three",
} as const;

export type AnnotationEngineKind =
  (typeof ANNOTATION_ENGINE_KINDS)[keyof typeof ANNOTATION_ENGINE_KINDS];

export type AnnotationScreenPosition = { x: number; y: number };
export type AnnotationClientPosition = { x: number; y: number };

export type AnnotationPickRay = {
  origin: Vector3;
  direction: Vector3;
};

/** Port of the Cesium `ResolvedSurfacePick`. */
export type AnnotationSurfacePick = {
  /** First visible surface under the pointer: mesh, tileset, model or ground. */
  surfacePositionECEF: Vector3 | null;
  /** Ground under the pointer, ignoring content above it. */
  globePositionECEF: Vector3 | null;
};

export type AnnotationSurfacePickOptions = {
  resolveGlobePosition?: boolean;
  /**
   * Also hide the scene lines registered as drag-sample occluders (the edges
   * of the node being dragged) while sampling, so a gizmo drag never lands
   * on the geometry it moves.
   */
  excludeDragSampleOccluders?: boolean;
};

/** Port of the Cesium `CesiumSceneProjectionState`. */
export type AnnotationProjectionState = {
  screenPosition: CssPixelPosition | null;
  isInViewport: boolean;
  isHidden: boolean;
  isOccluded: boolean;
};

export type AnnotationProjectionOptions = {
  shouldTestVisibility?: boolean;
  shouldTestOcclusion?: boolean;
  viewportPaddingHorizontal?: number;
  viewportPaddingVertical?: number;
  occlusionToleranceMeters?: number;
};

/** Opaque per-frame view signature; equal snapshots mean overlays may stay. */
export type AnnotationProjectionSnapshot = {
  viewportWidth: number;
  viewportHeight: number;
  viewKey: string;
};

export const ANNOTATION_RING_MATERIAL_PRESETS = {
  COLOR: "color",
  CHROME_MIRROR: "chrome-mirror",
  FROSTED_GLASS: "frosted-glass",
} as const;

export type AnnotationRingMaterialPreset =
  (typeof ANNOTATION_RING_MATERIAL_PRESETS)[keyof typeof ANNOTATION_RING_MATERIAL_PRESETS];

export type AnnotationSceneRingOptions = {
  id: string;
  /** Outer radius in scene metres of the unit ring before `modelMatrix`. */
  radius: number;
  innerRadius?: number;
  color: string;
  opacity?: number;
  materialPreset?: AnnotationRingMaterialPreset;
  segments?: number;
  modelMatrix: Matrix4;
};

export type AnnotationSceneDiscOptions = Omit<
  AnnotationSceneRingOptions,
  "innerRadius"
>;

/** A ring or disc primitive placed by a model matrix (point-query cursor, guides). */
export type AnnotationScenePrimitiveHandle = {
  setModelMatrix: (modelMatrix: Matrix4) => void;
  setVisible: (visible: boolean) => void;
  destroy: () => void;
};

export type AnnotationSceneLineStyle = {
  color: string;
  width: number;
  /** Draw the depth-occluded part of the line as a dashed trace on top. */
  occludedDashed?: boolean;
  /**
   * Mark the line like a ruler: ticks at the engine's metric pitch (the
   * 1-2-5 series of the area fills) counted from the first vertex, longer
   * ticks and knots at the major beats, clear of the node and midpoint
   * handles. Tools set it while a measurement is drafted or selected.
   */
  ruler?: boolean;
};

export type AnnotationSceneLineOptions = AnnotationSceneLineStyle & {
  id: string;
  positions?: readonly Vector3[];
  visible?: boolean;
};

export type AnnotationSceneLineHandle = {
  readonly id: string;
  setPositions: (positions: readonly Vector3[]) => void;
  setStyle: (style: AnnotationSceneLineStyle) => void;
  setVisible: (visible: boolean) => void;
  destroy: () => void;
};

/**
 * One batch of scene lines; the adapter keeps them out of surface picks and
 * drag samples by itself.
 */
export type AnnotationSceneLineCollection = {
  addLine: (options: AnnotationSceneLineOptions) => AnnotationSceneLineHandle;
  destroy: () => void;
};

export type AnnotationSceneLineCollectionOptions = {
  /** Lines the gizmo must not sample while dragging a node along a surface. */
  excludeFromDragSamples?: boolean;
};

export const ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT = {
  GROUND: "ground",
  COPLANAR: "coplanar",
} as const;

export type AnnotationScenePolygonFillPlacement =
  (typeof ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT)[keyof typeof ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT];

export type AnnotationScenePolygonFill = {
  id: string;
  positionsECEF: readonly Vector3[];
  fill: string;
  placement: AnnotationScenePolygonFillPlacement;
  selected?: boolean;
};

export type AnnotationScenePolygonFillsHandle = {
  setPolygonFills: (polygonFills: readonly AnnotationScenePolygonFill[]) => void;
  clear: () => void;
  destroy: () => void;
};

export type AnnotationScenePolygonFillsOptions = {
  allowPicking?: boolean;
};

export const ANNOTATION_POINT_QUERY_CLICK_STRATEGY = {
  IMMEDIATE: "immediate",
  DELAYED_LINE_FINISH: "delayed-line-finish",
} as const;

export type AnnotationPointQueryClickStrategy =
  (typeof ANNOTATION_POINT_QUERY_CLICK_STRATEGY)[keyof typeof ANNOTATION_POINT_QUERY_CLICK_STRATEGY];

export const ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS = {
  SHIFT: "shift",
} as const;

export type AnnotationEnginePointQueryInputModifier =
  (typeof ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS)[keyof typeof ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS];

export type AnnotationPointQueryCreatePayload = {
  screenPosition: AnnotationScreenPosition;
  pickedPositionECEF: Vector3;
  globePositionECEF: Vector3 | null;
  inputModifier?: AnnotationEnginePointQueryInputModifier;
};

export type AnnotationPointQueryConfig = {
  clickDelayMs?: number;
  doubleClickDistancePx?: number;
  cameraMovePickIntervalMs?: number;
  surfaceMissLimit?: number;
  normalSampleIntervalMs?: number;
  normalSampleDistancePx?: number;
  debugLog?: boolean;
};

/** Port of the Cesium `useCesiumPointQuery` options. */
export type AnnotationPointQueryOptions = {
  enabled?: boolean;
  hideCursorWhileEnabled?: boolean;
  clickStrategy?: AnnotationPointQueryClickStrategy;
  config?: AnnotationPointQueryConfig;
  inputModifiers?: readonly AnnotationEnginePointQueryInputModifier[];
  onBeforePointCreate?: (
    payload: AnnotationPointQueryCreatePayload
  ) => boolean;
  onPointCreate?: (payload: AnnotationPointQueryCreatePayload) => void;
  onLineFinish?: () => void;
  onPointerMove?: (
    positionECEF: Vector3 | null,
    screenPosition: AnnotationScreenPosition,
    surfaceNormalECEF?: Vector3 | null,
    options?: { inputModifier?: AnnotationEnginePointQueryInputModifier }
  ) => void;
  onScreenPositionChange?: (
    screenPosition: AnnotationScreenPosition | null
  ) => void;
};

export type AnnotationGizmoPoint = {
  id: string;
  geometryECEF: Vector3;
};

export type AnnotationGizmoAxisCandidate = {
  id: string;
  direction: Vector3;
  color?: string;
  title?: string | null;
};

export type AnnotationGizmoLabels = {
  verticalAxis: string;
  eastAxis: string;
  northAxis: string;
  genericAxis: string;
  outerDisc: string;
  surfacePlane: string;
  freePlane: string;
};

export type AnnotationGizmoRotationDelta = {
  pointId: string;
  axisOrigin: Vector3;
  rotationNormal: Vector3;
  deltaAngleRad: number;
  accumulatedAngleRad: number;
};

export const ANNOTATION_GIZMO_DISC_SCALING_MODES = {
  SCREEN: "screen",
  WORLD: "world",
} as const;

export type AnnotationGizmoDiscScalingMode =
  (typeof ANNOTATION_GIZMO_DISC_SCALING_MODES)[keyof typeof ANNOTATION_GIZMO_DISC_SCALING_MODES];

/** Port of the Cesium `UseCesiumPointMoveGizmoOptions`. */
export type AnnotationPointMoveGizmoOptions = {
  points: AnnotationGizmoPoint[];
  labels: AnnotationGizmoLabels;
  movePointId?: string | null;
  axisDirection?: Vector3 | null;
  discPlaneNormal?: Vector3 | null;
  axisTitle?: string | null;
  preferredAxisId?: string | null;
  axisCandidates?: AnnotationGizmoAxisCandidate[] | null;
  showRotationHandle?: boolean;
  showDisc?: boolean;
  discScalingMode?: AnnotationGizmoDiscScalingMode;
  discOutlineScreenPixelRadius?: number;
  discResizeWorldRadiusToScreenTarget?: boolean;
  discQuantizeWorldRadius?: boolean;
  freezeDiscScaleDuringDrag?: boolean;
  discResizeStepFactor?: number;
  showDiscRadiusLabel?: boolean;
  axisWidthPx?: number;
  outlineWidthPx?: number;
  arrowActiveEdgePx?: number;
  arrowInactiveEdgePx?: number;
  snapPlaneDragToGround?: boolean;
  excludeRegisteredDragSampleOccluders?: boolean;
  radius: number;
  onPointPositionChange?: (
    pointId: string,
    nextPosition: Vector3,
    screenPosition?: AnnotationScreenPosition
  ) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onAxisDirectionChange?: (
    axisDirection: Vector3,
    axisTitle?: string | null
  ) => void;
  onRotationDelta?: (delta: AnnotationGizmoRotationDelta) => void;
  onExit?: () => void;
};

export type AnnotationFlyToOptions = {
  minRadiusMeters: number;
  paddingFactor: number;
};

export type AnnotationEngineCapabilities = {
  /**
   * The engine draws the depth-occluded part of a scene line itself (dashed,
   * on top), so the runtime skips its DOM overlay trace for those edges.
   */
  occludedLinesInScene: boolean;
};

/**
 * React hooks an adapter contributes. An engine instance is fixed for the
 * lifetime of its `AnnotationsProvider`; the provider keys its hosts by
 * `engine.kind`, so hook order never changes within a mounted host.
 */
export type AnnotationEngineHooks = {
  usePointQuery: (options: AnnotationPointQueryOptions) => void;
  usePointMoveGizmo: (options: AnnotationPointMoveGizmoOptions) => void;
};

export type AnnotationEnginePointer = {
  /** Start tracking; returns the release. Reference counted by the adapter. */
  register: () => () => void;
  getScreenPosition: () => AnnotationScreenPosition | null;
  getClientPosition: () => AnnotationClientPosition | null;
  subscribeClientPosition: (
    listener: (clientPosition: AnnotationClientPosition | null) => void
  ) => () => void;
  /** Forget the last pointer position, e.g. after the pointer left the canvas. */
  clear: () => void;
};

export type AnnotationEngine = {
  readonly kind: AnnotationEngineKind;
  readonly capabilities: AnnotationEngineCapabilities;
  readonly canvas: HTMLCanvasElement;
  /** Element the DOM overlays mount next to; the canvas parent by default. */
  getOverlayContainer: () => HTMLElement | null;
  isDestroyed: () => boolean;
  requestRender: () => void;
  subscribePreRender: (listener: () => void) => () => void;
  subscribePostRender: (listener: () => void) => () => void;
  subscribeCameraMove: (listeners: {
    onMoveStart?: () => void;
    onMoveEnd?: () => void;
  }) => () => void;
  /** Changes with every rendered frame; null while unavailable. */
  getFrameKey: () => number | null;
  captureProjectionSnapshot: () => AnnotationProjectionSnapshot | null;
  getCameraPositionECEF: (out?: Vector3) => Vector3 | null;
  getCameraPitchRad: () => number;
  /** CSS pixels relative to the canvas, null behind the camera. */
  worldToScreen: (
    positionECEF: Vector3,
    out?: { x: number; y: number }
  ) => AnnotationScreenPosition | null;
  projectPoint: (
    positionECEF: Vector3,
    options?: AnnotationProjectionOptions
  ) => AnnotationProjectionState;
  getPickRay: (screenPosition: AnnotationScreenPosition) => AnnotationPickRay | null;
  getScreenPixelsPerMeterAt: (positionECEF: Vector3) => number;
  resolveSurfacePick: (
    screenPosition: AnnotationScreenPosition,
    options?: AnnotationSurfacePickOptions
  ) => AnnotationSurfacePick;
  sampleSurfaceNormalAt: (
    screenPosition: AnnotationScreenPosition,
    centerECEF: Vector3
  ) => Vector3 | null;
  /** Ids of annotation scene primitives under the pointer, nearest first. */
  pickAnnotationIdsAt: (
    screenPosition: AnnotationScreenPosition
  ) => readonly string[];
  flyToPoints: (
    pointsECEF: readonly Vector3[],
    options: AnnotationFlyToOptions
  ) => void;
  readonly pointer: AnnotationEnginePointer;
  createLineCollection: (
    options?: AnnotationSceneLineCollectionOptions
  ) => AnnotationSceneLineCollection;
  createRing: (options: AnnotationSceneRingOptions) => AnnotationScenePrimitiveHandle;
  createDisc: (options: AnnotationSceneDiscOptions) => AnnotationScenePrimitiveHandle;
  createPolygonFills: (
    options?: AnnotationScenePolygonFillsOptions
  ) => AnnotationScenePolygonFillsHandle;
  readonly hooks: AnnotationEngineHooks;
  /** Release adapter-owned resources once the provider unmounts. */
  dispose: () => void;
};

export type AnnotationEngineCoordinateSample = {
  coordinate: AnnotationGeographicCoordinate | null;
  pointECEF: Vector3 | null;
};
