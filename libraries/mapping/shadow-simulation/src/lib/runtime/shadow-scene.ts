import {
  usesMobileShadowBaseline,
  constrainMobileShadowTerrain,
  constrainMobileShadowRendering,
  MOBILE_MESH_CACHE_BYTES,
} from "../core/shadow-device-profile";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import { clamp } from "@carma-commons/math";
import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  getGenericThreeLayers,
  getSharedThreeSceneRuntimes,
  isSharedThreeTerrainLoading,
  MAP_STYLE_PROJECTION_BLEND,
  MAPLIBRE_EVENT,
  subscribeGenericThreeLayers,
  subscribeSharedThreeSceneContent,
  subscribeSharedThreeTerrainLoading,
  suppressMapLibreRegularStyleLayers,
  TILE_VOLUME_LOAD_REASON,
  TILES_MESH_ERROR_TARGET_DEFAULT_PIXELS,
} from "@carma-mapping/engines/maplibre";
import { buildRasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
  SharedThreeSceneShadowView,
  SharedThreeSceneTileVolume,
} from "@carma-mapping/engines/maplibre";

import {
  SHADOW_TERRAIN_QUALITY,
  type ShadowSceneOptions,
  type ShadowTerrainOptions,
} from "../contracts/shadow-simulation";
import type { SolarPosition } from "../core/solar-position";
import { getFrustumBoxIntersectionPoints } from "../core/frustum-box-intersection";
import {
  buildShadowReceiverCells,
  buildShadowReceiverNeighbourRing,
  getVisibleShadowReceiverCorners,
  nearestIdleTerrainLevel,
} from "../core/shadow-receiver-grid";
import type { ShadowReceiverCell } from "../core/shadow-page-plan";
import {
  DEFAULT_TERRAIN_ERROR_TARGET_PIXELS,
  SHADOW_QUALITY,
  DEFAULT_SHADOW_SURFACE_COLOR,
  resolveShadowRenderQuality,
  SHADOW_BUFFER_FORMAT,
  SHADOW_BUFFER_LAYOUT,
  SHADOW_QUALITY_PROFILES,
  SHADOW_SCENE_USER_DATA,
  type MeshErrorTargetPixels,
  type ShadowQualityMultiplier,
  type ShadowRenderQualityOptions,
} from "../core/shadow-types";
import {
  AtmosphericSunlightEvaluator,
  getAtmosphericInputValidationError,
  getAtmosphericSunlightSampleValidationError,
  rebaseAtmosphericSunlightSample,
  type AtmosphericSunlightSample,
  type AtmosphericSunlightOptions,
  type AtmosphericSkyReference,
} from "./atmospheric-sunlight";
import { ATMOSPHERIC_DISPLAY_EXPOSURE } from "./atmospheric-sky";
import { SUN_ANGULAR_RADIUS_RAD } from "../core/sun-disc-sampling";
import { ShadowTiledScene } from "./shadow-tiled-scene";
import { createShadowBootstrapPreview } from "./shadow-bootstrap-preview";
import {
  shadowSceneWorldBasis,
  shadowRegionQueryKey,
  shadowReceiverStageError,
  meshReceiverBiasLimitMeters,
  getPresentedShadowReceiverIds,
  getChangedShadowVolumeBounds,
} from "../core/shadow-corridor-host-state";
import { auditShadowCorridor } from "../core/shadow-corridor-audit";
import { createShadowIdleTerrainPrefetch } from "./shadow-idle-prefetch";
import { disposeShadowDepthPage } from "./shadow-depth-page-cache";
import {
  resolveShadowResourceLimits,
  resolveShadowAccumulationPixelBudget,
  resolveShadowDepthTexelBudget,
  getShadowRenderCapabilities,
  resolveSupportedShadowMsaa,
} from "./shadow-resource-limits";
import {
  clearShadowProjectionDebugSnapshot,
  hasShadowProjectionDebugListeners,
  subscribeShadowProjectionDebugDemand,
} from "./shadow-projection-debug-store";
import {
  createShadowFrameBudget,
  updateShadowFrameBudget,
} from "./shadow-frame-budget";

import {
  getViewElevationRange,
  getVisibleSceneElevationRange,
  getViewportElevationEnvelopePoints,
} from "../core/shadow-scene-view-geometry";
import { solarPositionToSceneDirection } from "../core/shadow-solar-direction";
import {
  applyAtmosphericSkyLightToBinding,
  applySolarPositionToBinding,
  buildShadowLightBinding,
  DEFAULT_SHADOW_CAMERA_OFFSET_METERS,
  disposeShadowLightBinding,
  SUN_VECTOR_VIEWPORT_LENGTH_FACTOR,
  updateBindingCenter,
} from "./shadow-light-binding";
import {
  acquireShadowMapLibreTerrain,
  SHADOW_MAP_STYLE_DRAPE_MODE,
  type ShadowMapStyleDrapeMode,
} from "./shadow-maplibre-terrain";
import { createShadowMapLibreLight } from "./shadow-maplibre-light";
import { createShadowFrameProjection } from "./shadow-frame-projection";
import { createShadowProjectionDebugPublisher } from "./shadow-projection-debug-publisher";
import {
  buildGenericThreeShadowBridge,
  makeSceneMeshesShadeable,
  type GenericThreeLayer,
  type GenericThreeShadowBridge,
  type ShadowBuildingAppearance,
} from "./shadow-scene-mesh";

export { solarPositionToSceneDirection } from "../core/shadow-solar-direction";
export { acquireShadowMapLibreTerrain } from "./shadow-maplibre-terrain";
export type {
  ShadowMapLibreTerrainRelease,
  ShadowMapStyleDrapeMode,
} from "./shadow-maplibre-terrain";
export type { ShadowBuildingAppearance } from "./shadow-scene-mesh";

const FALLBACK_SHADOW_AREA_METERS = 900;
const MESH_FINAL_SHADOW_BIAS_METERS = 0.01;
const MESH_COARSE_SHADOW_BIAS_LIMIT_METERS = 0.25;
const STREAMED_CONTENT_REFRESH_INTERVAL_MS = 1_000;
// Mesh contact policy is applied again to newly streamed receiver materials.
const MIN_VIEWPORT_SHADOW_AREA_METERS = 10;
const SHADOW_SIMULATION_TERRAIN_RUNTIME_ID = "shadow-simulation-raster-dem";
const SHADOW_CONTROLLER_UPDATE_PRIORITY = 200;
const LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS = 100;
const ANIMATION_RUNTIME_SHADOW_VIEW_INTERVAL_MS = 1_000;

export type ShadowSimulationScene = {
  updateTerrain: (terrain: ShadowTerrainOptions | undefined) => void;
  updateSolarPosition: (position: SolarPosition) => void;
  updateTerrainColor: (color: string) => void;
  updateMeshErrorTarget: (errorTarget: MeshErrorTargetPixels | null) => void;
  updateMeshCacheBudget: (bytes?: number) => void;
  updateBuildingAppearance: (appearance: ShadowBuildingAppearance) => void;
  updateShadowQuality: (quality: ShadowQualityMultiplier) => void;
  updateRenderQuality: (options: ShadowRenderQualityOptions) => void;
  updateSoftSunShadows: (enabled: boolean) => void;
  updateTimeAnimating: (animating: boolean) => void;
  refreshProjectionDebug: () => void;
  updateShadowIntensity: (intensity: number) => void;
  updateMapStyleContentVisibility: (visible: boolean) => void;
  updateMapStyleLabelOverlayVisibility: (visible: boolean) => void;
  updateMapStyleElevationVisibility: (lines: boolean, labels: boolean) => void;
  updateSunDebugVectorVisibility: (visible: boolean) => void;
  updateAtmosphericLutUsage: (options: AtmosphericSunlightOptions) => void;
  dispose: () => void;
};

