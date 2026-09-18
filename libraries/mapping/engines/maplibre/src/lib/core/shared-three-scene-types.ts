import type * as THREE from "three";
import type { CustomLayerInterface, Map as MaplibreMap } from "maplibre-gl";
import type { SceneAccumulationOptions } from "@carma-mapping/engines/three/primitives/rendering";
import type { TileCameraSnapshot, TileCameraView } from "./tile-camera-demand";

/**
 * The local east/up/south frame at the view anchor, on the ellipsoid.
 *
 * The shared scene is a single Mercator tangent plane at its origin, so
 * anything that must stay true to the ellipsoid far from that origin mounts on
 * this frame instead: ECEF tilesets, and the sun and the shadow pages that
 * light them. It is the same anchor the view-state model keeps as its orbit
 * reference, derived here because the engine layer cannot depend on that
 * model. The frame moves only once the current view would show more than half
 * a pixel of error from keeping it (`localFrameErrorPixels` in the layer), and
 * `revision` changes with every move.
 *
 * Everything mounted on the frame lives in the layer's local-frame group and
 * is expressed in the reference fit, the frame's first fit after attach. A
 * move never touches that content: the group's matrix becomes
 * `referenceToCurrent`, the affine from the reference placement to the current
 * one, and content, light and shadows move together, so a refit cancels out
 * of every shadow. Decision: engines/maplibre/README.md#local-frame-for-ecef-tilesets-sun-and-sky.
 */
export type SharedThreeSceneLocalFrame = Readonly<{
  /** [longitude, latitude] in degrees, at ellipsoidal height 0. */
  lngLat: readonly [number, number];
  revision: number;
  /**
   * Root-scale affine from the tangent plane at `lngLat` into the scene
   * (`getCameraLocalMercatorFit` from the scene origin). Pure rotation for
   * directions lives in `sceneFromLocalRotation`.
   */
  sceneFromLocal: THREE.Matrix4;
  sceneFromLocalRotation: THREE.Matrix4;
  /** Anchor of the reference fit that frame-mounted content is expressed in. */
  referenceLngLat: readonly [number, number];
  sceneFromLocalReference: THREE.Matrix4;
  /** Matrix of the local-frame group: reference placement to current one. */
  referenceToCurrent: THREE.Matrix4;
  currentToReference: THREE.Matrix4;
}>;

export interface SharedThreeSceneFrame {
  map: MaplibreMap;
  renderCamera: THREE.Camera;
  lodCamera: THREE.PerspectiveCamera;
  lookTarget: THREE.Vector3;
  viewport: THREE.Vector2;
  localFrame: SharedThreeSceneLocalFrame;
  /** Additional world-space views share every runtime's existing tile pool. */
  tileCameraViews?: readonly TileCameraSnapshot[];
}

export type SharedThreeSceneShadowView = Readonly<{
  camera: THREE.Camera;
  /**
   * Unit direction to the sun in ECEF. Caster membership depends on this and
   * not on how the light camera sits in the scene, so runtimes key their
   * selection on it and a local-frame refit leaves their proofs untouched.
   */
  directionToSunECEF?: readonly [number, number, number];
  /** Scene-space ground receivers supplied to building-only caster runtimes. */
  terrainReceivers?: readonly SharedThreeSceneTileVolume[];
  casterAngularRadiusRadians?: number;
  shadowMapSize: Readonly<{
    width: number;
    height: number;
  }>;
}>;

export type SharedThreeSceneTileVolume = Readonly<{
  id: string;
  kind: string;
  sourceId?: string;
  geometricError?: number;
  /** Current physical-pixel error, not the configured final target. */
  errorPixels?: number;
  loadReason?: "viewport" | "shadow";
  /** Ephemeral Three payload identity, never part of a persistent cache key. */
  receiverObjectId?: number;
  minimum: readonly [number, number, number];
  maximum: readonly [number, number, number];
}>;

export type SharedThreeShadowRegionDiagnostics = Readonly<{
  sourceId: string;
  ready: boolean;
  errorPixels: number;
  visitedNodes: number;
  broadPhaseNodes: number;
  rejectedPrismNodes: number;
  receiverPrismTested: boolean;
  selectedTileIds: readonly string[];
}>;

