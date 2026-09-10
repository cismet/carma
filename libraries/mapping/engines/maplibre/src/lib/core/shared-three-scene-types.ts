import type * as THREE from "three";
import type { CustomLayerInterface, Map as MaplibreMap } from "maplibre-gl";
import type { SceneAccumulationOptions } from "@carma-mapping/engines/three/primitives/rendering";

export interface SharedThreeSceneFrame {
  map: MaplibreMap;
  renderCamera: THREE.Camera;
  lodCamera: THREE.PerspectiveCamera;
  lookTarget: THREE.Vector3;
  viewport: THREE.Vector2;
}

export type SharedThreeSceneShadowView = Readonly<{
  camera: THREE.Camera;
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
  addRuntime: (runtime: SharedThreeSceneRuntime) => void;
  removeRuntime: (runtimeId: string) => void;
  hasRuntime: (runtimeId: string) => boolean;
  getScene: () => THREE.Scene;
  /** Runtimes currently attached to the shared scene, including local terrain. */
  getRuntimes: () => readonly SharedThreeSceneRuntime[];
  /** Renderer owned by the mounted MapLibre custom layer, if it is active. */
  getRenderer: () => THREE.WebGLRenderer | null;
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
