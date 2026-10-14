import type { Matrix4, Vector3 } from "three";
import type { EcefCameraPose } from "@carma-commons/camera/model";
import type {
  PointMoveGizmoAxisCandidate,
  PointMoveGizmoLabels,
  PointMoveGizmoOptions,
  PointMoveGizmoPoint,
  PointMoveGizmoRotationDelta,
} from "@carma-mapping/gizmo/core";
import type { CssPixelPosition, CssPixels, Ratio } from "@carma-units";

import type {
  AnnotationEngineKind,
  AnnotationRingMaterialPreset,
  AnnotationScenePolygonFillPlacement,
  AnnotationPointQueryClickStrategy,
  AnnotationEnginePointQueryInputModifier,
} from "./annotation-engine-constants";

/**
 * Engine-neutral boundary between the annotations runtime and a mapping engine
 * adapter (cesium, maplibre): the adapter owns projection, picking, pointer,
 * frames, fly-to and scene primitives. World positions are ECEF metres
 * (`THREE.Vector3`), screen positions CSS pixels relative to the canvas.
 */

export type AnnotationScreenPosition = { x: number; y: number };
export type AnnotationClientPosition = { x: number; y: number };

export type AnnotationPickRay = {
  origin: Vector3;
  direction: Vector3;
};

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
  /**
   * Hidden where meshes or terrain are nearer, drawn with the fills below the
   * scene lines. Default: drawn on top of everything.
   */
  occludable?: boolean;
};

export type AnnotationSceneDiscOptions = Omit<
  AnnotationSceneRingOptions,
  "innerRadius"
>;

/**
 * A solid cone: the unit cone (base radius 1 around the origin in the xy
 * plane, apex at z = 1) placed by `modelMatrix`. Visible parts draw filled
 * with an outline along the silhouette and the base edge; where meshes or
 * terrain are nearer only that outline shows, dotted like an occluded line.
 */
export type AnnotationSceneConeOptions = {
  id: string;
  color: string;
  opacity?: number;
  outlineColor: string;
  /** CSS pixels. */
  outlineWidth?: number;
  segments?: number;
  modelMatrix: Matrix4;
};

/**
 * A marker that keeps its screen size: a disc of `sizePx` facing the camera
 * (a node marker), or a rounded bar `sizePx` thick when `barLengthPx` is set
 * (an insert tick). Drawn whole over the scene like a DOM marker, without
 * depth test or depth write: filled with the outline inside `sizePx`
 * (`box-sizing: border-box`), in the occluded look when `occluded` is set.
 * Sizes are CSS pixels.
 */
export type AnnotationSceneMarkerStyle = {
  sizePx: number;
  fill: string;
  outline: string;
  outlineWidthPx: number;
  /** A bar of this length lying across the screen direction of the placement's `acrossECEF`. */
  barLengthPx?: number;
  /** Scales the whole marker (the hover look). Default 1. */
  scale?: number;
  /** A band around the marker: hard like a spread box shadow, or fading out when `soft`. */
  ring?: { widthPx: number; color: string; soft?: boolean };
  /**
   * The caller's occlusion verdict for the marker's anchor: the outline turns
   * dotted (a marker without outline dots its rim), like an occluded DOM
   * marker. Default false.
   */
  occluded?: boolean;
  /** Opacity of the whole marker, 0 to 1. Default 1. */
  opacity?: number;
};

export type AnnotationSceneMarkerOptions = AnnotationSceneMarkerStyle & {
  id: string;
  positionECEF: Vector3;
  acrossECEF?: Vector3;
  visible?: boolean;
};

export type AnnotationSceneMarkerHandle = {
  readonly id: string;
  /** `acrossECEF`: the direction a bar lies across on screen, e.g. its edge. */
  setPosition: (positionECEF: Vector3, acrossECEF?: Vector3) => void;
  setStyle: (style: AnnotationSceneMarkerStyle) => void;
  setVisible: (visible: boolean) => void;
  destroy: () => void;
};

/** One batch of markers; never depth-tested, a surface pick, drag sample or depth occluder. */
export type AnnotationSceneMarkerCollection = {
  addMarker: (
    options: AnnotationSceneMarkerOptions
  ) => AnnotationSceneMarkerHandle;
  destroy: () => void;
};

/** A ring, disc or cone primitive placed by a model matrix (point-query cursor, guides, gizmo). */
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
   * Draw the whole line over the scene without depth testing, like a
   * connector to a screen-space label; `occludedDashed` does not apply.
   */
  overlay?: boolean;
  /** Explicit opt-in to the same darkening halo for a screen-space reticle. */
  overlayHalo?: boolean;
  /** Dash the whole line, lengths in CSS pixels. */
  dash?: { dashPx: number; gapPx: number };
  /** Opacity of the whole line, 0 to 1. Default 1. */
  opacity?: number;
  /**
   * Ruler ticks at the engine's 1-2-5 metric pitch from the first vertex,
   * longer with knots at major beats, clear of the handles. Set while a
   * measurement is drafted or selected.
   */
  ruler?: boolean;
  /** Metres measured before the first vertex, so a chain's ruler counts on. */
  rulerStartMeters?: number;
  /** Soft darkening halo beside the line where the engine can. Default true. */
  halo?: boolean;
};