export interface SharedThreeSceneRuntime {
  id: string;
  originLngLat: [number, number];
  root: THREE.Object3D;
  /** This runtime already supplies the visible ground surface. */
  providesTerrain?: boolean;
  /**
   * The root sits in the layer's local-frame group and holds content in the
   * frame's reference fit; the group carries it to the current fit. Bounds
   * this runtime exchanges with the shadow scene are in that reference space.
   */
  mountsOnLocalFrame?: boolean;
  /** Project preceding MapLibre ground styling onto selected runtime materials. */
  receivesMapStyleTexture?: boolean | ((material: THREE.Material) => boolean);
  /**
   * How the projected style meets the receiver's own color: `replace` paints
   * the captured pass as the surface color (bare terrain), `overlay`
   * composites it by alpha over the receiver's own texture (a textured mesh
   * that only takes draped labels).
   */
  mapStyleProjectionBlend?: MapStyleProjectionBlend;
  /** Changes whenever streamed content replaces or adds render materials. */
  mapStyleProjectionVersion?: () => number;
  /** Whether terrain-supplying content is ready to replace fallback terrain. */
  hasRenderableContent?: () => boolean;
  updatePriority?: number;
  onAdd?: (map: MaplibreMap) => void;
  update: (frame: SharedThreeSceneFrame) => void;
  setShadowSimulationStyle?: (
    style: SharedThreeSceneShadowStyle | null
  ) => void;
  setShadowView?: (view: SharedThreeSceneShadowView | null) => void;
  /** Tiled presentation opts in before rendering; mono/shadow-off disables it. */
  setShadowStagePresentationGate?: (enabled: boolean) => void;
  /** Current receiver IDs fully drawn with hard or soft shadows, not merely loaded. */
  acknowledgeShadowStage?: (receiverIds: readonly string[]) => void;
  /** Requested screen-space error in pixels; lower loads finer tiles. */
  setErrorTarget?: (errorTarget: number) => void;
  setCacheBudget?: (bytes?: number) => void;
  /** World-space elevation span of loaded content intersecting this camera. */
  getViewElevationRange?: (
    camera: THREE.Camera
  ) => readonly [minimum: number, maximum: number] | null;
  /** World-space bounds of active tiles used for coverage and diagnostics. */
  getActiveTileVolumes?: () => readonly SharedThreeSceneTileVolume[];
  /** Show runtime-owned tile bounds and identifiers for diagnostics. */
  setTileBoundsVisible?: (visible: boolean) => void;
  /** Outstanding work required before a fixed-state render can converge. */
  getRequestDemand?: () => number;
  /** Optional zoom-ahead work: one shared pool, spare capacity only, abortable.
   * The camera is a cropped focus view; levels are relative to normal target LOD. */
  prefetchZoom?: (
    request: Readonly<{
      camera: TileCameraSnapshot;
      lngLat: readonly [number, number];
      levels: 1 | 2;
    }>,
    signal: AbortSignal
  ) => Promise<void>;
  /** Future frustum, excluded from visible coverage/shadow demand. Refresh within
   * validForMs (default 250 ms); null cancels this source only. */
  setPrefetchCameraView?: (
    view: TileCameraSnapshot | null,
    id: string,
    validForMs?: number
  ) => void;
  getMotionPrefetchStats?: () => Readonly<{
    stability: number;
    stableMs: number;
    latencyMs: number;
    leadMs: number;
    requested: number;
    completed: number;
    cancelled: number;
    pending: number;
    views: number;
  }>;
  /** Visible content takes priority over optional sun-disc refinement. */
  isMainViewReady?: () => boolean;
  /** Complete observer coverage at the initial progressive error, not final LOD. */
  isBaseViewReady?: () => boolean;
  /** Whether this provider's selected target-LOD dependencies in a world region
   * are published. Unrelated downloads must not block corridor refinement. */
  isShadowRegionReady?: (
    bounds: THREE.Box3,
    errorPixels?: number,
    receiverBounds?: THREE.Box3
  ) => boolean;
  /** Stable source/payload/cut identity, null until this exact region is ready. */
  getShadowRegionRevision?: (
    bounds: THREE.Box3,
    errorPixels?: number,
    receiverBounds?: THREE.Box3
  ) => string | null;
  /** Memoized with regional readiness; no separate traversal per debug draw. */
  getShadowRegionDiagnostics?: (
    bounds: THREE.Box3,
    errorPixels?: number,
    receiverBounds?: THREE.Box3
  ) => SharedThreeShadowRegionDiagnostics | null;
  dispose: () => void;
}

export type SharedThreeSceneShadowStyle = Readonly<{
  fullOpacity: boolean;
  uniformColor: string | null;
  /** 0 keeps the source texture, 1 shows only uniformColor. */
  uniformColorMix?: number;
  /** 0 removes all source-texture saturation, 1 preserves it. */
  textureSaturation?: number;
  textureColorCorrection?: boolean;
}>;

export type SharedSceneAccumulationController = {
  /** An independently converging scene strategy may own its accumulation.
   * The host still owns native pixel size, style registration and the shared
   * framebuffer depth range. A null result means pending/paused, never mono.
   * Do not include the global terrain epoch in viewKey: spatial strategies
   * invalidate affected receivers using their own caster dependencies.
   */
  renderProgressive?: (
    camera: THREE.Camera,
    frame: Readonly<{
      width: number;
      height: number;
      viewKey: string;
      styleEpoch: number;
      active: boolean;
    }>
  ) => Readonly<{
    progress: number;
    settled: boolean;
    needsRepaint: boolean;
    retryAfterMs?: number;
  }> | null;
  /** Changes whenever the shadow/lighting state the rounds sample changed. */
  epoch: () => number;
  /** Changes only when an already displayed result is visually obsolete. */
  visualEpoch: () => number;
  /** Whether accumulating is worthwhile right now (soft sun, camera at rest). */
  active: () => boolean;
  /** Sampling is queued but waiting for terrain, motion or content settling. */
  pending?: () => boolean;
  /** Whether a settled result may cover a temporary content-loading gap. */
  retainSettledFrame: () => boolean;
  /** Re-aim the scene's lights for the given accumulation round. */
  prepareRound: (round: number) => void;
  /** Restore the non-jittered scene state before drawing the visible frame. */
  finishRound?: () => void;
  /** One transition after a complete current-camera result, for cancellable
   * background work. Must schedule work, never synchronously compute here. */
  onSettled?: () => void;
  /** Optional scene strategy, inside the existing drape/HDR/depth-range chain.
   * null selects the centre-sun preview used during motion or point lighting.
   * Return false to use the ordinary single-pass scene renderer.
   */
  renderScene?: (camera: THREE.Camera, round: number | null) => boolean;
  rounds: number;
  /** Effective buffer options may change without replacing the controller. */
  readonly options?: SceneAccumulationOptions;
  /** Maximum offscreen pixels used by each accumulation target. */
  maxRenderTargetPixels?: number;
};

