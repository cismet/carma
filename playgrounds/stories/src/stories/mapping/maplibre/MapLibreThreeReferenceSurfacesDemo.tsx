import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN,
  WUPP_MESH_2024,
  type GeoreferencedLandmark,
} from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  buildThreeTilesRuntime,
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
  type ThreeTilesRuntime,
} from "@carma-mapping/engines/maplibre";
import { buildRasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import {
  SHADOW_TERRAIN_QUALITY,
  getSolarPosition,
  ShadowSimulationView,
  type MeshErrorTargetPixels,
  type ShadowDateState,
  type ShadowSimulationState,
} from "@carma-mapping/shadow-simulation";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import { type Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";

import meshParityStyle from "./data/mesh2024-cesium-parity.style.json";
import { createReferenceLandmarks } from "./reference-landmarks";
import { ReferenceAngularGuideOverlay } from "./ReferenceAngularGuideOverlay";
import {
  ReferenceSurfaceDiagnostics,
  type LoadStatus,
  type StatusKey,
} from "./ReferenceSurfaceDiagnostics";
import {
  createNivellementMaterial,
  createNivellementRuntime,
  createNivellementValidationGeometry,
  loadNivellementPoints,
  type NivellementPoint,
  type DistanceSummaries,
} from "./reference-nivellement";
import {
  useReferenceSurfaceStoryMap,
  useReferenceSurfaceMapLifecycle,
  type ReferenceSurfaceStoryDiagnostics,
} from "./reference-surface-story-map";
import {
  ELEVATION_COLOR_DATUM,
  elevationColorDatumNumber,
  type ElevationColorDatum,
} from "./reference-elevation-shader";
import {
  REFERENCE_ATMOSPHERE_MODE,
  type ReferenceAtmosphereMode,
  type ReferenceAtmosphereOptions,
} from "./reference-atmosphere-shader";
import {
  REFERENCE_CAMERA_PRESET,
  REFERENCE_PHYSICAL_CAMERA_POSES,
  type ReferencePhysicalCameraPose,
  type ReferenceCameraPreset,
} from "./reference-camera-presets";
import {
  REFERENCE_SURFACE,
  TERRAIN_GEOMETRY_MODE,
  TERRAIN_HEIGHT_DATUM,
  type ReferenceSurface,
  type TerrainGeometryMode,
  type TerrainHeightDatum,
} from "./reference-surface-types";
import {
  createGcg2016ShaderField,
  sampleGcg2016Field,
  type Gcg2016ShaderField,
} from "./reference-gcg2016-field";
import { createReferenceFrame, mutableLngLat } from "./reference-surface-frame";
import { createReferenceSurfaceRuntime } from "./reference-surface-runtime";
import { createReferenceComparisonProjector } from "./reference-surface-comparison-projection";
import { useReferencePhysicalCamera } from "./use-reference-physical-camera";
import { useReferenceMetricRange } from "./use-reference-metric-range";
import {
  disposeTerrainReferenceDepthMaterial,
  patchTerrainReferenceShader,
  updateTerrainReferenceShader,
  type TerrainShaderBinding,
} from "./reference-terrain-shader";
import {
  patchEcefMeshElevationShader,
  updateMeshElevationShader,
  type MeshElevationShaderBinding,
} from "./reference-mesh-elevation-shader";

import "maplibre-gl/dist/maplibre-gl.css";

const STORY_CENTER: [number, number] = [7.1999207, 51.2725716];
const REFERENCE_RUNTIME_ID = "story-reference-surfaces";
const TERRAIN_RUNTIME_ID = "story-reference-terrain";
const MESH_RUNTIME_ID = "story-mesh-2024";
const NIV_RUNTIME_ID = "story-nivellement-points";
const CURVED_TERRAIN_BOUNDS = [1500, 1500, 1500] as const;
const DATUM_TERRAIN_BOUNDS = [0, 64, 0] as const;
const FLAT_TERRAIN_BOUNDS = [0, 0, 0] as const;

type TerrainAppearance = "viridis" | "basemap" | "pixel-error";
type TerrainModel = "dgm1" | "dom1";
type MeshAppearance = "imagery" | "elevation";

export type MapLibreThreeReferenceSurfacesOptions = {
  elevationAnchor?: readonly [number, number];
  elevationAnchorNormalHeightMeters?: number;
  /** Sample the diagnostic scalar at rest; never traverse mesh vertices. */
  autoMetricRange?: boolean;
  elevationIsolines?: boolean;
  elevationColorDatum?: ElevationColorDatum;
  meshEncodedHeightDatum?: TerrainHeightDatum;
  embedded?: boolean;
  panelLabel?: string;
  showDiagnostics?: boolean;
  lockCamera?: boolean;
  onMapReady?: (map: MapLibreMap) => void | (() => void);
  compareGeometryModes?: boolean;
  /** Bounded local comparison, not the long-range viewshed workload. */
  boundedComparison?: boolean;
  showLocalTangentPlane: boolean;
  showLocalSphere: boolean;
  showEllipsoid: boolean;
  showQuasigeoid: boolean;
  showTerrain: boolean;
  showNivellementPoints: boolean;
  showMesh2024: boolean;
  landmarks?: readonly GeoreferencedLandmark[];
  referenceRadiusMeters: number;
  referenceOpacity: number;
  referenceVerticalScale: number;
  referenceVerticalOffsetMeters: number;
  localSphereRadiusMeters: number;
  terrainGeometryMode: TerrainGeometryMode;
  terrainHeightDatum: TerrainHeightDatum;
  terrainModel: TerrainModel;
  terrainAppearance: TerrainAppearance;
  autoElevationRange: boolean;
  terrainErrorTargetPixels: MeshErrorTargetPixels;
  terrainElevationMinimumMeters: number;
  terrainElevationMaximumMeters: number;
  meshErrorTargetPixels: MeshErrorTargetPixels;
  meshOpacity: number;
  meshAppearance: MeshAppearance;
  validationSurface: ReferenceSurface;
  validationColorLimitMeters: number;
  nivellementPointSizePixels: number;
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  fovDegrees: number;
  showAngularGuideLines: boolean;
  angularGuideSpacingDegrees: number;
  horizonReference?: "local-horizontal" | "ellipsoid";
  cameraPreset: ReferenceCameraPreset;
  physicalCamera?: ReferencePhysicalCameraPose;
  atmosphereMode: ReferenceAtmosphereMode;
  atmosphereVisibilityKilometers: number;
  atmosphereScaleHeightMeters: number;
  atmosphereObserverEllipsoidalHeightMeters: number;
  atmosphereColor: string;
  showShadowSimulation: boolean;
  shadowDayOfYear: number;
  shadowMinutes: number;
  shadowAreaMeters: number;
  softSunShadows: boolean;
};

type TerrainRuntime = ReturnType<typeof buildRasterDemTerrainRuntime>;

const initialStatus: LoadStatus = {
  gcg2016: "loading bundled coefficients",
  terrain: "disabled",
  mesh: "disabled",
  nivellement: "disabled",
};

const sampleTerrainViewportHeightRange = (
  runtime: TerrainRuntime,
  map: MapLibreMap
): readonly [number, number] | null => {
  const canvas = map.getCanvas();
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  const divisions = 8;
  for (let row = 0; row <= divisions; row += 1) {
    for (let column = 0; column <= divisions; column += 1) {
      const lngLat = map.unproject([
        (canvas.clientWidth * column) / divisions,
        (canvas.clientHeight * row) / divisions,
      ]);
      const height = runtime.getElevation(lngLat.lng, lngLat.lat);
      if (height === undefined || !Number.isFinite(height)) continue;
      minimum = Math.min(minimum, height);
      maximum = Math.max(maximum, height);
    }
  }
  return Number.isFinite(minimum) && Number.isFinite(maximum)
    ? [minimum, maximum]
    : null;
};

export const MapLibreThreeReferenceSurfacesDemo = (
  options: MapLibreThreeReferenceSurfacesOptions
) => {
  const diagnosticId = useId();
  const diagnosticRef = useRef<ReferenceSurfaceStoryDiagnostics>({});
  diagnosticRef.current.panelLabel = options.panelLabel;
  const storyDiagnostics = () => diagnosticRef.current;
  const currentStoryDiagnostics = () => diagnosticRef.current;
  const storyMap = useReferenceSurfaceStoryMap(options);
  const {
    containerRef,
    sharedLayerOriginRef,
    mapRef,
    map,
    styleReady,
    viewAngles,
  } = storyMap;
  const terrainRef = useRef<TerrainRuntime | null>(null);
  const terrainBindingsRef = useRef<Set<TerrainShaderBinding>>(new Set());
  const meshBindingsRef = useRef<Set<MeshElevationShaderBinding>>(new Set());
  const meshRef = useRef<ThreeTilesRuntime | null>(null);
  const nivellementMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const [gcgField, setGcgField] = useState<Gcg2016ShaderField | null>(null);
  const [nivellementPoints, setNivellementPoints] = useState<
    readonly NivellementPoint[] | null
  >(null);
  const [terrainRuntimeMounted, setTerrainRuntimeMounted] = useState(false);
  const [terrainRevision, setTerrainRevision] = useState(0);
  const isolinesRef = useRef(options.elevationIsolines ?? false);
  isolinesRef.current = options.elevationIsolines ?? false;
  const colorDatumRef = useRef(
    options.elevationColorDatum ?? ELEVATION_COLOR_DATUM.ELLIPSOIDAL
  );
  colorDatumRef.current =
    options.elevationColorDatum ?? ELEVATION_COLOR_DATUM.ELLIPSOIDAL;
  const encodedHeightDatumRef = useRef(options.meshEncodedHeightDatum);
  encodedHeightDatumRef.current = options.meshEncodedHeightDatum;
  const [terrainViewElevationRange, setTerrainViewElevationRange] = useState<
    readonly [number, number] | null
  >(null);
  const [meshViewElevationRange, setMeshViewElevationRange] = useState<
    readonly [number, number] | null
  >(null);
  const [distanceSummaries, setDistanceSummaries] = useState<DistanceSummaries>(
    {}
  );
  const [status, setStatus] = useState<LoadStatus>(initialStatus);
  const physicalCameraPose =
    options.physicalCamera ??
    (options.cameraPreset === REFERENCE_CAMERA_PRESET.MAP_TARGET
      ? null
      : REFERENCE_PHYSICAL_CAMERA_POSES[options.cameraPreset]);
  const referenceOrigin = useMemo<readonly [number, number]>(
    () =>
      options.elevationAnchor ?? physicalCameraPose?.eyeLngLat ?? STORY_CENTER,
    [physicalCameraPose, options.elevationAnchor]
  );
  const frame = useMemo(
    () =>
      createReferenceFrame(
        referenceOrigin,
        options.localSphereRadiusMeters,
        options.elevationAnchorNormalHeightMeters
      ),
    [
      options.localSphereRadiusMeters,
      options.elevationAnchorNormalHeightMeters,
      referenceOrigin,
    ]
  );
  // A/B comparison retains one tile pool with bounds valid for both modes;
  // switching the display changes uniforms, not requests or decoded geometry.
  const terrainBoundsPadding =
    options.compareGeometryModes ||
    options.terrainGeometryMode !== TERRAIN_GEOMETRY_MODE.MERCATOR
      ? CURVED_TERRAIN_BOUNDS
      : options.terrainHeightDatum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
      ? DATUM_TERRAIN_BOUNDS
      : FLAT_TERRAIN_BOUNDS;
  const observerEllipsoidalHeightMeters =
    physicalCameraPose && gcgField
      ? physicalCameraPose.eyeNormalHeightMeters +
        sampleGcg2016Field(
          gcgField,
          frame,
          physicalCameraPose.eyeLngLat[0],
          physicalCameraPose.eyeLngLat[1]
        )
      : options.atmosphereObserverEllipsoidalHeightMeters;
  const atmosphere = useMemo<ReferenceAtmosphereOptions>(
    () => ({
      mode: options.atmosphereMode,
      visibilityMeters: options.atmosphereVisibilityKilometers * 1_000,
      scaleHeightMeters: options.atmosphereScaleHeightMeters,
      observerEllipsoidalHeightMeters,
      color: options.atmosphereColor,
    }),
    [
      observerEllipsoidalHeightMeters,
      options.atmosphereColor,
      options.atmosphereMode,
      options.atmosphereScaleHeightMeters,
      options.atmosphereVisibilityKilometers,
    ]
  );
  const metricRange = useReferenceMetricRange(map, frame, gcgField, options);
  const effectiveElevationRange = useMemo<readonly [number, number]>(() => {
    if (options.autoMetricRange && metricRange) return metricRange;
    if (!options.autoElevationRange) {
      return [
        options.terrainElevationMinimumMeters,
        options.terrainElevationMaximumMeters,
      ];
    }
    const ranges: Array<readonly [number, number]> = [];
    if (options.showTerrain && terrainViewElevationRange) {
      const minimumUndulation =
        options.terrainHeightDatum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL &&
        gcgField
          ? gcgField.minimumMeters
          : 0;
      const maximumUndulation =
        options.terrainHeightDatum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL &&
        gcgField
          ? gcgField.maximumMeters
          : 0;
      ranges.push([
        terrainViewElevationRange[0] + minimumUndulation,
        terrainViewElevationRange[1] + maximumUndulation,
      ]);
    }
    if (options.showMesh2024 && meshViewElevationRange) {
      ranges.push(meshViewElevationRange);
    }
    if (ranges.length === 0) {
      return [
        options.terrainElevationMinimumMeters,
        options.terrainElevationMaximumMeters,
      ];
    }
    const minimum = Math.floor(Math.min(...ranges.map((range) => range[0])));
    const maximum = Math.ceil(Math.max(...ranges.map((range) => range[1])));
    return maximum - minimum >= 1
      ? [minimum, maximum]
      : [minimum - 0.5, maximum + 0.5];
  }, [
    gcgField,
    meshViewElevationRange,
    metricRange,
    options.autoMetricRange,
    options.autoElevationRange,
    options.showMesh2024,
    options.showTerrain,
    options.terrainElevationMaximumMeters,
    options.terrainElevationMinimumMeters,
    options.terrainHeightDatum,
    terrainViewElevationRange,
  ]);
  const [shadowState, setShadowState] = useState<ShadowSimulationState>(() => ({
    enabled: options.showShadowSimulation,
    terrainColor: "#d3d3d3",
    terrainQuality: SHADOW_TERRAIN_QUALITY.MAX,
    buildingsFullOpacity: true,
    buildingColorMix: 0,
    meshTextureSaturation: 1,
    meshTextureColorCorrection: true,
    buildingColor: "#ffffff",
    shadowQuality: 64,
    shadowAdaptiveQuality: true,
    meshErrorTarget: options.meshErrorTargetPixels,
    terrainErrorTarget: options.terrainErrorTargetPixels,
    showSunDebugVector: false,
    showProjectionDebugView: false,
    showDisplaySettings: false,
    showTileBounds: false,
    softSunShadows: options.softSunShadows,
    showMapStyleContent: true,
    showMapStyleLabels: false,
    showMapStyleElevationLines: false,
    showMapStyleElevationLabels: false,
    useTransmittanceLut: true,
    useSkyIrradianceLut: true,
    isAnimating: false,
    shadowIntensity: 1,
  }));
  const [shadowDateState, setShadowDateState] = useState<ShadowDateState>({
    year: 2026,
    dayOfYear: options.shadowDayOfYear,
    minutes: options.shadowMinutes,
    timeZone: "Europe/Berlin",
  });
  const solarPosition = useMemo(
    () =>
      getSolarPosition(shadowDateState, {
        longitude: referenceOrigin[0],
        latitude: referenceOrigin[1],
      }),
    [shadowDateState, referenceOrigin]
  );
  const terrainShaderConfigRef = useRef({
    frame,
    geometryMode: options.terrainGeometryMode,
    heightDatum: options.terrainHeightDatum,
    colorMinimumMeters: effectiveElevationRange[0],
    colorMaximumMeters: effectiveElevationRange[1],
    elevationColorEnabled: options.terrainAppearance === "viridis",
    atmosphere,
  });
  terrainShaderConfigRef.current = {
    frame,
    geometryMode: options.terrainGeometryMode,
    heightDatum: options.terrainHeightDatum,
    colorMinimumMeters: effectiveElevationRange[0],
    colorMaximumMeters: effectiveElevationRange[1],
    elevationColorEnabled: options.terrainAppearance === "viridis",
    atmosphere,
  };
  const meshShaderConfigRef = useRef({
    frame,
    colorMinimumMeters: effectiveElevationRange[0],
    colorMaximumMeters: effectiveElevationRange[1],
    atmosphere,
  });
  meshShaderConfigRef.current = {
    frame,
    colorMinimumMeters: effectiveElevationRange[0],
    colorMaximumMeters: effectiveElevationRange[1],
    atmosphere,
  };
  const terrainResource =
    options.terrainModel === "dom1"
      ? NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN
      : NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN;

  const setOneStatus = (key: StatusKey, value: string) =>
    setStatus((current) =>
      current[key] === value ? current : { ...current, [key]: value }
    );

  useReferenceSurfaceMapLifecycle(
    diagnosticId,
    diagnosticRef,
    options,
    storyMap
  );

  useEffect(() => {
    if (!map || map !== mapRef.current || !styleReady) return;
    // No flat raster underlay in a curved reference comparison. Keep the source
    // and authored style available when the real terrain drape needs them.
    map.setLayoutProperty(
      "layer-basemap",
      "visibility",
      options.showTerrain && options.terrainAppearance === "basemap"
        ? "visible"
        : "none"
    );
  }, [map, styleReady, options.showTerrain, options.terrainAppearance]);

  useEffect(() => {
    const sharedLayerOrigin = sharedLayerOriginRef.current;
    if (!map || map !== mapRef.current || !gcgField || !sharedLayerOrigin)
      return;
    storyDiagnostics().projectTerrainComparisonPoint =
      createReferenceComparisonProjector(
        map,
        sharedLayerOrigin,
        referenceOrigin,
        frame,
        gcgField
      );
    return () => {
      const diagnostics = currentStoryDiagnostics();
      if (diagnostics) delete diagnostics.projectTerrainComparisonPoint;
    };
  }, [frame, gcgField, map, referenceOrigin]);

  useReferencePhysicalCamera(
    map,
    mapRef,
    frame,
    gcgField,
    physicalCameraPose,
    terrainRuntimeMounted,
    options
  );

  useEffect(() => {
    setShadowState((current) => ({
      ...current,
      enabled: options.showShadowSimulation,
      meshErrorTarget: options.meshErrorTargetPixels,
      terrainErrorTarget: options.terrainErrorTargetPixels,
      softSunShadows: options.softSunShadows,
    }));
  }, [
    options.meshErrorTargetPixels,
    options.showShadowSimulation,
    options.softSunShadows,
    options.terrainErrorTargetPixels,
  ]);

  useEffect(() => {
    setShadowDateState((current) => ({
      ...current,
      dayOfYear: options.shadowDayOfYear,
      minutes: options.shadowMinutes,
    }));
  }, [options.shadowDayOfYear, options.shadowMinutes]);

  useEffect(() => {
    let cancelled = false;
    let field: Gcg2016ShaderField | null = null;
    setGcgField(null);
    setOneStatus("gcg2016", "loading bundled coefficients");
    void createGcg2016ShaderField(referenceOrigin)
      .then((loaded) => {
        field = loaded;
        if (cancelled) {
          loaded.texture.dispose();
          return;
        }
        setGcgField(loaded);
        storyDiagnostics().gcg2016 = loaded;
        setOneStatus(
          "gcg2016",
          `ready ${loaded.minimumMeters.toFixed(
            3
          )}–${loaded.maximumMeters.toFixed(3)} m`
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOneStatus(
          "gcg2016",
          `error ${error instanceof Error ? error.message : String(error)}`
        );
      });
    return () => {
      cancelled = true;
      const diagnostics = currentStoryDiagnostics();
      if (field && diagnostics?.gcg2016 === field) {
        delete diagnostics.gcg2016;
      }
      field?.texture.dispose();
    };
  }, [referenceOrigin]);

  useEffect(() => {
    if (!map || map !== mapRef.current || !styleReady || !gcgField) return;
    if (!options.landmarks?.length) return;
    const lease = acquireSharedThreeScene(map);
    const runtime = createReferenceLandmarks(
      frame,
      gcgField,
      options.terrainGeometryMode,
      options.terrainHeightDatum,
      options.landmarks
    );
    lease.layer.addRuntime(runtime);
    const unregister = registerSharedThreeSceneRuntime(map, runtime);
    notifySharedThreeSceneContentChanged(map, { roots: [runtime.root] });
    return () => {
      unregister();
      lease.layer.removeRuntime(runtime.id);
      lease.release();
    };
  }, [
    frame,
    gcgField,
    map,
    styleReady,
    options.landmarks,
    options.terrainGeometryMode,
    options.terrainHeightDatum,
  ]);

  useEffect(() => {
    if (!map || map !== mapRef.current || !styleReady || !gcgField) return;
    if (
      !options.showLocalTangentPlane &&
      !options.showLocalSphere &&
      !options.showEllipsoid &&
      !options.showQuasigeoid
    )
      return;
    const lease = acquireSharedThreeScene(map);
    const runtime = createReferenceSurfaceRuntime({
      id: REFERENCE_RUNTIME_ID,
      originLngLat: mutableLngLat(referenceOrigin),
      field: gcgField,
      halfExtentMeters: options.referenceRadiusMeters,
      opacity: options.referenceOpacity,
      sphereRadiusMeters: options.localSphereRadiusMeters,
      verticalScale: options.referenceVerticalScale,
      verticalOffsetMeters: options.referenceVerticalOffsetMeters,
      visibility: {
        localTangentPlane: options.showLocalTangentPlane,
        localSphere: options.showLocalSphere,
        ellipsoid: options.showEllipsoid,
        quasigeoid: options.showQuasigeoid,
      },
    });
    lease.layer.addRuntime(runtime);
    const unregister = registerSharedThreeSceneRuntime(map, runtime);
    notifySharedThreeSceneContentChanged(map, { roots: [runtime.root] });
    return () => {
      unregister();
      lease.layer.removeRuntime(runtime.id);
      lease.release();
    };
  }, [
    gcgField,
    map,
    options.localSphereRadiusMeters,
    options.referenceOpacity,
    options.referenceRadiusMeters,
    options.referenceVerticalOffsetMeters,
    options.referenceVerticalScale,
    options.showEllipsoid,
    options.showLocalSphere,
    options.showLocalTangentPlane,
    options.showQuasigeoid,
    referenceOrigin,
    styleReady,
  ]);

  useEffect(() => {
    if (
      !map ||
      map !== mapRef.current ||
      !styleReady ||
      !gcgField ||
      !options.showTerrain
    ) {
      setOneStatus(
        "terrain",
        options.showTerrain ? "waiting for GCG2016" : "disabled"
      );
      return;
    }
    const lease = acquireSharedThreeScene(map);
    const bindings = new Set<TerrainShaderBinding>();
    terrainBindingsRef.current = bindings;
    let disposed = false;
    let distanceRefreshTimer = 0;
    let runtime: TerrainRuntime;
    const scheduleDistanceRefresh = () => {
      if (distanceRefreshTimer) return;
      distanceRefreshTimer = window.setTimeout(() => {
        distanceRefreshTimer = 0;
        if (!disposed) setTerrainRevision((revision) => revision + 1);
      }, 300);
    };
    const patchMaterials = () => {
      const shaderConfig = terrainShaderConfigRef.current;
      patchTerrainReferenceShader({
        root: runtime.root,
        frame: shaderConfig.frame,
        field: gcgField,
        geometryMode: shaderConfig.geometryMode,
        heightDatum: shaderConfig.heightDatum,
        colorMinimumMeters: shaderConfig.colorMinimumMeters,
        colorMaximumMeters: shaderConfig.colorMaximumMeters,
        elevationColorEnabled: shaderConfig.elevationColorEnabled,
        atmosphere: shaderConfig.atmosphere,
        bindings,
      });
      for (const binding of bindings) {
        binding.elevationIsolines.value = isolinesRef.current;
        binding.colorDatum.value = elevationColorDatumNumber(
          colorDatumRef.current
        );
      }
    };
    setOneStatus(
      "terrain",
      `loading shadow ${options.terrainModel.toUpperCase()} Terrarium runtime`
    );
    runtime = buildRasterDemTerrainRuntime(
      TERRAIN_RUNTIME_ID,
      terrainResource,
      mutableLngLat(referenceOrigin),
      {
        ...(options.boundedComparison
          ? {
              maxSelectionTiles: 16,
              maxCachedMeshes: 24,
              maxCacheBytes: 32 * 1024 ** 2,
              requestConcurrency: 2,
            }
          : {}),
        errorTargetPixels: options.terrainErrorTargetPixels,
        debugScreenError: options.terrainAppearance === "pixel-error",
        // Decision ThreeReferenceSurfaces.md#shader-displaced-terrain-bounds: envelope
        // for the NRW extent in these fixed local frames, including curvature,
        // Mercator scale drift and GCG2016. The source/worker remain unchanged.
        boundsPaddingMeters: terrainBoundsPadding,
        meshSegments: terrainResource.tileSize,
        noDataHeightMeters: -9999,
        receivesMapStyleTexture: options.terrainAppearance === "basemap",
        onContentChanged: (bounds) => {
          if (disposed) return;
          patchMaterials();
          notifySharedThreeSceneContentChanged(map, {
            bounds,
            roots: [runtime.root],
          });
          scheduleDistanceRefresh();
        },
        onError: (error) => {
          if (!disposed) {
            setOneStatus(
              "terrain",
              `error ${error instanceof Error ? error.message : String(error)}`
            );
          }
        },
      }
    );
    const updateTerrainRuntime = runtime.update.bind(runtime);
    let lastElevationRangeSample = 0;
    runtime.update = (runtimeFrame) => {
      updateTerrainRuntime(runtimeFrame);
      const now = performance.now();
      if (!options.autoElevationRange || now - lastElevationRangeSample < 500)
        return;
      lastElevationRangeSample = now;
      const sampledRange = sampleTerrainViewportHeightRange(
        runtime,
        runtimeFrame.map
      );
      const tileRange = runtime.getViewSourceHeightRange(
        runtimeFrame.lodCamera
      );
      const validTileRange =
        tileRange && tileRange[0] > -1_000 && tileRange[1] < 10_000
          ? tileRange
          : null;
      const baseRange = sampledRange ?? validTileRange;
      const range = baseRange
        ? ([
            physicalCameraPose
              ? Math.min(
                  baseRange[0],
                  physicalCameraPose.targetNormalHeightMeters
                )
              : baseRange[0],
            physicalCameraPose
              ? Math.max(
                  baseRange[1],
                  physicalCameraPose.targetNormalHeightMeters
                )
              : baseRange[1],
          ] as const)
        : null;
      if (!range) return;
      setTerrainViewElevationRange((current) =>
        current &&
        Math.abs(current[0] - range[0]) < 0.25 &&
        Math.abs(current[1] - range[1]) < 0.25
          ? current
          : range
      );
    };
    terrainRef.current = runtime;
    storyDiagnostics().terrain = runtime;
    lease.layer.addRuntime(runtime);
    const unregister = registerSharedThreeSceneRuntime(map, runtime);
    patchMaterials();
    setTerrainRuntimeMounted(true);
    void runtime.ready.then((ready: boolean) => {
      if (!disposed) {
        setOneStatus(
          "terrain",
          ready
            ? "ready initial terrain · LOD refinement may continue"
            : "error no coverage"
        );
        setTerrainRevision((revision) => revision + 1);
      }
    });

    return () => {
      disposed = true;
      setTerrainRuntimeMounted(false);
      if (distanceRefreshTimer) window.clearTimeout(distanceRefreshTimer);
      terrainRef.current = null;
      setTerrainViewElevationRange(null);
      const diagnostics = currentStoryDiagnostics();
      if (diagnostics?.terrain === runtime) {
        delete diagnostics.terrain;
      }
      terrainBindingsRef.current = new Set();
      disposeTerrainReferenceDepthMaterial(runtime.root);
      unregister();
      lease.layer.removeRuntime(runtime.id);
      lease.release();
    };
    // Colour uniforms update below. Geometry modes also change admission bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gcgField,
    map,
    options.showTerrain,
    options.boundedComparison,
    options.terrainAppearance,
    options.terrainModel,
    terrainBoundsPadding,
    options.autoElevationRange,
    physicalCameraPose,
    frame,
    referenceOrigin,
    styleReady,
  ]);

  useEffect(() => {
    terrainRef.current?.setErrorTarget?.(options.terrainErrorTargetPixels);
  }, [options.terrainErrorTargetPixels]);

  useEffect(() => {
    updateTerrainReferenceShader(terrainBindingsRef.current, {
      frame,
      geometryMode: options.terrainGeometryMode,
      heightDatum: options.terrainHeightDatum,
      colorMinimumMeters: effectiveElevationRange[0],
      colorMaximumMeters: effectiveElevationRange[1],
      elevationColorEnabled: options.terrainAppearance === "viridis",
      atmosphere,
    });
    map?.triggerRepaint();
    setTerrainRevision((revision) => revision + 1);
  }, [
    frame,
    map,
    effectiveElevationRange,
    options.terrainGeometryMode,
    options.terrainHeightDatum,
    atmosphere,
  ]);

  useEffect(() => {
    if (
      !map ||
      map !== mapRef.current ||
      !styleReady ||
      !options.showMesh2024
    ) {
      setOneStatus(
        "mesh",
        options.showMesh2024 ? "waiting for map" : "disabled"
      );
      return;
    }
    const lease = acquireSharedThreeScene(map);
    let disposed = false;
    let runtime: ThreeTilesRuntime;
    let lastCoverageStatus = "loading MeshX 2024 ECEF tileset";
    const updateReady = () => {
      if (disposed) return;
      const coverageStatus = runtime.scene.isMainViewReady()
        ? "ready ECEF → local ENU"
        : runtime.scene.hasRenderableContent?.()
        ? "visible · coverage refinement pending"
        : "loading MeshX 2024 ECEF tileset";
      if (coverageStatus === lastCoverageStatus) return;
      lastCoverageStatus = coverageStatus;
      setOneStatus("mesh", coverageStatus);
    };
    const patchMeshMaterials = (
      roots: readonly THREE.Object3D[] | undefined
    ) => {
      if (!roots || !gcgField || options.meshAppearance !== "elevation") return;
      const shaderConfig = meshShaderConfigRef.current;
      for (const root of roots) {
        patchEcefMeshElevationShader({
          root,
          runtimeRoot: runtime.scene.root,
          frame: shaderConfig.frame,
          colorMinimumMeters: shaderConfig.colorMinimumMeters,
          colorMaximumMeters: shaderConfig.colorMaximumMeters,
          elevationIsolines: isolinesRef.current,
          field: gcgField,
          colorDatum: colorDatumRef.current,
          encodedHeightDatum: encodedHeightDatumRef.current,
          atmosphere: shaderConfig.atmosphere,
          bindings: meshBindingsRef.current,
        });
      }
    };
    setOneStatus("mesh", "loading MeshX 2024 ECEF tileset");
    runtime = buildThreeTilesRuntime(
      MESH_RUNTIME_ID,
      WUPP_MESH_2024.url,
      mutableLngLat(referenceOrigin),
      {
        providesTerrain: true,
        mapStyleDrape: "none",
        entry: meshParityStyle.metadata.carmaConf["3d"].entry,
        baseErrorTargetPixels:
          meshParityStyle.metadata.carmaConf["3d"].baseErrorTarget,
        colorCorrection: WUPP_MESH_2024.colorCorrection,
        requestConcurrency: 8,
        ...(options.boundedComparison
          ? {
              cacheBudgetBytes: 384 * 1024 ** 2,
              requestConcurrency: 2,
            }
          : {}),
        onContentChanged: (bounds, roots) => {
          if (disposed) return;
          patchMeshMaterials(roots);
          notifySharedThreeSceneContentChanged(map, { bounds, roots });
          updateReady();
        },
        onRequestStateChange: () => {
          if (disposed) return;
          notifySharedThreeSceneRequestStateChanged(map);
          updateReady();
        },
      }
    );
    runtime.loading.setErrorTarget(options.meshErrorTargetPixels);
    runtime.appearance.setOpacity(options.meshOpacity);
    const updateMeshRuntime = runtime.scene.update.bind(runtime.scene);
    let lastElevationRangeSample = 0;
    runtime.scene.update = (runtimeFrame) => {
      updateMeshRuntime(runtimeFrame);
      updateReady();
      const now = performance.now();
      if (!options.autoElevationRange || now - lastElevationRangeSample < 250)
        return;
      lastElevationRangeSample = now;
      const range = runtime.scene.getViewElevationRange?.(
        runtimeFrame.lodCamera
      );
      if (!range) return;
      setMeshViewElevationRange((current) =>
        current &&
        Math.abs(current[0] - range[0]) < 0.25 &&
        Math.abs(current[1] - range[1]) < 0.25
          ? current
          : range
      );
    };
    patchMeshMaterials([runtime.scene.root]);
    meshRef.current = runtime;
    storyDiagnostics().mesh = runtime;
    lease.layer.addRuntime(runtime.scene);
    const unregister = registerSharedThreeSceneRuntime(map, runtime.scene);
    return () => {
      disposed = true;
      meshRef.current = null;
      meshBindingsRef.current = new Set();
      setMeshViewElevationRange(null);
      const diagnostics = currentStoryDiagnostics();
      if (diagnostics?.mesh === runtime) {
        delete diagnostics.mesh;
      }
      unregister();
      lease.layer.removeRuntime(runtime.scene.id);
      lease.release();
    };
    // Runtime knobs update below without discarding resident tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    frame,
    map,
    options.meshAppearance,
    options.boundedComparison,
    gcgField,
    options.showMesh2024,
    options.autoElevationRange,
    referenceOrigin,
    styleReady,
  ]);

  useEffect(() => {
    updateMeshElevationShader(meshBindingsRef.current, {
      colorMinimumMeters: effectiveElevationRange[0],
      colorMaximumMeters: effectiveElevationRange[1],
      elevationIsolines: options.elevationIsolines,
      colorDatum: options.elevationColorDatum,
      encodedHeightDatum: options.meshEncodedHeightDatum,
      atmosphere,
    });
    for (const binding of terrainBindingsRef.current) {
      binding.elevationIsolines.value = options.elevationIsolines ?? false;
      binding.colorDatum.value = elevationColorDatumNumber(
        colorDatumRef.current
      );
    }
    map?.triggerRepaint();
  }, [
    atmosphere,
    effectiveElevationRange,
    map,
    options.elevationIsolines,
    options.elevationColorDatum,
    options.meshEncodedHeightDatum,
  ]);

  useEffect(() => {
    meshRef.current?.loading.setErrorTarget(options.meshErrorTargetPixels);
  }, [options.meshErrorTargetPixels]);

  useEffect(() => {
    meshRef.current?.appearance.setOpacity(options.meshOpacity);
    map?.triggerRepaint();
  }, [map, options.meshOpacity]);

  useEffect(() => {
    if (!gcgField || !options.showNivellementPoints) {
      setOneStatus(
        "nivellement",
        options.showNivellementPoints ? "waiting for GCG2016" : "disabled"
      );
      return;
    }
    if (nivellementPoints) return;
    const controller = new AbortController();
    setOneStatus("nivellement", "loading DHHN2016 points");
    void loadNivellementPoints(controller.signal)
      .then((points) => {
        if (controller.signal.aborted) return;
        setNivellementPoints(points);
        setOneStatus(
          "nivellement",
          `ready ${points.length} transformed points`
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setOneStatus(
          "nivellement",
          `error ${error instanceof Error ? error.message : String(error)}`
        );
      });
    return () => controller.abort();
    // Loaded point data is retained while toggling the visualization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcgField, nivellementPoints, options.showNivellementPoints]);

  useEffect(() => {
    if (
      !map ||
      !styleReady ||
      !gcgField ||
      !nivellementPoints ||
      !options.showNivellementPoints
    ) {
      setDistanceSummaries({});
      return;
    }
    const lease = acquireSharedThreeScene(map);
    const root = new THREE.Group();
    root.name = `${NIV_RUNTIME_ID}-root`;
    let material: THREE.ShaderMaterial | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    const runtime = createNivellementRuntime(
      NIV_RUNTIME_ID,
      mutableLngLat(referenceOrigin),
      root,
      () => {
        geometry?.dispose();
        material?.dispose();
        root.clear();
      }
    );
    lease.layer.addRuntime(runtime);
    const unregister = registerSharedThreeSceneRuntime(map, runtime);
    const validation = createNivellementValidationGeometry(
      nivellementPoints,
      frame,
      gcgField,
      terrainRef.current,
      options
    );
    geometry = validation.geometry;
    material = createNivellementMaterial(
      options.nivellementPointSizePixels,
      options.validationColorLimitMeters
    );
    nivellementMaterialRef.current = material;
    const pointCloud = new THREE.Points(geometry, material);
    pointCloud.name = `NIV distance to ${options.validationSurface}`;
    pointCloud.frustumCulled = true;
    pointCloud.renderOrder = 10;
    root.add(pointCloud);
    setDistanceSummaries(validation.distanceSummaries);
    notifySharedThreeSceneContentChanged(map, { roots: [root] });
    map.triggerRepaint();

    return () => {
      nivellementMaterialRef.current = null;
      unregister();
      lease.layer.removeRuntime(runtime.id);
      lease.release();
    };
  }, [
    frame,
    gcgField,
    map,
    nivellementPoints,
    options.referenceVerticalOffsetMeters,
    options.referenceVerticalScale,
    options.showNivellementPoints,
    options.terrainGeometryMode,
    options.terrainHeightDatum,
    options.validationColorLimitMeters,
    options.validationSurface,
    styleReady,
    terrainRevision,
    referenceOrigin,
  ]);

  useEffect(() => {
    const material = nivellementMaterialRef.current;
    if (!material) return;
    material.uniforms.uPointSize.value = options.nivellementPointSizePixels;
    material.uniforms.uColorLimit.value = options.validationColorLimitMeters;
    map?.triggerRepaint();
  }, [
    map,
    options.nivellementPointSizePixels,
    options.validationColorLimitMeters,
  ]);

  return (
    <ControlLayout>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: options.embedded ? "100%" : "100vh",
          minHeight: 0,
        }}
      >
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {options.showAngularGuideLines && (
          <ReferenceAngularGuideOverlay
            fieldOfViewDegrees={viewAngles.fov}
            spacingDegrees={options.angularGuideSpacingDegrees}
            pitchDegrees={viewAngles.pitch}
            bearingDegrees={viewAngles.bearing}
            aspect={viewAngles.aspect}
            longitude={referenceOrigin[0]}
            latitude={referenceOrigin[1]}
            height={
              physicalCameraPose && !gcgField
                ? null
                : observerEllipsoidalHeightMeters
            }
            reference={options.horizonReference}
          />
        )}
        {options.panelLabel && (
          <div
            style={{
              position: "absolute",
              zIndex: 20,
              top: 8,
              left: options.showShadowSimulation ? 48 : 8,
              maxWidth: "calc(100% - 64px)",
              padding: "5px 8px",
              borderRadius: 3,
              background: "rgba(10, 18, 26, 0.82)",
              color: "white",
              font: "600 11px/1.3 system-ui, sans-serif",
              pointerEvents: "none",
            }}
          >
            {options.panelLabel}
          </div>
        )}
        {options.showNivellementPoints && (
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 64,
              color: "white",
              font: "11px system-ui",
              padding: 6,
              background: "#101820dd",
              pointerEvents: "none",
            }}
          >
            1 km grid · orange: WGS84 · viridis: GCG2016 · points: signed
            distance to {options.validationSurface}
          </div>
        )}
        {((options.showTerrain && options.terrainAppearance === "viridis") ||
          (options.showMesh2024 && options.meshAppearance === "elevation")) && (
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 64,
              color: "white",
              font: "11px system-ui",
              padding: 6,
              background: "#101820dd",
              pointerEvents: "none",
            }}
          >
            {options.atmosphereMode === REFERENCE_ATMOSPHERE_MODE.OPTICAL_DEPTH
              ? "Optical depth · 0–2.5 (dimensionless)"
              : options.elevationIsolines &&
                elevationColorDatumNumber(colorDatumRef.current) < 6 &&
                colorDatumRef.current !== ELEVATION_COLOR_DATUM.UNDULATION
              ? "Elevation · 100 m colour cycle · 1 m contours"
              : `Metric · ${Number(
                  effectiveElevationRange[0].toFixed(3)
                )}…${Number(effectiveElevationRange[1].toFixed(3))} m`}
            {options.autoMetricRange && metricRange && (
              <div>Viewport samples · 0.1 m thin / 1 m bold</div>
            )}
            <div
              style={{
                width: 160,
                height: 8,
                marginTop: 4,
                background:
                  "linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)",
              }}
            />
          </div>
        )}
        {options.showShadowSimulation && terrainRuntimeMounted && (
          <ShadowSimulationView
            config={{
              year: 2026,
              initialDayOfYear: options.shadowDayOfYear,
              initialMinutes: options.shadowMinutes,
              latitude: referenceOrigin[1],
              longitude: referenceOrigin[0],
              timeZone: "Europe/Berlin",
              shadowAreaMeters: options.shadowAreaMeters,
              mapLibreTerrain: terrainResource,
              experimentalTiledShadows: true,
            }}
            libreMap={map}
            targeted={false}
            sharedState={shadowState}
            setSharedState={(action) =>
              setShadowState((current) =>
                typeof action === "function" ? action(current) : action
              )
            }
            sharedDateState={shadowDateState}
            setSharedDateState={(action) =>
              setShadowDateState((current) =>
                typeof action === "function" ? action(current) : action
              )
            }
          />
        )}
        {options.showDiagnostics !== false && (
          <ReferenceSurfaceDiagnostics
            options={options}
            status={status}
            solarElevationDegrees={solarPosition.elevationDegrees}
            solarAzimuthDegrees={solarPosition.azimuthDegrees}
            referenceOrigin={referenceOrigin}
            physicalCameraPose={physicalCameraPose}
            effectiveElevationRange={effectiveElevationRange}
            distanceSummaries={distanceSummaries}
          />
        )}
      </div>
    </ControlLayout>
  );
};