export const buildShadowSimulationScene = (
  map: MaplibreMap,
  options: ShadowSceneOptions = {}
): ShadowSimulationScene => {
  const {
    shadowAreaMeters: configuredShadowAreaMeters,
    terrain: initialTerrain,
    mapLibreTerrain,
    terrainQuality = SHADOW_TERRAIN_QUALITY.MAX,
  } = options;
  const mobileBaseline = usesMobileShadowBaseline();
  let terrain = initialTerrain;
  const initialShadowAreaMeters =
    configuredShadowAreaMeters ?? FALLBACK_SHADOW_AREA_METERS;
  const previousLight = map.getLight();
  let mapStyleContentVisible = true;
  // A mesh that supplies the terrain carries its own texture: the basemap
  // pass then only contributes draped labels. Bare raster-DEM terrain, or no
  // terrain-providing content at all, keeps the opaque basemap drape.
  const getMapStyleDrapeMode = (): ShadowMapStyleDrapeMode => {
    const providers = getSharedThreeSceneRuntimes(map).filter(
      (runtime) => runtime.providesTerrain === true
    );
    return providers.length > 0 &&
      providers.every(
        (runtime) =>
          runtime.mapStyleProjectionBlend === MAP_STYLE_PROJECTION_BLEND.OVERLAY
      )
      ? SHADOW_MAP_STYLE_DRAPE_MODE.LABELS
      : SHADOW_MAP_STYLE_DRAPE_MODE.OPAQUE;
  };
  const releaseMapLibreTerrain = acquireShadowMapLibreTerrain(
    map,
    mapLibreTerrain ?? NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
    () => mapStyleContentVisible,
    getMapStyleDrapeMode,
    mobileBaseline ? SHADOW_TERRAIN_QUALITY.STANDARD : terrainQuality
  );
  const syncMeshLabelStyle = () => {
    sceneLease.setMeshLabelStyle(
      getMapStyleDrapeMode() === SHADOW_MAP_STYLE_DRAPE_MODE.LABELS
    );
  };
  let latestSolarPosition: SolarPosition | null = null;
  let latestBuildingAppearance: ShadowBuildingAppearance = {
    fullOpacity: true,
    uniformColor: null,
    uniformColorMix: 0,
    textureSaturation: 1,
    textureColorCorrection: true,
  };
  let latestShadowIntensity = 1;
  // null (Auto) leaves every tileset on its own target; the UI override sits
  // on top of it through setErrorTargetOverride.
  let latestMeshErrorTarget: MeshErrorTargetPixels | null = null;
  // The target the mesh is actually refining towards: the override, else the
  // mesh tileset's own (host) target.
  const meshErrorTargetPixels = () =>
    latestMeshErrorTarget ??
    getSharedThreeSceneRuntimes(map)
      .find((runtime) => runtime.providesTerrain === true)
      ?.getErrorTarget?.() ??
    TILES_MESH_ERROR_TARGET_DEFAULT_PIXELS;
  let latestMeshCacheBudget: number | undefined = mobileBaseline
    ? MOBILE_MESH_CACHE_BYTES
    : undefined;
  const meshCacheBudgets = new WeakMap<object, number | undefined>();
  let latestAtmosphericSunlight: AtmosphericSunlightSample | null = null;
  let atmosphericSunlightOptions: AtmosphericSunlightOptions = {
    useTransmittanceLut: true,
    useIrradianceLut: true,
  };
  let disposed = false;
  let timeAnimating = false;
  let mapInMotion = false;
  let restoreMapLibreStyleLayers: (() => void) | null = null;
  let terrainColor = new THREE.Color(
    terrain?.material?.color ?? DEFAULT_SHADOW_SURFACE_COLOR
  );
  const syncMapStyleContentVisibility = () => {
    if (mapStyleContentVisible) {
      restoreMapLibreStyleLayers?.();
      restoreMapLibreStyleLayers = null;
      sceneLease.layer.setMapStyleProjectionVisible?.(true);
      return;
    }
    sceneLease.layer.setMapStyleProjectionVisible?.(false);
    restoreMapLibreStyleLayers ??= suppressMapLibreRegularStyleLayers(map);
  };
  const sceneLease = acquireSharedThreeScene(map);
  /**
   * Sun and sky are evaluated at the shared scene's local frame, the ellipsoid
   * frame the ECEF tilesets mount on, so light and geometry tilt together.
   * Decision: engines/maplibre/README.md#local-frame-for-ecef-tilesets-sun-and-sky.
   * Before the layer is on the map the frame is unknown and the map centre
   * stands in; the first frame update replaces it.
   */
  const buildAtmosphereSkyReference = (
    lngLat: readonly [number, number],
    sceneFromLocal?: THREE.Matrix4
  ): AtmosphericSkyReference => ({
    observer: { longitude: lngLat[0], latitude: lngLat[1], altitudeMeters: 0 },
    scenePosition:
      sceneLease.layer.projectLngLatToScene?.(
        [lngLat[0], lngLat[1]],
        LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS
      ) ?? new THREE.Vector3(0, LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS, 0),
    sceneFromLocal,
  });
  let latestFrame: SharedThreeSceneFrame | null = null;
  const initialLocalFrame = sceneLease.layer.getLocalFrame?.() ?? null;
  let atmosphereFrameRevision = initialLocalFrame?.revision ?? 0;
  let atmosphereSkyReference = initialLocalFrame
    ? buildAtmosphereSkyReference(
        initialLocalFrame.lngLat,
        initialLocalFrame.sceneFromLocalRotation
      )
    : buildAtmosphereSkyReference([map.getCenter().lng, map.getCenter().lat]);
  const { frameFromScene, getFrameCamera, toFrameVolumes } =
    createShadowFrameProjection(initialLocalFrame, () => latestFrame);
  const atmosphericSunlight = new AtmosphericSunlightEvaluator();
  let invalidateShadowMap: (
    changedBounds?: readonly THREE.Box3[]
  ) => void = () => undefined;
  let refreshTerrainShadowState = (changedBounds?: readonly THREE.Box3[]) =>
    invalidateShadowMap(changedBounds);
  let lastTerrainRuntimeErrorMessage: string | null = null;
  let terrainRevision = 0;
  const buildTerrainRuntime = (originLngLat?: [number, number]) => {
    if (!terrain) return null;
    const mapCenter = map.getCenter();
    const {
      errorTargetPixels,
      motionErrorTargetPixels,
      shadowLevelOffset,
      minimumLevel,
      maximumLevel,
      maxSelectionTiles,
      requestConcurrency,
      maxCacheBytes,
      maxCachedMeshes,
      maxCachedMeshBytes,
      meshSegments,
      maximumMeshSegments,
      noDataHeightMeters,
      heightRangeMeters,
      material,
      ...terrainSourceConfig
    } = constrainMobileShadowTerrain(terrain, mobileBaseline)!;
    return buildRasterDemTerrainRuntime(
      `${SHADOW_SIMULATION_TERRAIN_RUNTIME_ID}-${++terrainRevision}`,
      terrainSourceConfig,
      originLngLat ?? [mapCenter.lng, mapCenter.lat],
      {
        errorTargetPixels:
          errorTargetPixels ?? DEFAULT_TERRAIN_ERROR_TARGET_PIXELS,
        motionErrorTargetPixels,
        shadowLevelOffset,
        minimumLevel,
        maximumLevel,
        maxSelectionTiles,
        requestConcurrency,
        maxCacheBytes,
        maxCachedMeshes,
        maxCachedMeshBytes,
        meshSegments: meshSegments ?? terrainSourceConfig.tileSize,
        maximumMeshSegments,
        noDataHeightMeters,
        heightRangeMeters,
        material,
        receivesMapStyleTexture: true,
        onContentChanged: (changedBounds) =>
          refreshTerrainShadowState(changedBounds),
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          if (message === lastTerrainRuntimeErrorMessage) return;
          lastTerrainRuntimeErrorMessage = message;
          console.error(
            "[shadow-simulation] Raster DEM terrain runtime failed",
            error
          );
        },
      }
    );
  };
  const sharedSceneProvidesTerrain = () =>
    getSharedThreeSceneRuntimes(map).some(
      (runtime) => runtime.providesTerrain === true
    );
  const meshSurfaceReady = () =>
    getSharedThreeSceneRuntimes(map).every(
      (runtime) =>
        !runtime.providesTerrain ||
        // A committed mesh surface can accumulate while finer families load.
        // Content epochs invalidate those samples when the surface changes.
        (runtime.hasRenderableContent?.() ??
          runtime.isMainViewReady?.() ??
          true)
    );
  let surfaceProviders = getSharedThreeSceneRuntimes(map).filter(
    (runtime) => runtime.providesTerrain
  );
  let terrainRuntime = sharedSceneProvidesTerrain()
    ? null
    : buildTerrainRuntime();
  let initialTerrainStageReady = terrainRuntime === null;
  if (terrainRuntime) sceneLease.layer.addRuntime(terrainRuntime);
  // Light, sun vector and shadow pages live in the layer's local-frame group,
  // like the ECEF tilesets they light, and are expressed in the frame's
  // reference fit. A local-frame refit moves that group alone: tiles, light,
  // casters and receivers move together, so the shadows cancel out of it
  // exactly and only a solar change invalidates them.
  // Decision: engines/maplibre/README.md#local-frame-for-ecef-tilesets-sun-and-sky.
  const shadowFrame =
    sceneLease.layer.getLocalFrameGroup?.() ?? sceneLease.layer.getScene();
  const sharedBinding = buildShadowLightBinding(
    sceneLease.layer.getScene(),
    shadowFrame,
    initialShadowAreaMeters,
    terrainColor
  );
  const atmosphereCameraPosition = new THREE.Vector3();
  let shadowStateEpoch = 0;
  let shadowVisualEpoch = 0;
  const idleTerrainPrefetch = createShadowIdleTerrainPrefetch({
    getRequest: () => {
      if (
        disposed ||
        !terrain ||
        !terrainRuntime ||
        !initialTerrainStageReady ||
        isSharedThreeTerrainLoading(map) ||
        mapInMotion ||
        timeAnimating ||
        contentChangeTimer !== 0 ||
        !softSunShadowsEnabled ||
        !nativeAccumulationFits ||
        !latestFrame
      )
        return null;
      const availability = terrainRuntime.getIdlePrefetchAvailability?.();
      // Even a fully warm neighbour ring needs once-per-settled-view cache
      // maintenance/calibration. The idle controller deduplicates this key.
      if (!availability?.ready) return null;
      const runtime = terrainRuntime;
      return {
        key: JSON.stringify([
          terrainRevision,
          shadowStateEpoch,
          shadowVisualEpoch,
          latestFrame.renderCamera.projectionMatrix.elements,
          latestFrame.renderCamera.matrixWorldInverse.elements,
          latestFrame.viewport.x,
          latestFrame.viewport.y,
        ]),
        run: async (signal) => {
          await runtime.prefetchIdleTerrain(signal);
          if (
            signal.aborted ||
            !isTiledBufferEnabled() ||
            !tiledScene ||
            !latestFrame ||
            !sceneLease.layer.runIdleRender
          )
            return;
          // Other streamed meshes currently have no complete offscreen-caster
          // lease contract. Warming terrain remains safe, but caching shadows
          // with missing buildings would poison later views. Fail closed until
          // those providers can prove coverage for the same finite-sun corridor.
          if (
            genericBridges.size > 0 ||
            getCoverageRuntimes().some(
              (candidate) =>
                candidate !== runtime && candidate !== shadowControllerRuntime
            )
          )
            return;
          // Native receiver IDs are not coordinates of the legacy viewport
          // grid. Terrain sibling prefetch above remains valid; do not invent
          // unrelated shadow pages by parsing source IDs as spacing:x:z.
          if (receiverCells.some(({ id }) => !/^\d+:[-\d]+:[-\d]+$/.test(id)))
            return;
          const regions = runtime.getIdleShadowRegions?.() ?? [];
          if (regions.length === 0 || !runtime.prepareIdleShadowRegion) return;
          await tiledScene.prewarm({
            cells: buildShadowReceiverNeighbourRing(receiverCells),
            frame: latestFrame,
            planningCamera: getFrameCamera(latestFrame),
            lighting: {
              directionToSun: sharedBinding.directionToSun,
              color: sharedBinding.sunColor,
              intensity: sharedBinding.sunIntensity,
              shadowIntensity: sharedBinding.shadowIntensity,
            },
            targetPixels:
              SHADOW_QUALITY_PROFILES[sharedBinding.shadowQuality]
                .shadowTexelErrorPixels,
            samples: getSunDiscAccumulationRounds(),
            signal,
            prepare: async (page, leaseSignal) => {
              const terrainLevel = nearestIdleTerrainLevel(
                page.receiverBounds,
                regions
              );
              if (terrainLevel === null)
                return {
                  covered: false,
                  group: null,
                  isCurrent: () => false,
                  dispose: () => undefined,
                };
              return runtime.prepareIdleShadowRegion(
                {
                  receiverBounds: page.receiverBounds,
                  casterBounds: page.casterBounds,
                  terrainLevel,
                },
                leaseSignal
              );
            },
          });
          if (!signal.aborted) debugPublisher.publish();
        },
      };
    },
  });
  let cachedElevationRange: readonly [number, number] | null = null;
  let lastAtmosphereErrorSignature = "";
  const rejectAtmosphereUpdate = (
    phase: string,
    reason: string,
    details: Readonly<Record<string, unknown>>
  ) => {
    const signature = `${phase}:${reason}`;
    if (signature === lastAtmosphereErrorSignature) return;
    lastAtmosphereErrorSignature = signature;
    console.error(
      `[SHADOW] Atmospheric update rejected; retaining last valid frame (${phase}: ${reason})`,
      {
        phase,
        reason,
        ...details,
      }
    );
  };
  const acceptAtmosphereUpdate = () => {
    lastAtmosphereErrorSignature = "";
  };
  const invalidateShadowPresentation = () => {
    idleTerrainPrefetch.cancel();
    shadowStateEpoch += 1;
    shadowVisualEpoch += 1;
  };
  const mapLibreLight = createShadowMapLibreLight(
    map,
    (color) => sceneLease.setLocationLabelColor(color),
    () => timeAnimating,
    () => mapInMotion
  );
  const evaluateAtmosphericSunlightForMap = (position: SolarPosition) => {
    // Incident light belongs to the local world, not the viewing camera. A pan
    // must not change its direction/radiance and invalidate every shadow page.
    // The sky still receives the live view camera and observer scene position.
    const observer = {
      longitude: atmosphereSkyReference.observer.longitude,
      latitude: atmosphereSkyReference.observer.latitude,
      altitudeMeters: LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS,
    };
    const inputError = getAtmosphericInputValidationError(
      position.instant,
      observer,
      atmosphereSkyReference
    );
    if (inputError) {
      rejectAtmosphereUpdate("sunlight input", inputError, {
        observer,
        skyReference: atmosphereSkyReference,
      });
      return latestAtmosphericSunlight;
    }
    atmosphericSunlight.ensure(() => {
      if (disposed || !latestSolarPosition) return;
      invalidateShadowPresentation();
      const sample = evaluateAtmosphericSunlightForMap(latestSolarPosition);
      if (sample) mapLibreLight.apply(sample);
      map.triggerRepaint();
    }, atmosphericSunlightOptions);
    atmosphericSunlight.ensureSky(() => {
      if (disposed || !latestSolarPosition) return;
      invalidateShadowPresentation();
      evaluateAtmosphericSunlightForMap(latestSolarPosition);
      map.triggerRepaint();
    });
    let sample: AtmosphericSunlightSample;
    try {
      sample = atmosphericSunlight.evaluate(
        position.instant,
        observer,
        atmosphericSunlightOptions,
        atmosphereSkyReference
      );
    } catch (error) {
      rejectAtmosphereUpdate("sunlight generation", "generator threw", {
        observer,
        error,
      });
      return latestAtmosphericSunlight;
    }
    const outputError = getAtmosphericSunlightSampleValidationError(sample);
    if (outputError) {
      rejectAtmosphereUpdate("sunlight output", outputError, {
        observer,
        sample,
      });
      return latestAtmosphericSunlight;
    }
    acceptAtmosphereUpdate();
    latestAtmosphericSunlight = sample;
    sharedBinding.atmosphericSky.update(
      sample.skyFrame,
      atmosphericSunlight.skyTextures
    );
    applyAtmosphericSkyLightToBinding(sharedBinding, sample);
    // The light lives in the frame group: its direction is the sun's scene
    // image brought into the reference fit, which no later refit changes.
    applySolarPositionToBinding(
      sharedBinding,
      sample.directionToSun.clone().transformDirection(frameFromScene()),
      sample.radiance,
      ATMOSPHERIC_DISPLAY_EXPOSURE
    );
    return sample;
  };
  invalidateShadowMap = (changedBounds) => {
    if (disposed) return;
    idleTerrainPrefetch.cancel();
    tiledScene?.invalidateContent(changedBounds);
    sharedBinding.controller.invalidate();
    sharedBinding.dirty = true;
  };
  const genericBridges = new Map<GenericThreeLayer, GenericThreeShadowBridge>();
  const getCoverageRuntimes = (): readonly SharedThreeSceneRuntime[] => {
    const runtimes = getSharedThreeSceneRuntimes(map);
    return terrainRuntime && !runtimes.includes(terrainRuntime)
      ? [terrainRuntime, ...runtimes]
      : runtimes;
  };
  let renderTileVolumes: readonly SharedThreeSceneTileVolume[] | null = null;
  let renderRegionReadiness: Map<string, boolean> | null = null;
  let renderRegionRevisions: Map<string, string | null> | null = null;
  let renderReceiverErrors: Map<string, number> | null = null;
  let renderedTileVolumes: readonly SharedThreeSceneTileVolume[] = [];
  const readActiveTileVolumes = (): readonly SharedThreeSceneTileVolume[] =>
    getCoverageRuntimes().flatMap((runtime) =>
      toFrameVolumes(runtime, runtime.getActiveTileVolumes?.() ?? [])
    );
  const getActiveTileVolumes = (): readonly SharedThreeSceneTileVolume[] =>
    renderTileVolumes ?? readActiveTileVolumes();
  const resolveMeshReceiverBiasLimit = (
    bounds?: THREE.Box3,
    groundTexelTargetMeters = MESH_FINAL_SHADOW_BIAS_METERS * 4
  ) => {
    if (!sharedSceneProvidesTerrain()) return undefined;
    const volumes = getActiveTileVolumes();
    const targetErrorPixels = meshErrorTargetPixels();
    const stageError = bounds
      ? shadowReceiverStageError(bounds, volumes, targetErrorPixels)
      : Math.max(
          targetErrorPixels,
          ...volumes
            .filter(
              ({ loadReason }) => loadReason !== TILE_VOLUME_LOAD_REASON.SHADOW
            )
            .map(({ errorPixels }) => errorPixels)
            .filter((error): error is number => Number.isFinite(error))
        );
    // A centimetre is below the raster footprint of a city overview. Bound
    // mesh self-intersection tolerance by a tenth of the nearest receiver's
    // CSS pixel instead; zooming in still preserves centimetre contact detail.
    let metersPerPixel = Infinity;
    for (const volume of volumes) {
      if (volume.loadReason === TILE_VOLUME_LOAD_REASON.SHADOW) continue;
      if (
        bounds &&
        (volume.minimum[0] >= bounds.max.x ||
          volume.maximum[0] <= bounds.min.x ||
          volume.minimum[2] >= bounds.max.z ||
          volume.maximum[2] <= bounds.min.z)
      )
        continue;
      const geometricError = volume.geometricError;
      const pixelError = volume.errorPixels;
      if (
        geometricError !== undefined &&
        pixelError !== undefined &&
        Number.isFinite(geometricError) &&
        Number.isFinite(pixelError) &&
        geometricError > 0 &&
        pixelError > 0
      )
        metersPerPixel = Math.min(metersPerPixel, geometricError / pixelError);
    }
    return meshReceiverBiasLimitMeters({
      stageErrorPixels: stageError,
      targetErrorPixels,
      groundTexelTargetMeters,
      finalBiasMeters: MESH_FINAL_SHADOW_BIAS_METERS,
      maximumCoarseBiasMeters: MESH_COARSE_SHADOW_BIAS_LIMIT_METERS,
      metersPerPixel: Number.isFinite(metersPerPixel) ? metersPerPixel : 0,
    });
  };
  const withTileVolumeSnapshot = <T>(render: () => T): T => {
    // A synchronous render cannot observe a new asynchronous tile publication.
    // Rebuilding the same volumes per corridor cost 15.6 s across 31,158 calls
    // in a 56 s mesh startup profile. Share only within this call: the next
    // frame still sees all newly committed geometry and changed transforms.
    const previous = renderTileVolumes;
    const previousReadiness = renderRegionReadiness;
    const previousRevisions = renderRegionRevisions;
    const previousErrors = renderReceiverErrors;
    renderTileVolumes = previous ?? readActiveTileVolumes();
    renderRegionReadiness = previousReadiness ?? new Map();
    renderRegionRevisions = previousRevisions ?? new Map();
    renderReceiverErrors = previousErrors ?? new Map();
    if (!previous) {
      const changes = getChangedShadowVolumeBounds(
        renderedTileVolumes,
        renderTileVolumes
      );
      if (changes.length > 0) {
        tiledScene?.invalidateContent(changes);
        // Native content events may precede publication by one paint. This
        // coherent active-cut diff includes every published add/remove, so the
        // later batch must not invalidate those same corridors a second time.
        changedContentBoundsPending.length = 0;
      }
      renderedTileVolumes = renderTileVolumes;
    }
    try {
      return render();
    } finally {
      renderTileVolumes = previous;
      renderRegionReadiness = previousReadiness;
      renderRegionRevisions = previousRevisions;
      renderReceiverErrors = previousErrors;
    }
  };
  let latestShadowView: SharedThreeSceneShadowView | null = null;
  let appliedRuntimeShadowView: SharedThreeSceneShadowView | null = null;
  let lastAnimatedRuntimeShadowViewMs = Number.NEGATIVE_INFINITY;
  let runtimeShadowViewDeferredByAnimation = false;
  const terrainSelectionSignatures = new WeakMap<
    SharedThreeSceneRuntime,
    string
  >();
  const getTerrainSelectionSignature = (
    view: SharedThreeSceneShadowView | null
  ) => {
    if (!view) return "none";
    const center = map.getCenter();
    const canvas = map.getCanvas();
    return [
      Math.round(center.lng * 10_000_000),
      Math.round(center.lat * 10_000_000),
      Math.round((map.getZoom?.() ?? 0) * 10_000),
      Math.round((map.getBearing?.() ?? 0) * 1_000),
      Math.round((map.getPitch?.() ?? 0) * 1_000),
      `${canvas.clientWidth || canvas.width}x${
        canvas.clientHeight || canvas.height
      }`,
      latestSolarPosition?.azimuthDegrees ?? "no-sun",
      latestSolarPosition?.elevationDegrees ?? "no-sun",
      sharedBinding.shadowQuality,
    ].join(";");
  };
  const applyRuntimeShadowView = (view: SharedThreeSceneShadowView | null) => {
    if (timeAnimating) {
      // Every animation tick moves the sun and with it the shadow camera. The
      // terrain and mesh runtimes re-select their caster coverage per view,
      // through worker round trips whose input copies land on the main thread.
      // Follow the sun coarsely while animating; the stop applies the final view.
      const now = performance.now();
      if (
        now - lastAnimatedRuntimeShadowViewMs <
        ANIMATION_RUNTIME_SHADOW_VIEW_INTERVAL_MS
      ) {
        runtimeShadowViewDeferredByAnimation = true;
        return;
      }
      lastAnimatedRuntimeShadowViewMs = now;
    }
    // Only a view that was handed out counts as applied: recording a deferred
    // one made the catch-up at the end of a gesture or an animation compare
    // equal and skip the view it had just thrown away.
    appliedRuntimeShadowView = view;
    runtimeShadowViewDeferredByAnimation = false;
    const selectionSignature = getTerrainSelectionSignature(view);
    const receiverCamera = latestFrame?.renderCamera;
    const receiverFrustum =
      view && receiverCamera
        ? new THREE.Frustum().setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(
              receiverCamera.projectionMatrix,
              receiverCamera.matrixWorldInverse
            ),
            receiverCamera.coordinateSystem,
            receiverCamera.reversedDepth
          )
        : null;
    const receiverBounds = new THREE.Box3();
    const terrainReceivers = receiverFrustum
      ? toFrameVolumes(
          terrainRuntime,
          terrainRuntime?.getActiveTileVolumes?.() ?? []
        ).filter((tile) => {
          // Caster-only terrain must not recursively extend receiver demand.
          receiverBounds.min.fromArray(tile.minimum);
          receiverBounds.max.fromArray(tile.maximum);
          return receiverFrustum.intersectsBox(receiverBounds);
        })
      : undefined;
    const runtimes = [
      ...getSharedThreeSceneRuntimes(map),
      ...(terrainRuntime ? [terrainRuntime] : []),
    ];
    for (const runtime of new Set(runtimes)) {
      // Keep mesh display admission independent from corridor publication
      // while per-tile stages are diagnosed in the scene overlay.
      runtime.setShadowStagePresentationGate?.(false);
      if (!runtime.providesTerrain) {
        // The shadow terrain follows the terrain LOD; a building tileset keeps
        // its own target unless the tileset LOD override says otherwise.
        if (runtime === terrainRuntime)
          runtime.setErrorTarget?.(
            terrain?.errorTargetPixels ?? DEFAULT_TERRAIN_ERROR_TARGET_PIXELS
          );
        else runtime.setErrorTargetOverride?.(latestMeshErrorTarget);
        runtime.setShadowView?.(view ? { ...view, terrainReceivers } : null);
        continue;
      }
      if (terrainSelectionSignatures.get(runtime) === selectionSignature) {
        continue;
      }
      terrainSelectionSignatures.set(runtime, selectionSignature);
      runtime.setShadowView?.(view);
    }
  };
  const setRuntimeShadowView = (view: SharedThreeSceneShadowView | null) => {
    latestShadowView = view;
    // Whoever only draws the light gets it as it is fitted, gesture or not.
    for (const runtime of new Set([
      ...getSharedThreeSceneRuntimes(map),
      ...(terrainRuntime ? [terrainRuntime] : []),
    ]))
      runtime.setLiveShadowView?.(view);
    if (!mapInMotion) applyRuntimeShadowView(view);
  };

  let softSunShadowsEnabled = !mobileBaseline;
  if (mobileBaseline) sharedBinding.shadowQuality = SHADOW_QUALITY.FPS_120;
  let renderQuality: ShadowRenderQualityOptions = {};
  let effectiveRenderQuality = resolveShadowRenderQuality(
    constrainMobileShadowRendering(renderQuality, mobileBaseline),
    sharedBinding.shadowQuality
  );
  let renderCapabilities: ReturnType<
    typeof getShadowRenderCapabilities
  > | null = null;
  const getAccumulationOptions = () => ({
    format: effectiveRenderQuality.shadowBufferFormat,
    // Page ownership is resolved at the native pixel centre. MSAA coverage
    // split across different receiver pages needs its own per-sample ownership
    // buffer; until then only the mono path exposes geometry MSAA (see UI).
    msaaSamples:
      effectiveRenderQuality.shadowBufferLayout === SHADOW_BUFFER_LAYOUT.TILED
        ? 0
        : resolveSupportedShadowMsaa(
            effectiveRenderQuality,
            (effectiveRenderQuality.shadowBufferFormat ===
            SHADOW_BUFFER_FORMAT.SDR_8
              ? renderCapabilities?.sdrSamples
              : renderCapabilities?.hdrSamples) ?? [0, 2, 4]
          ),
  });
  let accumulationOptions = getAccumulationOptions();
  let contentChangeTimer = 0;
  let contentRefreshPendingAfterMove = false;
  let fullContentInvalidationPending = false;
  const changedContentBoundsPending: THREE.Box3[] = [];
  let coverageNeedsCameraReevaluation = true;
  let fallbackReceiverWorldPoints: THREE.Vector3[] = [];
  let renderCameraSignature = "";
  let lastMotionShadowUpdateMs = Number.NEGATIVE_INFINITY;
  let shadowFrameBudget = createShadowFrameBudget(sharedBinding.shadowQuality);
  let maxAccumulationPixels = Number.POSITIVE_INFINITY;
  let nativeAccumulationFits = true;
  let resourceLimits = resolveShadowResourceLimits(4096);
  sharedBinding.controller.setMaxShadowMapSize(resourceLimits.maxShadowMapSize);
  let tiledScene: ShadowTiledScene | null = null;
  let tiledRenderer: THREE.WebGLRenderer | null = null;
  let receiverCells: readonly ShadowReceiverCell[] = [];
  const isTiledBufferEnabled = () =>
    effectiveRenderQuality.shadowBufferLayout === SHADOW_BUFFER_LAYOUT.TILED;
  const releaseTiledScene = () => {
    tiledScene?.dispose();
    tiledScene = null;
    tiledRenderer = null;
    receiverCells = [];
  };
  const debugPublisher = createShadowProjectionDebugPublisher(map, () => ({
    bufferLayout: effectiveRenderQuality.shadowBufferLayout,
    sunDiscSamples: effectiveRenderQuality.shadowSunDiscSamples,
    tiledStats: isTiledBufferEnabled() ? tiledScene?.stats ?? null : null,
  }));
  sharedBinding.controller.setSoftSun(softSunShadowsEnabled);

  const quantizeViewValue = (value: number, step: number) =>
    Math.round(value / step) * step;

  const getCoverageViewSignature = (frame: SharedThreeSceneFrame) => {
    const center = map.getCenter();
    return [
      quantizeViewValue(center.lng, 0.0000001),
      quantizeViewValue(center.lat, 0.0000001),
      quantizeViewValue(map.getZoom?.() ?? 0, 0.0001),
      quantizeViewValue(map.getBearing?.() ?? 0, 0.001),
      quantizeViewValue(map.getPitch?.() ?? 0, 0.001),
      `${frame.viewport.x}x${frame.viewport.y}`,
      frame.cssViewport?.toArray().join("x"),
    ].join(";");
  };

  const updateSharedShadowCoverage = (
    reevaluateSun = true,
    requestRepaint = true,
    frame?: SharedThreeSceneFrame
  ) => {
    const mapCenter = map.getCenter();
    const centerElevation =
      terrainRuntime?.getElevation(mapCenter.lng, mapCenter.lat) ?? 0;
    const center = sceneLease.layer.projectLngLatToScene?.(
      [mapCenter.lng, mapCenter.lat],
      centerElevation
    );
    if (!center) {
      if (latestSolarPosition) {
        evaluateAtmosphericSunlightForMap(latestSolarPosition);
      }
      if (requestRepaint) map.triggerRepaint();
      return;
    }
    sharedBinding.center.copy(center).applyMatrix4(frameFromScene());
    cachedElevationRange ??= getVisibleSceneElevationRange(
      sharedBinding.scene,
      center.y
    );
    const [minimumElevation, maximumElevation] = cachedElevationRange;
    if (frame) {
      const coveragePoints = getViewportElevationEnvelopePoints(
        getFrameCamera(frame),
        minimumElevation,
        maximumElevation,
        sharedBinding.center
      );
      if (coveragePoints.length > 0) {
        const viewportSize = new THREE.Box3()
          .setFromPoints(coveragePoints)
          .getSize(new THREE.Vector3());
        const viewportRadiusMeters = Math.max(
          ...coveragePoints.map((point) =>
            point.distanceTo(sharedBinding.center)
          )
        );
        sharedBinding.sunVectorLengthMeters =
          Math.min(viewportSize.x, viewportSize.z) *
          SUN_VECTOR_VIEWPORT_LENGTH_FACTOR;
        sharedBinding.shadowAreaMeters = Math.max(
          configuredShadowAreaMeters ?? 0,
          MIN_VIEWPORT_SHADOW_AREA_METERS,
          viewportRadiusMeters * 2
        );
        fallbackReceiverWorldPoints = coveragePoints;
      }
    } else {
      // Public map.unproject performs synchronous terrain depth readback.
      // Fit against the next render camera and retain the last valid coverage.
      coverageNeedsCameraReevaluation = true;
    }
    sharedBinding.shadowCameraOffsetMeters = Math.max(
      DEFAULT_SHADOW_CAMERA_OFFSET_METERS,
      sharedBinding.shadowAreaMeters * 1.5
    );
    sharedBinding.receiverWorldPoints = fallbackReceiverWorldPoints;
    sharedBinding.minimumElevationMeters = minimumElevation;
    sharedBinding.maximumElevationMeters = maximumElevation;
    sharedBinding.dirty = true;
    // During movement, move the anchor without resampling the atmosphere.
    if (latestSolarPosition && (reevaluateSun || !latestAtmosphericSunlight)) {
      evaluateAtmosphericSunlightForMap(latestSolarPosition);
    } else {
      sharedBinding.lightTarget.position.copy(sharedBinding.center);
      for (const sunLight of sharedBinding.controller.lights) {
        sunLight.target.position.copy(sharedBinding.center);
        sunLight.target.updateMatrixWorld(true);
      }
      sharedBinding.sunVector?.root.position.copy(sharedBinding.center);
      sharedBinding.sunVector?.root.updateMatrixWorld(true);
    }
    if (requestRepaint) map.triggerRepaint();
  };

  const shadowControllerRuntime: SharedThreeSceneRuntime = {
    id: "shadow-simulation-controller",
    originLngLat: [map.getCenter().lng, map.getCenter().lat],
    root: new THREE.Group(),
    updatePriority: SHADOW_CONTROLLER_UPDATE_PRIORITY,
    update(frame) {
      latestFrame = frame;
      const { localFrame } = frame;
      if (localFrame && localFrame.revision !== atmosphereFrameRevision) {
        atmosphereFrameRevision = localFrame.revision;
        atmosphereSkyReference = buildAtmosphereSkyReference(
          localFrame.lngLat,
          localFrame.sceneFromLocalRotation
        );
        // The sun is fixed in ECEF and the light sits in the frame group, so
        // the refit has already carried it; the shadows cancel out. Only the
        // sky dome, drawn in scene space, takes the retained sample
        // re-expressed for the new frame. Nothing is re-evaluated, no
        // shadow-map pass is forced, no shadow content or presentation is
        // invalidated.
        if (latestAtmosphericSunlight) {
          latestAtmosphericSunlight = rebaseAtmosphericSunlightSample(
            latestAtmosphericSunlight,
            atmosphereSkyReference
          );
          sharedBinding.atmosphericSky.update(
            latestAtmosphericSunlight.skyFrame,
            atmosphericSunlight.skyTextures
          );
        }
      }
      const renderer = sceneLease.layer.getRenderer?.();
      if (renderer && !renderCapabilities) {
        renderCapabilities = getShadowRenderCapabilities(renderer);
        accumulationOptions = getAccumulationOptions();
        resourceLimits = resolveShadowResourceLimits(
          Math.min(
            renderCapabilities.maxTextureSize,
            renderCapabilities.maxRenderbufferSize
          )
        );
        sharedBinding.controller.setMaxShadowMapSize(
          resourceLimits.maxShadowMapSize
        );
      }
      maxAccumulationPixels = resolveShadowAccumulationPixelBudget(
        resourceLimits.maxAccumulationPixels,
        accumulationOptions
      );
      // Above the device's existing memory cap, retain direct full-resolution
      // shading instead of blurring the captured map/labels by downsampling.
      nativeAccumulationFits =
        frame.viewport.x * frame.viewport.y <= maxAccumulationPixels;
      shadowFrameBudget = updateShadowFrameBudget(
        shadowFrameBudget,
        performance.now(),
        mapInMotion,
        {
          enabled: effectiveRenderQuality.shadowAdaptiveQuality,
          allowCadenceReduction: !isTiledBufferEnabled(),
        }
      );
      const cameraHeightAboveTargetMeters = Math.max(
        0,
        frame.lodCamera.position.y - frame.lookTarget.y
      );
      const nextCameraAltitudeMeters =
        LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS +
        cameraHeightAboveTargetMeters;
      const nextAtmosphereSceneHeight =
        atmosphereSkyReference.scenePosition.y + cameraHeightAboveTargetMeters;
      const atmosphereCameraMatricesValid = [
        ...frame.lodCamera.matrixWorld.elements,
        ...frame.lodCamera.projectionMatrix.elements,
      ].every(Number.isFinite);
      if (
        !atmosphereCameraMatricesValid ||
        !Number.isFinite(nextCameraAltitudeMeters) ||
        !Number.isFinite(nextAtmosphereSceneHeight)
      ) {
        rejectAtmosphereUpdate(
          "render camera",
          "local Three.js camera matrix or altitude is invalid",
          {
            altitudeMeters: nextCameraAltitudeMeters,
            cameraHeightAboveTargetMeters,
            matrixWorld: frame.lodCamera.matrixWorld.elements,
            projectionMatrix: frame.lodCamera.projectionMatrix.elements,
          }
        );
      } else {
        sharedBinding.atmosphericSky.updateViewCamera(frame.lodCamera);
        sharedBinding.atmosphericSky.updateObserverScenePosition(
          atmosphereCameraPosition.set(
            atmosphereSkyReference.scenePosition.x,
            nextAtmosphereSceneHeight,
            atmosphereSkyReference.scenePosition.z
          )
        );
      }
      // MapLibre may rebuild render-camera matrices while terrain settles even
      // though its public view did not move. Terrain changes invalidate this
      // coverage separately, so use the stable user-facing view state here.
      const nextRenderCameraSignature = getCoverageViewSignature(frame);
      if (
        coverageNeedsCameraReevaluation ||
        nextRenderCameraSignature !== renderCameraSignature
      ) {
        // Dragging only changes the observer, so the expensive queries wait for
        // moveend: the elevation range keeps its cached value below. The fit
        // itself follows the camera, otherwise the corridor covers where the
        // view was when the gesture started. Runtimes still receive their
        // committed view only at moveend; the live one goes out every frame.
        const nowMs = performance.now();
        lastMotionShadowUpdateMs = nowMs;
        renderCameraSignature = nextRenderCameraSignature;
        cachedElevationRange = mapInMotion
          ? cachedElevationRange ?? [
              sharedBinding.minimumElevationMeters,
              sharedBinding.maximumElevationMeters,
            ]
          : getViewElevationRange(
              sharedBinding.scene,
              getSharedThreeSceneRuntimes(map),
              frame.renderCamera,
              sharedBinding.center.y
            );
        // We are already inside the custom-layer render. Triggering MapLibre
        // here would turn a coverage refresh into a self-sustaining idle loop.
        updateSharedShadowCoverage(false, false, frame);
        coverageNeedsCameraReevaluation = false;
      }
      if (!sharedBinding.dirty) return;
      if (
        sharedBinding.sunVectorVisible &&
        sharedBinding.sunVector &&
        sharedBinding.sunVector.root.cone.position.y !==
          sharedBinding.sunVectorLengthMeters
      ) {
        applySolarPositionToBinding(
          sharedBinding,
          sharedBinding.directionToSun,
          sharedBinding.sunColor,
          sharedBinding.sunIntensity
        );
      }
      shadowStateEpoch += 1;
      // The loaded receiver surfaces remain authoritative during movement too.
      // Dropping them on drag start shrinks the clipping grid to an estimated
      // elevation envelope and can cut away still-visible terrain.
      const committedVolumes = getActiveTileVolumes();
      const visibleTileVolumePoints = committedVolumes.flatMap(
        ({ minimum, maximum }) =>
          getFrustumBoxIntersectionPoints(
            getFrameCamera(frame),
            new THREE.Box3(
              new THREE.Vector3(...minimum),
              new THREE.Vector3(...maximum)
            )
          )
      );
      sharedBinding.receiverWorldPoints =
        visibleTileVolumePoints.length > 0
          ? visibleTileVolumePoints
          : fallbackReceiverWorldPoints;
      if (
        sharedBinding.receiverWorldPoints.length === 0 ||
        !latestSolarPosition
      ) {
        setRuntimeShadowView(null);
        debugPublisher.setSnapshot(null);
        clearShadowProjectionDebugSnapshot(map);
        return;
      }
      if (isTiledBufferEnabled()) {
        // A corridor belongs to a committed source tile, not the intersection
        // of the camera with a freshly fitted viewport grid. Plan all retained
        // full boxes before frustum filtering so panning cannot rename pages.
        receiverCells = buildShadowReceiverCells(
          committedVolumes
            .filter(
              ({ loadReason }) => loadReason !== TILE_VOLUME_LOAD_REASON.SHADOW
            )
            .map(({ id, minimum, maximum, receiverObjectId }) => ({
              id,
              receiverObjectId,
              bounds: new THREE.Box3(
                new THREE.Vector3(...minimum),
                new THREE.Vector3(...maximum)
              ),
            }))
        );
        const fullPagePoints = getVisibleShadowReceiverCorners(
          receiverCells,
          getFrameCamera(frame)
        );
        // Capture readiness and fetching must refer to the SAME full source
        // page. Clipping discovery to the screen starves edge-page casters.
        // Keep the startup fallback until a committed cut exists: clearing it
        // would release/re-enable the provider barrier every frame (strobing).
        if (fullPagePoints.length > 0) {
          sharedBinding.receiverWorldPoints = [...fullPagePoints];
        }
      }
      const depthTexelBudget = resolveShadowDepthTexelBudget(
        resourceLimits.maxShadowMapSize,
        sharedBinding.shadowQuality,
        frame.viewport.x * frame.viewport.y,
        mapInMotion ? shadowFrameBudget.depthScale : 1
      );
      const lodViewport = frame.cssViewport ?? frame.viewport;
      // Decision: engines/maplibre/TILES_COVERAGE.md#css-pixel-error-targets.
      // Render at native resolution; caster downloads use the CSS-sized budget.
      const casterMapTexelBudget = resolveShadowDepthTexelBudget(
        resourceLimits.maxShadowMapSize,
        sharedBinding.shadowQuality,
        lodViewport.x * lodViewport.y,
        mapInMotion ? shadowFrameBudget.depthScale : 1
      );
      const snapshot = sharedBinding.controller.update({
        maxReceiverBiasMeters: resolveMeshReceiverBiasLimit(),
        receiverWorldPoints: sharedBinding.receiverWorldPoints,
        receiverAnchorWorldPosition: sharedBinding.center,
        minimumElevationMeters: sharedBinding.minimumElevationMeters,
        maximumElevationMeters: sharedBinding.maximumElevationMeters,
        directionToSun: sharedBinding.directionToSun,
        color: sharedBinding.sunColor,
        intensity: sharedBinding.sunIntensity,
        shadowIntensity: sharedBinding.shadowIntensity,
        quality: sharedBinding.shadowQuality,
        mapTexelBudget: depthTexelBudget,
        casterMapTexelBudget,
        groundTexelFit: effectiveRenderQuality.shadowGroundTexelFit,
        stabilizeMapSize: mapInMotion,
      });
      sharedBinding.dirty = false;
      if (!snapshot) {
        setRuntimeShadowView(null);
        debugPublisher.setSnapshot(null);
        clearShadowProjectionDebugSnapshot(map);
        return;
      }
      const primary = snapshot.camera;
      const primaryCamera = sharedBinding.controller.lights[0].shadow.camera;
      const directionToSunECEF =
        latestAtmosphericSunlight?.skyFrame.directionToSunECEF;
      setRuntimeShadowView({
        camera: primaryCamera,
        directionToSunECEF: directionToSunECEF
          ? [directionToSunECEF.x, directionToSunECEF.y, directionToSunECEF.z]
          : undefined,
        casterAngularRadiusRadians: softSunShadowsEnabled
          ? SUN_ANGULAR_RADIUS_RAD
          : 0,
        shadowMapSize: {
          width:
            (primary.rightMeters - primary.leftMeters) /
            snapshot.casterMetersPerTexel[0],
          height:
            (primary.topMeters - primary.bottomMeters) /
            snapshot.casterMetersPerTexel[1],
        },
      });
      // The common hard draw also runs in tiled mode. Keep its depth target
      // across sun updates; Three owns resizing and invalidation, not a fresh
      // dispose/allocation on every animation tick.
      const publishWanted = hasShadowProjectionDebugListeners(map);
      if (primary && publishWanted) {
        frame.lodCamera.updateMatrixWorld(true);
        frame.lodCamera.updateProjectionMatrix();
        const tileVolumes = getCoverageRuntimes().flatMap((runtime) =>
          (runtime.getActiveTileVolumes?.() ?? []).map(
            ({ id, loadReason, minimum, maximum }) => ({
              id,
              loadReason,
              minimum,
              maximum,
            })
          )
        );
        debugPublisher.setSnapshot({
          bufferLayout: effectiveRenderQuality.shadowBufferLayout,
          sunDiscSamples: effectiveRenderQuality.shadowSunDiscSamples,
          tiledStats: null,
          cameraRangeMeters: primaryCamera.position.distanceTo(
            sharedBinding.controller.lights[0].target.position
          ),
          leftMeters: primary.leftMeters,
          rightMeters: primary.rightMeters,
          bottomMeters: primary.bottomMeters,
          topMeters: primary.topMeters,
          nearMeters: primary.nearMeters,
          farMeters: primary.farMeters,
          projectionMatrixElements: primary.projectionMatrixElements,
          shadowMapWidth: primary.shadowMapWidth,
          shadowMapHeight: primary.shadowMapHeight,
          minimumElevationMeters: sharedBinding.minimumElevationMeters,
          maximumElevationMeters: sharedBinding.maximumElevationMeters,
          sceneAnchorPositionElements: sharedBinding.center.toArray(),
          mainCamera: {
            viewMatrixElements: [
              ...frame.lodCamera.matrixWorldInverse.elements,
            ],
            projectionMatrixElements: [
              ...frame.lodCamera.projectionMatrix.elements,
            ],
            nearMeters: frame.lodCamera.near,
            farMeters: frame.lodCamera.far,
            viewportWidth: frame.viewport.x,
            viewportHeight: frame.viewport.y,
          },
          tileVolumes,
          shadow: snapshot,
          atmosphericSunlight: latestAtmosphericSunlight
            ? {
                azimuthDegrees: latestAtmosphericSunlight.azimuthDegrees,
                elevationDegrees: latestAtmosphericSunlight.elevationDegrees,
                relativeIntensity: latestAtmosphericSunlight.relativeIntensity,
                color: `#${latestAtmosphericSunlight.color.getHexString()}`,
                transmittanceReady:
                  latestAtmosphericSunlight.atmosphericTransmittanceReady,
                irradianceReady:
                  latestAtmosphericSunlight.atmosphericIrradianceReady,
              }
            : null,
        });
        debugPublisher.publish();
      }
    },
    dispose: () => undefined,
  };
  sceneLease.layer.addRuntime(shadowControllerRuntime);

  const getSunDiscAccumulationRounds = () =>
    effectiveRenderQuality.shadowSunDiscSamples;
  const updateTiledScene = () => {
    if (
      !isTiledBufferEnabled() ||
      !latestFrame ||
      sharedBinding.directionToSun.y <= 0
    )
      return null;
    const renderer = sceneLease.layer.getRenderer?.();
    if (!renderer) return null;
    let created = false;
    if (!tiledScene || tiledRenderer !== renderer) {
      const cells = receiverCells;
      releaseTiledScene();
      receiverCells = cells;
      tiledRenderer = renderer;
      tiledScene = new ShadowTiledScene(sharedBinding.scene, renderer, {
        light: sharedBinding.controller.lights[0],
        sky: sharedBinding.atmosphericSky.mesh,
        overlay: sharedBinding.sunVectorRoot,
        frame: sharedBinding.frame,
        maximumMapSize: resourceLimits.maxShadowMapSize,
        isCorridorReady: (bounds, errorPixels, receiverBounds) => {
          // Hard capture, soft scheduling and presentation inspect the same
          // immutable cut during this synchronous draw. Do not traverse its
          // tree again for each consumer; both true and false expire next draw.
          const key = shadowRegionQueryKey(bounds, errorPixels, receiverBounds);
          const cached = renderRegionReadiness?.get(key);
          if (cached !== undefined) return cached;
          const ready = getCoverageRuntimes().every(
            (runtime) =>
              runtime.isShadowRegionReady?.(
                bounds,
                errorPixels,
                receiverBounds
              ) ??
              (runtime.getRequestDemand
                ? runtime.getRequestDemand() === 0
                : !runtime.providesTerrain || !isSharedThreeTerrainLoading(map))
          );
          renderRegionReadiness?.set(key, ready);
          return ready;
        },
        receiverStageError: (bounds) => {
          const key = shadowRegionQueryKey(bounds);
          const cached = renderReceiverErrors?.get(key);
          if (cached !== undefined) return cached;
          const error = shadowReceiverStageError(
            bounds,
            getActiveTileVolumes(),
            sharedSceneProvidesTerrain()
              ? meshErrorTargetPixels()
              : terrain?.errorTargetPixels ??
                  DEFAULT_TERRAIN_ERROR_TARGET_PIXELS
          );
          renderReceiverErrors?.set(key, error);
          return error;
        },
        receiverBiasLimit: (bounds, groundTexelTargetMeters) =>
          resolveMeshReceiverBiasLimit(bounds, groundTexelTargetMeters) ??
          MESH_FINAL_SHADOW_BIAS_METERS,
        onPresentedPages: (presentedPages, visiblePages) => {
          const receiverIds = getPresentedShadowReceiverIds(
            getActiveTileVolumes(),
            visiblePages.map(({ id, receiverBounds: bounds }) => ({
              id,
              bounds,
            })),
            presentedPages.map(({ id, receiverBounds: bounds }) => ({
              id,
              bounds,
            }))
          );
          if (receiverIds.length === 0) return;
          for (const runtime of getCoverageRuntimes()) {
            runtime.acknowledgeShadowStage?.(receiverIds);
          }
        },
        corridorRevision: (bounds, errorPixels, receiverBounds) => {
          // Decision: FRAME-CORRIDOR-QUERIES-20260910 in
          // three/CORRIDOR_PERFORMANCE_20260909.md. Hard capture, disk restore
          // and soft scheduling share this synchronous geometry snapshot.
          const key = shadowRegionQueryKey(bounds, errorPixels, receiverBounds);
          const cached = renderRegionRevisions?.get(key);
          if (cached !== undefined) return cached;
          const revisions: string[] = [];
          for (const runtime of getCoverageRuntimes()) {
            if (runtime === shadowControllerRuntime) continue;
            const revision = runtime.getShadowRegionRevision?.(
              bounds,
              errorPixels,
              receiverBounds
            );
            // A runtime with no persistent geometry identity cannot certify a
            // cache hit. Live shadows continue normally without persistent I/O.
            if (!revision) {
              renderRegionRevisions?.set(key, null);
              return null;
            }
            revisions.push(JSON.stringify([runtime.id, revision]));
          }
          const revision = revisions.length
            ? JSON.stringify(revisions.sort())
            : null;
          renderRegionRevisions?.set(key, revision);
          return revision;
        },
        dateTimeKey: () => latestSolarPosition?.instant.toISOString() ?? null,
        worldBasis: () => {
          const origin = sceneLease.layer.projectSceneToLngLat([0, 0, 0]);
          if (!origin)
            throw new Error("Shared scene origin is not initialized");
          const mercator = MercatorCoordinate.fromLngLat(origin, 0);
          return shadowSceneWorldBasis(
            mercator.x,
            mercator.y,
            mercator.meterInMercatorCoordinateUnits()
          );
        },
        requestRepaint: () => map.triggerRepaint(),
        visualEpoch: () => shadowVisualEpoch,
        auditCorridors: (pages) => {
          // Debug-only: take one coherent geometry snapshot for all queries.
          // Do not rebuild every provider's volume list for every page.
          const volumes = getActiveTileVolumes();
          const runtimes = getCoverageRuntimes();
          return pages.map(({ id, casterBounds, receiverBounds }) =>
            auditShadowCorridor({
              id,
              casterBounds,
              sunElevationDegrees: latestSolarPosition?.elevationDegrees ?? 0,
              volumes,
              regions: runtimes.flatMap((runtime) => {
                const result = runtime.getShadowRegionDiagnostics?.(
                  casterBounds,
                  undefined,
                  receiverBounds
                );
                return result ? [result] : [];
              }),
            })
          );
        },
        runIdleRender: (render) =>
          sceneLease.layer.runIdleRender?.(render) ?? false,
      });
      created = true;
    }
    if (!mapInMotion || created) {
      tiledScene.update(
        receiverCells,
        latestFrame,
        {
          maxReceiverBiasMeters: sharedSceneProvidesTerrain()
            ? MESH_FINAL_SHADOW_BIAS_METERS
            : undefined,
          directionToSun: sharedBinding.directionToSun,
          color: sharedBinding.sunColor,
          intensity: sharedBinding.sunIntensity,
          shadowIntensity: sharedBinding.shadowIntensity,
        },
        // Scale depth demand, never the native-pixel map/style colour pass.
        SHADOW_QUALITY_PROFILES[sharedBinding.shadowQuality]
          .shadowTexelErrorPixels,
        getFrameCamera(latestFrame)
      );
    } else {
      // Receiver pages and their finite-sun captures are world anchored. A
      // camera drag changes only their framebuffer scissor; reproject that
      // presentation without changing corridor or cache identity.
      tiledScene.updatePresentation(latestFrame, getFrameCamera(latestFrame));
    }
    return tiledScene;
  };
  const bootstrapPreview = createShadowBootstrapPreview();
  const shouldUseBootstrapPreview = () =>
    isTiledBufferEnabled() && bootstrapPreview(getCoverageRuntimes());
  const accumulationController = {
    // Mono and tiled soft-sun paths share this post-composition hook. Point
    // lighting has no convergence event and deliberately schedules no prefetch.
    onSettled: idleTerrainPrefetch.onSettled,
    onPresented: () => {
      const now = performance.now();
      for (const runtime of getSharedThreeSceneRuntimes(map))
        runtime.onShadowPresented?.(now);
    },
    get options() {
      return accumulationOptions;
    },
    get maxRenderTargetPixels() {
      return maxAccumulationPixels;
    },
    get rounds() {
      return getSunDiscAccumulationRounds();
    },
    epoch: () => shadowStateEpoch,
    visualEpoch: () => shadowVisualEpoch,
    pending: () =>
      nativeAccumulationFits &&
      softSunShadowsEnabled &&
      !timeAnimating &&
      (!initialTerrainStageReady ||
        shouldUseBootstrapPreview() ||
        (!isTiledBufferEnabled() && !meshSurfaceReady()) ||
        (!isTiledBufferEnabled() && isSharedThreeTerrainLoading(map)) ||
        mapInMotion ||
        (!isTiledBufferEnabled() && contentChangeTimer !== 0)),
    active: () =>
      nativeAccumulationFits &&
      softSunShadowsEnabled &&
      initialTerrainStageReady &&
      !shouldUseBootstrapPreview() &&
      (isTiledBufferEnabled() || meshSurfaceReady()) &&
      (isTiledBufferEnabled() || !isSharedThreeTerrainLoading(map)) &&
      !mapInMotion &&
      !timeAnimating &&
      (isTiledBufferEnabled() || contentChangeTimer === 0) &&
      latestSolarPosition !== null &&
      latestShadowView !== null &&
      sharedBinding.receiverWorldPoints.length > 0,
    retainSettledFrame: () =>
      nativeAccumulationFits &&
      softSunShadowsEnabled &&
      latestSolarPosition !== null &&
      latestShadowView !== null &&
      sharedBinding.receiverWorldPoints.length > 0,
    prepareRound: (round: number) => {
      if (isTiledBufferEnabled()) return;
      sharedBinding.controller.applySunDiscSample(
        round,
        getSunDiscAccumulationRounds()
      );
    },
    finishRound: () => sharedBinding.controller.restoreSunDiscCenter(),
    get renderProgressive() {
      if (!isTiledBufferEnabled()) return undefined;
      return (
        camera: THREE.Camera,
        frame: Readonly<{
          width: number;
          height: number;
          viewKey: string;
          styleEpoch: number;
          active: boolean;
        }>
      ) => {
        if (!softSunShadowsEnabled || timeAnimating || !nativeAccumulationFits)
          return null;
        return withTileVolumeSnapshot(() => {
          if (shouldUseBootstrapPreview()) return null;
          const tiles = updateTiledScene();
          if (!tiles) return null;
          const result = tiles.renderProgressive(camera, {
            ...frame,
            samples: getSunDiscAccumulationRounds(),
            maxRenderTargetPixels: maxAccumulationPixels,
            options: accumulationOptions,
          });
          debugPublisher.publish();
          return result;
        });
      };
    },
    renderScene: (camera: THREE.Camera, round: number | null) => {
      // Decision: LIVE-HARD-SHADOW-20260910 in
      // three/CORRIDOR_PERFORMANCE_20260909.md. Point light and animation use
      // the host's direct centre-sun draw, not receiver capture/restore queues.
      // The controller runtime still updates sunward caster coverage above.
      if (!softSunShadowsEnabled || timeAnimating || !isTiledBufferEnabled())
        return false;
      return withTileVolumeSnapshot(() => {
        // A common centre-sun pass includes every currently loaded caster;
        // unlike page-by-page replay it leaves time for the remaining loads.
        if (shouldUseBootstrapPreview()) return false;
        const tiles = updateTiledScene();
        if (!tiles) return false;
        const rendered = tiles.render(
          camera,
          round,
          getSunDiscAccumulationRounds(),
          !mapInMotion
        );
        // A trailing publication includes the final page counters even when
        // convergence stops repaints before the next debug interval.
        debugPublisher.publish();
        return rendered;
      });
    },
  };
  sceneLease.layer.setAccumulationController?.(accumulationController);
  const refreshSharedShadowCoverage = () => {
    cachedElevationRange = null;
    coverageNeedsCameraReevaluation = true;
    updateSharedShadowCoverage();
  };
  refreshTerrainShadowState = (changedBounds) => {
    invalidateShadowMap(changedBounds);
    refreshSharedShadowCoverage();
  };

  const handleMoveStart = () => {
    idleTerrainPrefetch.cancel();
    tiledScene?.pausePending();
    shadowFrameBudget = updateShadowFrameBudget(
      shadowFrameBudget,
      performance.now(),
      false
    );
    mapInMotion = true;
    coverageNeedsCameraReevaluation = true;
  };
  const handleMove = () => {
    idleTerrainPrefetch.cancel();
    coverageNeedsCameraReevaluation = true;
  };
  const handleMoveEnd = () => {
    mapInMotion = false;
    shadowFrameBudget = updateShadowFrameBudget(
      shadowFrameBudget,
      performance.now(),
      false
    );
    if (contentRefreshPendingAfterMove) {
      contentRefreshPendingAfterMove = false;
      handleSharedSceneContentChanged();
    } else {
      refreshSharedShadowCoverage();
    }
    if (latestAtmosphericSunlight) {
      mapLibreLight.flush(latestAtmosphericSunlight);
    }
    if (appliedRuntimeShadowView !== latestShadowView) {
      applyRuntimeShadowView(latestShadowView);
    }
  };
  const handleResize = () => {
    handleMove();
    map.triggerRepaint();
  };
  map.on(MAPLIBRE_EVENT.MOVE_START, handleMoveStart);
  map.on(MAPLIBRE_EVENT.MOVE, handleMove);
  map.on(MAPLIBRE_EVENT.MOVE_END, handleMoveEnd);
  map.on(MAPLIBRE_EVENT.RESIZE, handleResize);
  const watchTerrainRuntime = (runtime: NonNullable<typeof terrainRuntime>) => {
    void runtime.ready.then((loaded) => {
      if (!loaded || disposed || terrainRuntime !== runtime) return;
      initialTerrainStageReady = true;
      refreshSharedShadowCoverage();
      map.triggerRepaint();
    });
  };
  const syncTerrainRuntime = () => {
    const nextProviders = getSharedThreeSceneRuntimes(map).filter(
      (runtime) => runtime.providesTerrain
    );
    if (
      nextProviders.length !== surfaceProviders.length ||
      nextProviders.some((runtime) => !surfaceProviders.includes(runtime))
    ) {
      surfaceProviders = nextProviders;
      // Decision: MESH-FIRST-20260908 in three/TILED_SHADOW_PAGES.md.
      // Release the previous surface's buffers once, never on tile arrivals.
      releaseTiledScene();
      sceneLease.layer.setAccumulationController?.(null);
      sceneLease.layer.setAccumulationController?.(accumulationController);
      for (const light of sharedBinding.controller.lights) {
        if (!light.shadow.map) continue;
        disposeShadowDepthPage(light.shadow.map);
        light.shadow.map = null;
      }
      invalidateShadowPresentation();
    }
    const meshProvidesTerrain = sharedSceneProvidesTerrain();
    if (!terrain) return;
    if (meshProvidesTerrain) {
      idleTerrainPrefetch.cancel();
      initialTerrainStageReady = true;
      const runtime = terrainRuntime;
      terrainRuntime = null;
      if (runtime && sceneLease.layer.hasRuntime(runtime.id)) {
        sceneLease.layer.removeRuntime(runtime.id);
      }
      cachedElevationRange = null;
      coverageNeedsCameraReevaluation = true;
      return;
    }
    if (terrainRuntime) return;

    const runtime = buildTerrainRuntime();
    if (!runtime) return;
    idleTerrainPrefetch.cancel();
    initialTerrainStageReady = false;
    terrainRuntime = runtime;
    runtime.setMaterialColor(`#${terrainColor.getHexString()}`);
    runtime.setShadowView(appliedRuntimeShadowView);
    sceneLease.layer.addRuntime(runtime);
    watchTerrainRuntime(runtime);
    cachedElevationRange = null;
    coverageNeedsCameraReevaluation = true;
  };
  if (terrainRuntime) {
    watchTerrainRuntime(terrainRuntime);
  }
  updateSharedShadowCoverage();

  const syncGenericBridges = () => {
    if (disposed) return;
    const currentLayers = new Set(getGenericThreeLayers(map));
    for (const [layer, bridge] of genericBridges) {
      if (currentLayers.has(layer)) continue;
      sceneLease.layer.removeRuntime(bridge.runtime.id);
      genericBridges.delete(layer);
    }
    for (const layer of currentLayers) {
      const bridge = genericBridges.get(layer);
      if (bridge) {
        bridge.sync();
        continue;
      }
      if (!layer.scene) continue;
      const nextBridge = buildGenericThreeShadowBridge(
        sceneLease.layer,
        layer,
        latestBuildingAppearance
      );
      if (nextBridge) genericBridges.set(layer, nextBridge);
    }
    makeSceneMeshesShadeable(
      sceneLease.layer.getScene(),
      sharedSceneProvidesTerrain()
    );
    refreshSharedShadowCoverage();
    map.triggerRepaint();
  };

  const unsubscribeGenericLayers = subscribeGenericThreeLayers(
    map,
    syncGenericBridges
  );
  syncGenericBridges();
  syncMeshLabelStyle();

  const handleSharedSceneContentChanged = () => {
    if (disposed) return;
    if (contentChangeTimer) {
      window.clearTimeout(contentChangeTimer);
      contentChangeTimer = 0;
    }
    if (fullContentInvalidationPending) tiledScene?.invalidateContent();
    else if (changedContentBoundsPending.length > 0) {
      tiledScene?.invalidateContent(changedContentBoundsPending);
    }
    fullContentInvalidationPending = false;
    changedContentBoundsPending.length = 0;
    idleTerrainPrefetch.cancel();
    syncTerrainRuntime();
    releaseMapLibreTerrain.refresh();
    syncMeshLabelStyle();
    for (const runtime of getSharedThreeSceneRuntimes(map)) {
      if (runtime.providesTerrain) {
        runtime.setErrorTargetOverride?.(latestMeshErrorTarget);
        if (
          !meshCacheBudgets.has(runtime) ||
          meshCacheBudgets.get(runtime) !== latestMeshCacheBudget
        ) {
          runtime.setCacheBudget?.(latestMeshCacheBudget);
          meshCacheBudgets.set(runtime, latestMeshCacheBudget);
        }
      }
      runtime.setShadowSimulationStyle?.(latestBuildingAppearance);
    }
    // New terrain providers receive the current shadow-selection envelope,
    // while existing ones keep their stationary-view signature. Refitting the
    // light to freshly streamed terrain must not restart terrain traversal.
    applyRuntimeShadowView(appliedRuntimeShadowView);
    // Native tile runtimes configure only the arriving model subtree. A full
    // scene traversal is reserved for generic Three layers that do not expose
    // that lifecycle hook.
    if (genericBridges.size > 0) {
      makeSceneMeshesShadeable(
        sceneLease.layer.getScene(),
        sharedSceneProvidesTerrain()
      );
    }
    sharedBinding.controller.invalidate();
    sharedBinding.dirty = true;
    coverageNeedsCameraReevaluation = true;
    // A tile arrival changes geometry, not the sun. Fit once with the next
    // render camera, using the runtime's cached model bounds. Calling the
    // generic refresh here also walked the whole scene and reevaluated the
    // atmosphere before doing the same camera fit in the next render.
    cachedElevationRange = null;
    map.triggerRepaint();
  };
  const scheduleSharedSceneContentChanged = (
    change?: Readonly<{
      bounds?: readonly THREE.Box3[];
      roots?: readonly THREE.Object3D[];
    }>
  ) => {
    if (disposed) return;
    const changedBounds = change?.bounds;
    if (change === undefined) {
      const providers = getSharedThreeSceneRuntimes(map).filter(
        (runtime) => runtime.providesTerrain
      );
      if (
        providers.length !== surfaceProviders.length ||
        providers.some((runtime) => !surfaceProviders.includes(runtime))
      ) {
        // Runtime membership changes surface ownership immediately. Keeping the
        // startup drape override until reload paints the basemap over a late mesh.
        // Geometry arrivals still use the bounded content-refresh cadence below.
        syncTerrainRuntime();
        releaseMapLibreTerrain.refresh();
        syncMeshLabelStyle();
      }
    }
    // Native runtimes already know the exact published GLTF subtree. Apply
    // receiver-plane PCF there synchronously so its first shaded frame does not
    // use the acne-prone stock comparison. This replaces the old full-scene
    // traversal without making correctness depend on the later batch refresh.
    for (const root of change?.roots ?? []) {
      makeSceneMeshesShadeable(root, sharedSceneProvidesTerrain());
    }
    // An explicit empty delta registers an unpublished model or changes only
    // its appearance. It must not refit the sun or invalidate active integrals.
    // The atomic receiver/caster cut publishes geometry bounds separately.
    if (changedBounds?.length === 0) {
      map.triggerRepaint();
      return;
    }
    if (changedBounds === undefined) {
      fullContentInvalidationPending = true;
    } else if (changedBounds.length > 0) {
      // A native tile publication carries exact world bounds. Invalidate only
      // pages whose caster corridor intersects that delta; unrelated finished
      // hard and sun-disc captures remain reusable.
      changedContentBoundsPending.push(
        ...changedBounds.map((bounds) => bounds.clone())
      );
    }
    idleTerrainPrefetch.cancel();
    // Native runtimes publish stable tile-volume IDs. Diff that committed cut
    // at render entry; parsing another offscreen tile must not restart EVERY
    // corridor. Unknown generic geometry still requires a conservative reset.
    if (
      changedBounds === undefined &&
      getCoverageRuntimes().some(
        (runtime) =>
          runtime !== shadowControllerRuntime && !runtime.getActiveTileVolumes
      )
    )
      fullContentInvalidationPending = true;
    if (mapInMotion) {
      // Loading continues, but camera input never pays for repeated global
      // shadow invalidation. One consolidated refresh runs at moveend.
      contentRefreshPendingAfterMove = true;
      map.triggerRepaint();
      return;
    }
    map.triggerRepaint();
    // Fixed-cadence batching, not a trailing debounce: a continuous tile
    // stream still publishes progress once per second, but cannot refit the
    // whole viewport shadow envelope once per model completion. Exact changed
    // bounds above invalidate only the intersecting tiled corridors.
    if (contentChangeTimer) return;
    contentChangeTimer = window.setTimeout(() => {
      contentChangeTimer = 0;
      handleSharedSceneContentChanged();
    }, STREAMED_CONTENT_REFRESH_INTERVAL_MS);
  };
  const unsubscribeSharedSceneContent = subscribeSharedThreeSceneContent(
    map,
    scheduleSharedSceneContentChanged
  );
  // Coverage and interaction take priority over finite-disc refinement. Wake
  // the renderer when loading finishes even if the last tile was already cached.
  const unsubscribeTerrainLoading = subscribeSharedThreeTerrainLoading(
    map,
    () => {
      if (isSharedThreeTerrainLoading(map)) idleTerrainPrefetch.cancel();
      if (!disposed) map.triggerRepaint();
    }
  );
  handleSharedSceneContentChanged();

  const applyMapLibreLight = (position: SolarPosition) => {
    const sample =
      latestAtmosphericSunlight ?? evaluateAtmosphericSunlightForMap(position);
    if (sample) mapLibreLight.apply(sample);
  };

  const updateSolarPosition = (position: SolarPosition) => {
    if (latestSolarPosition?.instant.getTime() === position.instant.getTime()) {
      return;
    }
    tiledScene?.cancelPending(true);
    invalidateShadowPresentation();
    latestSolarPosition = position;
    updateSharedShadowCoverage();
    applyMapLibreLight(position);
  };

  const restoreLighting = () => {
    if (disposed) return;
    if (latestSolarPosition) applyMapLibreLight(latestSolarPosition);
  };

  map.on(MAPLIBRE_EVENT.STYLE_LOAD, restoreLighting);

  const refreshProjectionDebug = () => {
    debugPublisher.markStale();
    sharedBinding.dirty = true;
    map.triggerRepaint();
  };
  const unsubscribeDebugDemand = subscribeShadowProjectionDebugDemand(
    map,
    (active) => {
      if (active) {
        // React.lazy may finish after the scene has already settled. Capture
        // only once the panel actually subscribes, without a camera move.
        refreshProjectionDebug();
      } else {
        debugPublisher.reset();
      }
    }
  );

  return {
    updateSolarPosition,
    updateMeshCacheBudget(bytes) {
      if (mobileBaseline)
        bytes = Math.min(
          bytes ?? MOBILE_MESH_CACHE_BYTES,
          MOBILE_MESH_CACHE_BYTES
        );
      const next =
        bytes !== undefined && Number.isFinite(bytes) && bytes > 0
          ? bytes
          : undefined;
      if (
        latestMeshCacheBudget === next &&
        getSharedThreeSceneRuntimes(map)
          .filter((runtime) => runtime.providesTerrain)
          .every(
            (runtime) =>
              meshCacheBudgets.has(runtime) &&
              meshCacheBudgets.get(runtime) === next
          )
      )
        return;
      latestMeshCacheBudget = next;
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        if (!runtime.providesTerrain) continue;
        runtime.setCacheBudget?.(next);
        meshCacheBudgets.set(runtime, next);
      }
      map.triggerRepaint();
    },
    updateTerrain(nextTerrain) {
      if (terrain === nextTerrain) return;
      idleTerrainPrefetch.cancel();
      terrain = nextTerrain;
      if (!nextTerrain || sharedSceneProvidesTerrain()) return;
      const previous = terrainRuntime;
      const replacement = buildTerrainRuntime(previous?.originLngLat);
      if (!replacement) return;
      replacement.setMaterialColor(`#${terrainColor.getHexString()}`);
      replacement.setShadowView(appliedRuntimeShadowView);
      // One runtime owns the mixed old/new quadtree cut. This keeps borders
      // stitched across sources and preserves receivers while tiles arrive.
      if (previous) replacement.adoptPresentation(previous);
      terrainRuntime = replacement;
      sceneLease.layer.addRuntime(replacement);
      if (previous) sceneLease.layer.removeRuntime(previous.id);
      watchTerrainRuntime(replacement);
      cachedElevationRange = null;
      coverageNeedsCameraReevaluation = true;
      invalidateShadowPresentation();
      refreshTerrainShadowState();
      map.triggerRepaint();
    },
    updateTerrainColor(color) {
      const nextColor = new THREE.Color(color);
      if (terrainColor.equals(nextColor)) return;
      invalidateShadowPresentation();
      terrainRuntime?.setMaterialColor(color);
      sharedBinding.atmosphericSky.updateGroundAlbedo(nextColor);
      terrainColor = nextColor;
    },
    updateMeshErrorTarget(errorTarget) {
      if (latestMeshErrorTarget === errorTarget) return;
      latestMeshErrorTarget = errorTarget;
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        runtime.setErrorTargetOverride?.(errorTarget);
      }
      map.triggerRepaint();
    },
    updateBuildingAppearance(appearance) {
      if (
        latestBuildingAppearance.fullOpacity === appearance.fullOpacity &&
        latestBuildingAppearance.uniformColor === appearance.uniformColor &&
        (latestBuildingAppearance.uniformColorMix ?? 1) ===
          (appearance.uniformColorMix ?? 1) &&
        (latestBuildingAppearance.textureSaturation ?? 1) ===
          (appearance.textureSaturation ?? 1) &&
        (latestBuildingAppearance.textureColorCorrection ?? false) ===
          (appearance.textureColorCorrection ?? false)
      ) {
        return;
      }
      invalidateShadowPresentation();
      tiledScene?.invalidateContent();
      latestBuildingAppearance = appearance;
      for (const bridge of genericBridges.values()) {
        bridge.updateBuildingAppearance(appearance);
      }
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        runtime.setShadowSimulationStyle?.(appearance);
      }
      makeSceneMeshesShadeable(
        sceneLease.layer.getScene(),
        sharedSceneProvidesTerrain()
      );
      sharedBinding.controller.invalidate();
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    updateShadowQuality(quality) {
      if (mobileBaseline) quality = SHADOW_QUALITY.FPS_120;
      if (sharedBinding.shadowQuality === quality) return;
      invalidateShadowPresentation();
      sharedBinding.shadowQuality = quality;
      effectiveRenderQuality = resolveShadowRenderQuality(
        constrainMobileShadowRendering(renderQuality, mobileBaseline),
        quality
      );
      accumulationOptions = getAccumulationOptions();
      shadowFrameBudget = createShadowFrameBudget(quality);
      sharedBinding.dirty = true;
      updateSharedShadowCoverage();
      sharedBinding.controller.invalidate();
    },
    updateRenderQuality(options) {
      options = constrainMobileShadowRendering(options, mobileBaseline);
      const previous = effectiveRenderQuality;
      const next = resolveShadowRenderQuality(
        options,
        sharedBinding.shadowQuality
      );
      renderQuality = { ...options };
      effectiveRenderQuality = next;
      const adaptationChanged =
        previous.shadowAdaptiveQuality !== next.shadowAdaptiveQuality;
      if (
        adaptationChanged ||
        previous.shadowBufferLayout !== next.shadowBufferLayout
      ) {
        shadowFrameBudget = createShadowFrameBudget(
          sharedBinding.shadowQuality
        );
      }
      if (
        !adaptationChanged &&
        previous.shadowBufferLayout === next.shadowBufferLayout &&
        previous.shadowBufferFormat === next.shadowBufferFormat &&
        previous.shadowSunDiscSamples === next.shadowSunDiscSamples &&
        previous.shadowMsaaSamples === next.shadowMsaaSamples &&
        previous.shadowGroundTexelFit === next.shadowGroundTexelFit
      ) {
        return;
      }
      accumulationOptions = getAccumulationOptions();
      invalidateShadowPresentation();
      if (previous.shadowBufferLayout !== next.shadowBufferLayout) {
        releaseTiledScene();
        coverageNeedsCameraReevaluation = true;
      }
      if (
        adaptationChanged ||
        previous.shadowGroundTexelFit !== next.shadowGroundTexelFit ||
        previous.shadowBufferLayout !== next.shadowBufferLayout
      ) {
        sharedBinding.dirty = true;
        sharedBinding.controller.invalidate();
      }
      debugPublisher.publish();
      map.triggerRepaint();
    },
    updateSoftSunShadows(enabled) {
      enabled = enabled && !mobileBaseline;
      if (softSunShadowsEnabled === enabled) return;
      invalidateShadowPresentation();
      softSunShadowsEnabled = enabled;
      releaseTiledScene();
      sharedBinding.controller.setSoftSun(enabled);
      sharedBinding.controller.invalidate();
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    updateTimeAnimating(animating) {
      if (timeAnimating === animating) return;
      idleTerrainPrefetch.cancel();
      timeAnimating = animating;
      if (animating) tiledScene?.pausePending();
      if (!animating) {
        mapLibreLight.flush();
        lastAnimatedRuntimeShadowViewMs = Number.NEGATIVE_INFINITY;
        if (runtimeShadowViewDeferredByAnimation && !mapInMotion) {
          applyRuntimeShadowView(latestShadowView);
        }
        sharedBinding.dirty = true;
      }
      map.triggerRepaint();
    },
    refreshProjectionDebug,
    updateShadowIntensity(intensity) {
      const nextIntensity = clamp(intensity, 0, 1);
      if (latestShadowIntensity === nextIntensity) return;
      invalidateShadowPresentation();
      latestShadowIntensity = nextIntensity;
      sharedBinding.shadowIntensity = latestShadowIntensity;
      for (const light of sharedBinding.controller.lights) {
        light.shadow.intensity = latestShadowIntensity;
      }
      map.triggerRepaint();
    },
    updateMapStyleContentVisibility(visible) {
      if (mapStyleContentVisible === visible) return;
      mapStyleContentVisible = visible;
      syncMapStyleContentVisibility();
      map.triggerRepaint();
    },
    updateMapStyleElevationVisibility(lines, labels) {
      sceneLease.setMapStyleElevationVisibility(lines, labels);
      map.triggerRepaint();
    },
    updateMapStyleLabelOverlayVisibility(visible) {
      sceneLease.setPointLabelOverlayVisible(visible);
      map.triggerRepaint();
    },
    updateSunDebugVectorVisibility(visible) {
      if (sharedBinding.sunVectorVisible === visible) return;
      invalidateShadowPresentation();
      sharedBinding.sunVectorVisible = visible;
      sharedBinding.sunVectorRoot.visible = visible && !!latestSolarPosition;
      if (!visible) {
        sharedBinding.frame.remove(sharedBinding.sunVectorRoot);
        if (sharedBinding.sunVector) {
          sharedBinding.sunVectorRoot.remove(sharedBinding.sunVector.root);
          sharedBinding.sunVector.dispose();
          sharedBinding.sunVector = null;
        }
      } else {
        sharedBinding.frame.add(sharedBinding.sunVectorRoot);
        void import("./shadow-sun-vector")
          .then(({ buildSunVector }) => {
            // Closing the panel or disposing the scene while the chunk loads
            // must not resurrect debug geometry or allocate GPU resources.
            if (
              disposed ||
              !sharedBinding.sunVectorVisible ||
              sharedBinding.sunVector
            )
              return;
            const vector = buildSunVector();
            sharedBinding.sunVector = vector;
            sharedBinding.sunVectorRoot.add(vector.root);
            vector.update(
              sharedBinding.center,
              sharedBinding.directionToSun,
              sharedBinding.sunVectorLengthMeters
            );
            vector.root.visible = true;
            sharedBinding.sunVectorRoot.visible = !!latestSolarPosition;
            map.triggerRepaint();
          })
          .catch((error: unknown) => {
            if (!disposed)
              console.error("Unable to load sun-vector diagnostics", error);
          });
      }
      map.triggerRepaint();
    },
    updateAtmosphericLutUsage(options) {
      if (
        atmosphericSunlightOptions.useTransmittanceLut ===
          options.useTransmittanceLut &&
        atmosphericSunlightOptions.useIrradianceLut === options.useIrradianceLut
      ) {
        return;
      }
      invalidateShadowPresentation();
      atmosphericSunlightOptions = options;
      latestAtmosphericSunlight = null;
      if (latestSolarPosition) {
        evaluateAtmosphericSunlightForMap(latestSolarPosition);
        invalidateShadowMap();
      }
      map.triggerRepaint();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      idleTerrainPrefetch.dispose();
      unsubscribeDebugDemand();
      releaseTiledScene();
      debugPublisher.dispose();
      if (contentChangeTimer) window.clearTimeout(contentChangeTimer);
      mapLibreLight.dispose();
      clearShadowProjectionDebugSnapshot(map);
      map.off(MAPLIBRE_EVENT.STYLE_LOAD, restoreLighting);
      map.off(MAPLIBRE_EVENT.MOVE_START, handleMoveStart);
      map.off(MAPLIBRE_EVENT.MOVE, handleMove);
      map.off(MAPLIBRE_EVENT.MOVE_END, handleMoveEnd);
      map.off(MAPLIBRE_EVENT.RESIZE, handleResize);
      unsubscribeGenericLayers();
      unsubscribeSharedSceneContent();
      unsubscribeTerrainLoading();
      latestShadowView = null;
      applyRuntimeShadowView(null);
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        runtime.setShadowSimulationStyle?.(null);
        runtime.setErrorTargetOverride?.(null);
      }
      for (const bridge of genericBridges.values()) {
        if (sceneLease.layer.hasRuntime(bridge.runtime.id)) {
          sceneLease.layer.removeRuntime(bridge.runtime.id);
        }
      }
      genericBridges.clear();
      try {
        restoreMapLibreStyleLayers?.();
      } catch {
        // The style may already be gone during map teardown.
      }
      restoreMapLibreStyleLayers = null;
      sceneLease.layer.setMapStyleProjectionVisible?.(true);
      releaseMapLibreTerrain();
      if (sceneLease.layer.hasRuntime(shadowControllerRuntime.id)) {
        sceneLease.layer.removeRuntime(shadowControllerRuntime.id);
      }
      if (terrainRuntime && sceneLease.layer.hasRuntime(terrainRuntime.id)) {
        sceneLease.layer.removeRuntime(terrainRuntime.id);
      }
      atmosphericSunlight.dispose();
      disposeShadowLightBinding(sharedBinding);
      sceneLease.layer.setAccumulationController?.(null);
      sceneLease.release();
      try {
        if (map.isStyleLoaded()) {
          map.setLight(previousLight);
        }
      } catch {
        // Nothing remains to restore after map teardown.
      }
    },
  };
};