export interface SharedThreeSceneLayer extends CustomLayerInterface {
  /** Suspend shared scene updates and drawing without releasing resident data. */
  setRenderingPaused: (paused: boolean) => void;
  isRenderingPaused: () => boolean;
  /** Upsert by ID; mutable camera poses are sampled before each scene update. */
  setTileCameraView: (view: TileCameraView) => void;
  /** Remove only this source's demand, never another camera's residency. */
  removeTileCameraView: (id: string) => void;
  /** Sample a known trajectory ahead without moving its live camera. Call during
   * animation updates; requests expire unless refreshed. No receiver is added.
   * Use createCameraFlightPlayer().sampleAhead() for Three camera paths. */
  requestTileCameraAhead: (
    viewAt: (aheadMs: number) => TileCameraView,
    aheadMs: number,
    validForMs?: number
  ) => string;
  removePrefetchCameraView: (id: string) => void;
  addRuntime: (runtime: SharedThreeSceneRuntime) => void;
  removeRuntime: (runtimeId: string) => void;
  hasRuntime: (runtimeId: string) => boolean;
  getScene: () => THREE.Scene;
  /** Runtimes currently attached to the shared scene, including local terrain. */
  getRuntimes: () => readonly SharedThreeSceneRuntime[];
  /** The current local frame; null until the layer is on a map. */
  getLocalFrame: () => SharedThreeSceneLocalFrame | null;
  /** Group carrying frame-mounted content; its matrix is `referenceToCurrent`. */
  getLocalFrameGroup: () => THREE.Group;
  /** Renderer owned by the mounted MapLibre custom layer, if it is active. */
  getRenderer: () => THREE.WebGLRenderer | null;
  /** Draw embedded camera regions after MapLibre has finished its frame. */
  addScreenRenderPass: (render: () => void) => () => void;
  requestScreenRender: () => void;
  /** Optional synchronous GPU work outside a map frame; false means unsupported. */
  runIdleRender?: (render: () => void) => boolean;
  /**
   * Progressive refinement at rest: while the controller reports itself
   * active and its epoch and the camera hold still, the layer renders one
   * jittered round per frame into an accumulation buffer and composites the
   * running average; after the configured rounds, frames become a blit.
   * Pass null to return to direct rendering.
   */
  setAccumulationController: (
    controller: SharedSceneAccumulationController | null
  ) => void;
  /** Enable capture and projection of the preceding MapLibre style pass. */
  setMapStyleProjectionVisible?: (visible: boolean) => void;
  /** Diagnostics: what the map-style projection did in the last frame. */
  getMapStyleProjectionState?: () => MapStyleProjectionState;
  projectLngLatToScene: (
    lngLat: [number, number],
    altitudeMeters?: number,
    target?: THREE.Vector3
  ) => THREE.Vector3 | null;
  /** Inverse of projectLngLatToScene for a shared-scene world position. */
  projectSceneToLngLat: (
    position: THREE.Vector3 | readonly [number, number, number]
  ) => [longitude: number, latitude: number] | null;
  /** Detach the custom layer without destroying runtimes preserved across HMR. */
  detach: () => void;
  dispose: () => void;
}

export interface SharedThreeSceneLayerOptions {
  ambientLightIntensity?: number;
}

export type MapStyleProjectionUniforms = Readonly<{
  texture: { value: THREE.Texture | null };
  sceneToClip: { value: THREE.Matrix4 };
  enabled: { value: number };
  /** MapLibre's packed terrain depth of the same frame, for overlay occlusion. */
  depthTexture: { value: THREE.Texture | null };
  depthEnabled: { value: number };
  /** Near and far plane of the MapLibre camera that wrote that depth. */
  depthNearFar: { value: THREE.Vector2 };
  texelSize: { value: THREE.Vector2 };
}>;

export type MapStyleProjectionBlend = "replace" | "overlay";

export type MapStyleProjectionState = Readonly<{
  visible: boolean;
  enabled: boolean;
  depthEnabled: boolean;
  depthNearFar: readonly [number, number];
  receivers: Readonly<Record<string, boolean>>;
  frames: number;
  captures: number;
  captureReuses: number;
}>;