export type AnnotationSceneLineOptions = AnnotationSceneLineStyle & {
  id: string;
  positions?: readonly Vector3[];
  /** Disjoint endpoint pairs, retaining each segment's caps and dash phase. */
  segmentPairs?: boolean;
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

export type AnnotationScenePolygonFill = {
  id: string;
  positionsECEF: readonly Vector3[];
  fill: string;
  placement: AnnotationScenePolygonFillPlacement;
  selected?: boolean;
};

export type AnnotationScenePolygonFillsHandle = {
  setPolygonFills: (
    polygonFills: readonly AnnotationScenePolygonFill[]
  ) => void;
  clear: () => void;
  destroy: () => void;
};

export type AnnotationScenePolygonFillsOptions = {
  allowPicking?: boolean;
};

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

export type AnnotationPointQueryOptions = {
  enabled?: boolean;
  hideCursorWhileEnabled?: boolean;
  clickStrategy?: AnnotationPointQueryClickStrategy;
  config?: AnnotationPointQueryConfig;
  inputModifiers?: readonly AnnotationEnginePointQueryInputModifier[];
  onBeforePointCreate?: (payload: AnnotationPointQueryCreatePayload) => boolean;
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

export type AnnotationGizmoPoint = PointMoveGizmoPoint<Vector3>;
export type AnnotationGizmoAxisCandidate = PointMoveGizmoAxisCandidate<Vector3>;
export type AnnotationGizmoLabels = PointMoveGizmoLabels;
export type AnnotationGizmoRotationDelta = PointMoveGizmoRotationDelta<Vector3>;

export type AnnotationDiscSizingOptions = Readonly<{
  targetScreenRadiusCssPx: CssPixels;
  minimumScreenRadiusCssPx: CssPixels;
  maximumViewportRadiusRatio: Ratio;
  sceneResizeFactor: Ratio;
  resizeHysteresisRatio: Ratio;
}>;

export type AnnotationPointMoveGizmoOptions = PointMoveGizmoOptions<Vector3> & {
  /** Shared Three query/edit policy; omitted keeps the existing engine defaults. */
  discSizing?: Partial<AnnotationDiscSizingOptions>;
  discCenterCircle?: { diameterCssPx: CssPixels; halo: boolean };
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
  /**
   * Occlusion verdicts are cheap enough to take every rendered frame (the
   * MapLibre engine reads them from the depth buffer with GPU queries), so
   * markers and labels need not freeze them while the camera moves.
   */
  occlusionPerFrame: boolean;
  /**
   * The point-query disc is scene content: depth-tested against meshes and
   * terrain with its hidden rim dotted, and a world size held while the
   * pointer moves (near and far show in perspective) that a view change
   * re-derives from the screen target. Without it the disc draws on top and
   * re-steps its size by the scale band.
   */
  pointQueryDiscInScene?: boolean;
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
  /** The camera as the last frame drew it; null while unavailable. */
  getCameraPose: () => EcefCameraPose | null;
  /** Jump the camera to the pose; false when the engine cannot place it. */
  setCameraPose: (pose: EcefCameraPose) => boolean;
  /** CSS pixels relative to the canvas, null behind the camera. */
  worldToScreen: (
    positionECEF: Vector3,
    out?: { x: number; y: number }
  ) => AnnotationScreenPosition | null;
  projectPoint: (
    positionECEF: Vector3,
    options?: AnnotationProjectionOptions
  ) => AnnotationProjectionState;
  getPickRay: (
    screenPosition: AnnotationScreenPosition
  ) => AnnotationPickRay | null;
  getScreenPixelsPerMeterAt: (positionECEF: Vector3) => number;
  /** Ground in the viewport centre, used only to size scene reference objects. */
  getViewportCenterGroundPosition?: () => Vector3 | null;
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
  createRing: (
    options: AnnotationSceneRingOptions
  ) => AnnotationScenePrimitiveHandle;
  createDisc: (
    options: AnnotationSceneDiscOptions
  ) => AnnotationScenePrimitiveHandle;
  /** Optional: without it the point-move gizmo keeps drawing in the DOM overlay. */
  createCone?: (
    options: AnnotationSceneConeOptions
  ) => AnnotationScenePrimitiveHandle;
  /**
   * Optional: node markers, insert ticks, the distance corner handle and the
   * label stems then draw in the scene, occluded by meshes and terrain, and
   * the overlay keeps only their invisible hit areas. Without it they stay
   * DOM overlays.
   */
  createMarkerCollection?: () => AnnotationSceneMarkerCollection;
  createPolygonFills: (
    options?: AnnotationScenePolygonFillsOptions
  ) => AnnotationScenePolygonFillsHandle;
  readonly hooks: AnnotationEngineHooks;
  /** Release adapter-owned resources once the provider unmounts. */
  dispose: () => void;
};
