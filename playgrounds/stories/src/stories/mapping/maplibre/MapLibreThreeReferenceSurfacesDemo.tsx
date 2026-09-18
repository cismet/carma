import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  FESTPUNKTE_WUPPERTAL,
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN,
  WUPP_MESH_2024,
  type GeoreferencedLandmark,
} from "@carma-commons/resources";
import type { LngLatArray } from "@carma-geo/data-structures";
import { projectEllipsoidHorizon } from "@carma-geo/proj";
import { getGcg2016Undulations, getProj4Converter } from "@carma-geo/proj";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";
import {
  acquireSharedThreeScene,
  buildThreeTilesRuntime,
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
  type SharedThreeSceneRuntime,
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
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";

import { createWuppertalStoryStyle } from "./maplibre-story-style";
import meshParityStyle from "./data/mesh2024-cesium-parity.style.json";
import { createReferenceLandmarks } from "./reference-landmarks";
import {
  ELEVATION_COLOR_DATUM,
  elevationColorDatumNumber,
  type ElevationColorDatum,
  REFERENCE_ATMOSPHERE_MODE,
  REFERENCE_CAMERA_PRESET,
  REFERENCE_PHYSICAL_CAMERA_POSES,
  REFERENCE_SURFACE,
  TERRAIN_GEOMETRY_MODE,
  TERRAIN_HEIGHT_DATUM,
  createGcg2016ShaderField,
  createReferenceFrame,
  createReferenceSurfaceRuntime,
  disposeTerrainReferenceDepthMaterial,
  localUpAt,
  patchEcefMeshElevationShader,
  patchTerrainReferenceShader,
  projectGeodeticToScene,
  sampleGcg2016Field,
  referenceMountDrop,
  sceneSurfacePoint,
  signedCorrespondingDistance,
  summarizeSignedDistances,
  updateMeshElevationShader,
  updateTerrainReferenceShader,
  type DistanceSummary,
  type Gcg2016ShaderField,
  type ReferencePhysicalCameraPose,
  type ReferenceCameraPreset,
  type ReferenceAtmosphereMode,
  type ReferenceAtmosphereOptions,
  type ReferenceSurface,
  type MeshElevationShaderBinding,
  type TerrainGeometryMode,
  type TerrainHeightDatum,
  type TerrainShaderBinding,
} from "./maplibre-three-reference-surfaces";

import "maplibre-gl/dist/maplibre-gl.css";

const STORY_CENTER: [number, number] = [7.1999207, 51.2725716];
const mutableLngLat = (
  value: readonly [longitude: number, latitude: number]
): [number, number] => [value[0], value[1]];
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

type StatusKey = "gcg2016" | "terrain" | "mesh" | "nivellement";

const AngularGuideOverlay = ({
  fieldOfViewDegrees,
  spacingDegrees,
  pitchDegrees,
  bearingDegrees,
  aspect,
  longitude,
  latitude,
  height,
  reference = "local-horizontal",
}: {
  fieldOfViewDegrees: number;
  spacingDegrees: number;
  pitchDegrees: number;
  bearingDegrees: number;
  aspect: number;
  longitude: number;
  latitude: number;
  height: number | null;
  reference?: "local-horizontal" | "ellipsoid";
}) => {
  const halfFov = degToRadNumeric(Math.max(0.1, fieldOfViewDegrees) / 2);
  const elevation = pitchDegrees - 90;
  const spacing = Math.max(0.1, spacingDegrees);
  const project = (angle: number) =>
    50 -
    (50 * Math.tan(degToRadNumeric(angle - elevation))) / Math.tan(halfFov);
  const first = Math.ceil((elevation - fieldOfViewDegrees / 2) / spacing);
  const last = Math.floor((elevation + fieldOfViewDegrees / 2) / spacing);
  const limb = useMemo(
    () =>
      height === null
        ? null
        : projectEllipsoidHorizon({
            longitude: degToRadNumeric(longitude),
            latitude: degToRadNumeric(latitude),
            height,
            bearing: degToRadNumeric(bearingDegrees),
            pitch: degToRadNumeric(pitchDegrees),
            verticalFov: halfFov * 2,
            aspect,
          }),
    [longitude, latitude, height, bearingDegrees, pitchDegrees, halfFov, aspect]
  );
  const label =
    reference === "ellipsoid"
      ? "WGS84 ellipsoid horizon"
      : "0° local horizontal";
  const top = project(
    reference === "ellipsoid" && limb
      ? -radToDegNumeric(limb.centerDepression)
      : 0
  );
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 12,
        overflow: "hidden",
        pointerEvents: "none",
        color: "white",
        mixBlendMode: "difference",
      }}
    >
      {Array.from(
        { length: Math.max(0, last - first + 1) },
        (_, i) => (first + i) * spacing
      ).map((angle) => (
        <div
          key={angle}
          style={{
            position: "absolute",
            top: `${project(angle)}%`,
            left: 0,
            right: 0,
            borderTop: `1px solid rgba(255,255,255,${
              Math.abs(angle - Math.round(angle)) < 0.001 ? 0.5 : 0.33
            })`,
          }}
        />
      ))}
      {reference === "ellipsoid" && limb && (
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, overflow: "hidden" }}
        >
          {limb.segments.map((segment, i) => (
            <polyline
              key={i}
              points={segment.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
              fill="none"
              stroke="white"
              strokeOpacity={0.5}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
      <span
        style={{
          position: "absolute",
          right: 8,
          top: `${Math.max(2, Math.min(96, top))}%`,
          font: "11px ui-monospace, monospace",
        }}
      >
        {reference === "ellipsoid" && !limb
          ? "Ellipsoid horizon: awaiting eye elevation"
          : label}
        {top < 0 ? " ↑" : top > 100 ? " ↓" : ""}
      </span>
    </div>
  );
};
type LoadStatus = Record<StatusKey, string>;
type TerrainRuntime = ReturnType<typeof buildRasterDemTerrainRuntime>;
type ReferenceSurfaceStoryDiagnostics = {
  panelLabel?: string;
  map?: MapLibreMap;
  terrain?: TerrainRuntime;
  mesh?: ThreeTilesRuntime;
  gcg2016?: Gcg2016ShaderField;
  projectTerrainComparisonPoint?: (
    longitude: number,
    latitude: number,
    normalHeightMeters: number
  ) => {
    raw: readonly [x: number, y: number];
    corrected: readonly [x: number, y: number];
    deltaPixels: number;
    undulationMeters: number;
    visible: boolean;
  };
};

type ReferenceDiagnosticsWindow = typeof window & {
  __carmaReferenceSurfacesMap?: MapLibreMap;
  __carmaReferenceSurfaces?: ReferenceSurfaceStoryDiagnostics;
  __carmaReferenceSurfacesPanels?: Record<
    string,
    ReferenceSurfaceStoryDiagnostics
  >;
};

type RawNivellementPoint = {
  id?: number;
  historisch?: boolean;
  hoehe_ueber_nhn2016?: number;
  x?: number;
  y?: number;
  geojson?: {
    coordinates?: readonly [number, number];
  };
};

type NivellementPoint = Readonly<{
  id: string;
  longitude: number;
  latitude: number;
  normalHeightMeters: number;
  undulationMeters: number;
}>;

type DistanceSummaries = Partial<
  Record<ReferenceSurface, DistanceSummary | null>
>;

const initialStatus: LoadStatus = {
  gcg2016: "loading bundled coefficients",
  terrain: "disabled",
  mesh: "disabled",
  nivellement: "disabled",
};

const isIgnorableMapError = (message: string | undefined) =>
  !message ||
  message === "__publicField is not defined" ||
  message === "Ge is not defined" ||
  message.startsWith(
    "AJAXError:  (400): https://geodaten.metropoleruhr.de/spw2"
  );

const createNivellementMaterial = (
  pointSizePixels: number,
  colorLimitMeters: number
) =>
  new THREE.ShaderMaterial({
    name: "NIV validation distance shader",
    transparent: true,
    depthWrite: false,
    uniforms: {
      uPointSize: { value: pointSizePixels },
      uColorLimit: { value: colorLimitMeters },
    },
    vertexShader: /* glsl */ `
      uniform float uPointSize;
      attribute float aSignedDistance;
      attribute float aDistanceAvailable;
      varying float vSignedDistance;
      varying float vDistanceAvailable;
      void main() {
        vSignedDistance = aSignedDistance;
        vDistanceAvailable = aDistanceAvailable;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uPointSize;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uColorLimit;
      varying float vSignedDistance;
      varying float vDistanceAvailable;

      vec3 viridis(float value) {
        float x = clamp(value, 0.0, 1.0);
        vec3 c0 = vec3(0.2777273272, 0.0054073445, 0.3340998053);
        vec3 c1 = vec3(0.1050930431, 1.4046135299, 1.3845901626);
        vec3 c2 = vec3(-0.3308618287, 0.2148475595, 0.0950951630);
        vec3 c3 = vec3(-4.6342304989, -5.7991009734, -19.3324409563);
        vec3 c4 = vec3(6.2282699363, 14.1799333668, 56.6905526007);
        vec3 c5 = vec3(4.7763849977, -13.7451453777, -65.3530326334);
        vec3 c6 = vec3(-5.4354558559, 4.6458526122, 26.3124352496);
        return clamp(c0 + x * (c1 + x * (c2 + x * (c3 + x * (c4 + x * (c5 + x * c6))))), 0.0, 1.0);
      }

      void main() {
        vec2 delta = gl_PointCoord - vec2(0.5);
        float radius = length(delta);
        if (radius > 0.5) discard;
        float border = smoothstep(0.5, 0.38, radius);
        float normalized = vSignedDistance / max(0.001, uColorLimit) * 0.5 + 0.5;
        vec3 fill = vDistanceAvailable > 0.5
          ? viridis(normalized)
          : vec3(0.52);
        vec3 color = mix(vec3(0.03), fill, border);
        gl_FragColor = vec4(color, 0.97);
      }
    `,
  });

const createEmptyRuntime = (
  id: string,
  originLngLat: [number, number],
  root: THREE.Group,
  dispose: () => void
): SharedThreeSceneRuntime => ({
  id,
  originLngLat,
  root,
  update: () => undefined,
  getRequestDemand: () => 0,
  isMainViewReady: () => root.children.length > 0,
  hasRenderableContent: () => root.children.length > 0,
  dispose,
});

const statusColor = (value: string) =>
  value.startsWith("ready")
    ? "#16794c"
    : value.startsWith("error")
    ? "#ba2b2b"
    : value === "disabled"
    ? "#697078"
    : "#9b6100";

const formatDistance = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(Math.abs(value) < 10 ? 3 : 1)}`;

const surfaceLabel: Record<ReferenceSurface, string> = {
  tangent: "local tangent",
  sphere: "local sphere",
  ellipsoid: "WGS84 ellipsoid",
  quasigeoid: "GCG2016 quasigeoid",
  terrain: "loaded DGM1 terrain",
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
  const containerRef = useRef<HTMLDivElement>(null);
  const sharedLayerOriginRef = useRef<[number, number] | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const terrainRef = useRef<TerrainRuntime | null>(null);
  const terrainBindingsRef = useRef<Set<TerrainShaderBinding>>(new Set());
  const meshBindingsRef = useRef<Set<MeshElevationShaderBinding>>(new Set());
  const meshRef = useRef<ThreeTilesRuntime | null>(null);
  const nivellementMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  useEffect(() => {
    if (map) return options.onMapReady?.(map);
    return undefined;
  }, [map, options.onMapReady]);
  const [viewAngles, setViewAngles] = useState({
    pitch: options.pitch,
    fov: options.fovDegrees,
    bearing: options.bearing,
    aspect: 1,
  });
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
  const [metricRange, setMetricRange] = useState<
    readonly [number, number] | null
  >(null);
  useEffect(() => {
    const datum = options.elevationColorDatum;
    if (
      !map ||
      !gcgField ||
      !options.autoMetricRange ||
      (datum !== ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE &&
        datum !== ELEVATION_COLOR_DATUM.UNDULATION &&
        datum !== ELEVATION_COLOR_DATUM.MOUNT_DROP)
    ) {
      setMetricRange(null);
      return;
    }
    const update = () => {
      const { clientWidth: width, clientHeight: height } = map.getCanvas();
      if (!width || !height) return;
      const anchorUndulation = sampleGcg2016Field(
        gcgField,
        frame,
        ...frame.originLngLat
      );
      let minimum = Infinity;
      let maximum = -Infinity;
      // 17×17 samples of the map's ground footprint, not the full cached tile
      // extent. Bounded and only on moveend/resize; no I/O, mesh traversal or
      // GPU readback. The legend explicitly labels this as sampled coverage.
      for (let y = 0; y <= 16; y++) {
        for (let x = 0; x <= 16; x++) {
          const { lng, lat } = map.unproject([
            (width * x) / 16,
            (height * y) / 16,
          ]);
          const value =
            datum === ELEVATION_COLOR_DATUM.MOUNT_DROP
              ? referenceMountDrop(frame, lng, lat)
              : sampleGcg2016Field(gcgField, frame, lng, lat) -
                (datum === ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE
                  ? anchorUndulation
                  : 0);
          if (Number.isFinite(value)) {
            minimum = Math.min(minimum, value);
            maximum = Math.max(maximum, value);
          }
        }
      }
      if (!Number.isFinite(minimum)) return;
      if (maximum - minimum < 0.001) {
        const center = (minimum + maximum) / 2;
        minimum = center - 0.0005;
        maximum = center + 0.0005;
      }
      setMetricRange((previous) =>
        previous &&
        Math.abs(previous[0] - minimum) < 1e-6 &&
        Math.abs(previous[1] - maximum) < 1e-6
          ? previous
          : [minimum, maximum]
      );
    };
    update();
    map.on("moveend", update);
    map.on("resize", update);
    return () => {
      map.off("moveend", update);
      map.off("resize", update);
    };
  }, [
    map,
    frame,
    gcgField,
    options.autoMetricRange,
    options.elevationColorDatum,
  ]);
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const style = createWuppertalStoryStyle("stadtplan");
    if (!(options.showTerrain && options.terrainAppearance === "basemap")) {
      style.layers.forEach((layer) => {
        layer.layout = { ...layer.layout, visibility: "none" };
      });
    }
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [options.longitude, options.latitude],
      zoom: options.zoom,
      pitch: options.pitch,
      bearing: options.bearing,
      maxPitch: 89.9,
      centerClampedToGround: false,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
      interactive: !options.lockCamera,
    });
    if (!options.lockCamera) {
      instance.addControl(
        new maplibregl.NavigationControl({ showZoom: true, showCompass: true }),
        "top-right"
      );
    }
    const onLoad = () => setStyleReady(true);
    const onStyleProgress = () => {
      // Custom geometry only needs the style graph, not every unrelated WMTS
      // download to finish. Otherwise a missing basemap blocks reference planes.
      if (instance.getStyle()) setStyleReady(true);
    };
    const onError = (event: { error?: Error }) => {
      if (!isIgnorableMapError(event.error?.message)) {
        console.warn("[MapLibre Three reference surfaces]", event.error);
      }
    };
    instance.on("load", onLoad);
    instance.on("style.load", onLoad);
    instance.on("idle", onLoad);
    instance.on("styledata", onStyleProgress);
    instance.on("render", onStyleProgress);
    instance.on("error", onError);
    const syncViewAngles = () =>
      setViewAngles({
        pitch: instance.getPitch(),
        fov: instance.getVerticalFieldOfView(),
        bearing: instance.getBearing(),
        aspect:
          instance.getCanvas().clientWidth /
          Math.max(1, instance.getCanvas().clientHeight),
      });
    instance.on("move", syncViewAngles);
    instance.on("resize", syncViewAngles);
    syncViewAngles();
    instance.triggerRepaint();
    mapRef.current = instance;
    sharedLayerOriginRef.current = [options.longitude, options.latitude];
    const diagnostics = storyDiagnostics();
    diagnostics.map = instance;
    diagnostics.panelLabel = options.panelLabel;
    const diagnosticWindow = window as ReferenceDiagnosticsWindow;
    (diagnosticWindow.__carmaReferenceSurfacesPanels ??= {})[diagnosticId] =
      diagnostics;
    // Compatibility alias for old single-panel probes; paired probes use the
    // registry. Cleanup must never delete another live panel's diagnostics.
    diagnosticWindow.__carmaReferenceSurfaces = diagnostics;
    diagnosticWindow.__carmaReferenceSurfacesMap = instance;
    setMap(instance);
    const resizeFrame = window.requestAnimationFrame(() => {
      instance.resize();
      // An in-memory Storybook style can finish between Map construction and
      // the load listener above, especially across Vite hot reloads.
      if (instance.getStyle()) setStyleReady(true);
    });

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      instance.off("load", onLoad);
      instance.off("style.load", onLoad);
      instance.off("idle", onLoad);
      instance.off("styledata", onStyleProgress);
      instance.off("render", onStyleProgress);
      instance.off("error", onError);
      instance.off("move", syncViewAngles);
      instance.off("resize", syncViewAngles);
      setMap(null);
      setStyleReady(false);
      instance.remove();
      mapRef.current = null;
      sharedLayerOriginRef.current = null;
      delete diagnosticWindow.__carmaReferenceSurfacesPanels?.[diagnosticId];
      const remaining = Object.values(
        diagnosticWindow.__carmaReferenceSurfacesPanels ?? {}
      ).at(-1);
      if (diagnosticWindow.__carmaReferenceSurfaces === diagnostics)
        diagnosticWindow.__carmaReferenceSurfaces = remaining;
      if (diagnosticWindow.__carmaReferenceSurfacesMap === instance)
        diagnosticWindow.__carmaReferenceSurfacesMap = remaining?.map;
    };
    // Camera args update below without rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const runtimeOrigin = maplibregl.MercatorCoordinate.fromLngLat(
      mutableLngLat(referenceOrigin),
      0
    );
    const layerOrigin = maplibregl.MercatorCoordinate.fromLngLat(
      sharedLayerOrigin,
      0
    );
    const runtimeScale = runtimeOrigin.meterInMercatorCoordinateUnits();
    const layerScale = layerOrigin.meterInMercatorCoordinateUnits();
    const runtimeLocalToShared = new THREE.Matrix4()
      .makeTranslation(
        (runtimeOrigin.x - layerOrigin.x) / layerScale,
        (runtimeOrigin.z - layerOrigin.z) / layerScale,
        (runtimeOrigin.y - layerOrigin.y) / layerScale
      )
      .scale(new THREE.Vector3().setScalar(runtimeScale / layerScale));
    const rotationX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const rawScene = new THREE.Vector3();
    const correctedScene = new THREE.Vector3();
    const clip = new THREE.Vector4();
    const project = (
      local: THREE.Vector3
    ): readonly [number, number, number] => {
      const projectionData = (
        map.transform as unknown as {
          getProjectionDataForCustomLayer: (applyGlobeMatrix?: boolean) => {
            mainMatrix: readonly number[];
          };
        }
      ).getProjectionDataForCustomLayer(false);
      const localFromShared = new THREE.Matrix4()
        .makeTranslation(layerOrigin.x, layerOrigin.y, layerOrigin.z)
        .scale(new THREE.Vector3(layerScale, -layerScale, layerScale))
        .multiply(rotationX);
      const localToClip = new THREE.Matrix4()
        .fromArray(projectionData.mainMatrix as number[])
        .multiply(localFromShared)
        .multiply(runtimeLocalToShared);
      clip.set(local.x, local.y, local.z, 1).applyMatrix4(localToClip);
      const inverseW = 1 / clip.w;
      const canvas = map.getCanvas();
      return [
        (clip.x * inverseW * 0.5 + 0.5) * canvas.clientWidth,
        (0.5 - clip.y * inverseW * 0.5) * canvas.clientHeight,
        clip.w,
      ];
    };
    storyDiagnostics().projectTerrainComparisonPoint = (
      longitude,
      latitude,
      normalHeightMeters
    ) => {
      const undulationMeters = sampleGcg2016Field(
        gcgField,
        frame,
        longitude,
        latitude
      );
      projectGeodeticToScene(
        frame,
        longitude,
        latitude,
        normalHeightMeters,
        TERRAIN_GEOMETRY_MODE.MERCATOR,
        rawScene
      );
      projectGeodeticToScene(
        frame,
        longitude,
        latitude,
        normalHeightMeters + undulationMeters,
        TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
        correctedScene
      );
      const raw = project(rawScene);
      const corrected = project(correctedScene);
      const canvas = map.getCanvas();
      const visible =
        raw[2] > 0 &&
        corrected[2] > 0 &&
        raw[0] >= 0 &&
        raw[0] <= canvas.clientWidth &&
        raw[1] >= 0 &&
        raw[1] <= canvas.clientHeight &&
        corrected[0] >= 0 &&
        corrected[0] <= canvas.clientWidth &&
        corrected[1] >= 0 &&
        corrected[1] <= canvas.clientHeight;
      return {
        raw: [raw[0], raw[1]],
        corrected: [corrected[0], corrected[1]],
        deltaPixels: Math.hypot(corrected[0] - raw[0], corrected[1] - raw[1]),
        undulationMeters,
        visible,
      };
    };
    return () => {
      const diagnostics = currentStoryDiagnostics();
      if (diagnostics) delete diagnostics.projectTerrainComparisonPoint;
    };
  }, [frame, gcgField, map, referenceOrigin]);

  useEffect(() => {
    if (!map || map !== mapRef.current) return;
    map.setVerticalFieldOfView(options.fovDegrees);
    if (
      physicalCameraPose &&
      options.showShadowSimulation &&
      !terrainRuntimeMounted
    ) {
      return;
    }
    const applyCamera = () => {
      if (physicalCameraPose) {
        if (!gcgField) return;
        const undulationMeters = sampleGcg2016Field(
          gcgField,
          frame,
          physicalCameraPose.eyeLngLat[0],
          physicalCameraPose.eyeLngLat[1]
        );
        const eyeHeight =
          physicalCameraPose.eyeNormalHeightMeters + undulationMeters;
        const targetHeight =
          physicalCameraPose.targetNormalHeightMeters +
          sampleGcg2016Field(
            gcgField,
            frame,
            ...physicalCameraPose.targetLngLat
          );
        const eye = projectGeodeticToScene(
          frame,
          ...physicalCameraPose.eyeLngLat,
          eyeHeight,
          TERRAIN_GEOMETRY_MODE.WGS84_ECEF
        );
        const direction = projectGeodeticToScene(
          frame,
          ...physicalCameraPose.targetLngLat,
          targetHeight,
          TERRAIN_GEOMETRY_MODE.WGS84_ECEF
        ).sub(eye);
        const bearing = radToDegNumeric(Math.atan2(direction.x, -direction.z));
        const pitch = Math.min(
          89.9,
          90 +
            radToDegNumeric(
              Math.atan2(direction.y, Math.hypot(direction.x, direction.z))
            )
        );
        map.jumpTo(
          map.calculateCameraOptionsFromCameraLngLatAltRotation(
            mutableLngLat(physicalCameraPose.eyeLngLat),
            eyeHeight,
            bearing,
            pitch,
            0
          )
        );
        return;
      }
      map.jumpTo({
        center: [options.longitude, options.latitude],
        zoom: options.zoom,
        pitch: options.pitch,
        bearing: options.bearing,
        elevation: 200,
      });
    };

    // ShadowSimulationView configures MapLibre terrain in its own mount effect.
    // Apply the physical camera on the following frame so that terrain setup
    // cannot reset the explicitly calculated target elevation to sea level.
    let cameraFrame = 0;
    const scheduleCamera = () => {
      window.cancelAnimationFrame(cameraFrame);
      cameraFrame = window.requestAnimationFrame(applyCamera);
    };
    scheduleCamera();
    if (physicalCameraPose && options.showShadowSimulation) {
      map.on("terrain", scheduleCamera);
    }
    return () => {
      window.cancelAnimationFrame(cameraFrame);
      map.off("terrain", scheduleCamera);
    };
  }, [
    frame,
    gcgField,
    map,
    options.bearing,
    options.fovDegrees,
    options.latitude,
    options.longitude,
    options.pitch,
    options.showShadowSimulation,
    options.zoom,
    physicalCameraPose,
    terrainRuntimeMounted,
  ]);

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
        // Decision REF-HORIZON-20260913 (ThreeReferenceSurfaces.md): envelope
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
        : runtime.scene.hasRenderableContent()
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
    void fetch(FESTPUNKTE_WUPPERTAL, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const raw = (await response.json()) as unknown;
        if (!Array.isArray(raw)) throw new Error("source is not an array");
        const converter = getProj4Converter("EPSG:25832", "EPSG:4326");
        const valid = (raw as RawNivellementPoint[]).flatMap((point, index) => {
          const coordinates = point.geojson?.coordinates;
          const east = Number(point.x ?? coordinates?.[0]);
          const north = Number(point.y ?? coordinates?.[1]);
          const normalHeightMeters = Number(point.hoehe_ueber_nhn2016);
          if (
            point.historisch ||
            !Number.isFinite(east) ||
            !Number.isFinite(north) ||
            !Number.isFinite(normalHeightMeters) ||
            normalHeightMeters === 0
          )
            return [];
          const [longitude, latitude] = converter.forward([east, north]);
          const [west, south, eastBound, northBound] =
            NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.bounds;
          if (
            longitude < west ||
            longitude > eastBound ||
            latitude < south ||
            latitude > northBound
          )
            return [];
          return [
            {
              id: String(point.id ?? index),
              longitude,
              latitude,
              normalHeightMeters,
            },
          ];
        });
        const coordinates = valid.map(
          ({ longitude, latitude }) => [longitude, latitude] as LngLatArray.deg
        );
        const undulations = await getGcg2016Undulations(coordinates);
        if (controller.signal.aborted) return;
        const points = valid.map((point, index) => ({
          ...point,
          undulationMeters: undulations[index] ?? 0,
        }));
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
    const runtime = createEmptyRuntime(
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
    const positions = new Float32Array(nivellementPoints.length * 3);
    const selectedDistances = new Float32Array(nivellementPoints.length);
    const distanceAvailable = new Float32Array(nivellementPoints.length);
    const distanceValues: Record<ReferenceSurface, number[]> = {
      tangent: [],
      sphere: [],
      ellipsoid: [],
      quasigeoid: [],
      terrain: [],
    };
    const pointPosition = new THREE.Vector3();
    nivellementPoints.forEach((point, index) => {
      projectGeodeticToScene(
        frame,
        point.longitude,
        point.latitude,
        point.normalHeightMeters + point.undulationMeters,
        TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
        pointPosition
      ).toArray(positions, index * 3);
      const localUp = localUpAt(frame, point.longitude, point.latitude);
      const terrainHeight = terrainRef.current?.getElevation(
        point.longitude,
        point.latitude
      );
      (Object.values(REFERENCE_SURFACE) as ReferenceSurface[]).forEach(
        (surface) => {
          const surfacePoint = sceneSurfacePoint({
            surface,
            frame,
            field: gcgField,
            longitude: point.longitude,
            latitude: point.latitude,
            undulationMeters: point.undulationMeters,
            terrainNormalHeightMeters: terrainHeight,
            terrainGeometryMode: options.terrainGeometryMode,
            terrainHeightDatum: options.terrainHeightDatum,
            verticalScale: options.referenceVerticalScale,
            verticalOffsetMeters: options.referenceVerticalOffsetMeters,
          });
          if (!surfacePoint) return;
          const distance = signedCorrespondingDistance(
            pointPosition,
            surfacePoint,
            localUp
          );
          distanceValues[surface].push(distance);
          if (surface === options.validationSurface) {
            selectedDistances[index] = distance;
            distanceAvailable[index] = 1;
          }
        }
      );
    });
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute(
      "aSignedDistance",
      new THREE.BufferAttribute(selectedDistances, 1)
    );
    geometry.setAttribute(
      "aDistanceAvailable",
      new THREE.BufferAttribute(distanceAvailable, 1)
    );
    geometry.computeBoundingSphere();
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
    setDistanceSummaries(
      Object.fromEntries(
        Object.entries(distanceValues).map(([surface, values]) => [
          surface,
          summarizeSignedDistances(values),
        ])
      ) as DistanceSummaries
    );
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
          <AngularGuideOverlay
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
          <div
            aria-label="Reference surface diagnostics"
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              width: 430,
              maxWidth: "calc(100vw - 24px)",
              padding: "9px 11px",
              background: "rgba(255, 255, 255, 0.93)",
              color: "#17212b",
              font: "12px/1.35 system-ui, sans-serif",
              border: "1px solid rgba(0, 0, 0, 0.18)",
              boxShadow: "0 2px 12px rgba(0, 0, 0, 0.14)",
            }}
          >
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                {options.showTerrain
                  ? `Terrain: ${status.terrain}`
                  : options.showMesh2024
                  ? `Mesh: ${status.mesh}`
                  : `GCG2016: ${status.gcg2016}`}
                {options.showShadowSimulation &&
                  ` · Reference-eye sun ${solarPosition.elevationDegrees.toFixed(
                    2
                  )}° / az ${solarPosition.azimuthDegrees.toFixed(2)}°`}
              </summary>
              <div>
                <strong>Reference frame:</strong> MeshX ECEF and corrected
                terrain both resolve into east/up/south at{" "}
                {referenceOrigin[1].toFixed(5)}° N.
              </div>
              {physicalCameraPose && (
                <>
                  <div>
                    Camera: {physicalCameraPose.label},{" "}
                    {(physicalCameraPose.distanceMeters / 1_000).toFixed(2)} km,
                    bearing {physicalCameraPose.bearingDegrees.toFixed(2)}°.
                  </div>
                  <div>
                    {options.cameraPreset ===
                    REFERENCE_CAMERA_PRESET.TOELLETURM_TO_LANGENBERG
                      ? "Langenberg: source-ground anchors and approximate mast geometry; terrain excludes vegetation and buildings."
                      : "Tile reference: Toelleturm DOM1 358.35 m; covered Nordhelle max DGM1 662.94 m / DOM1 686.36 m DHHN2016. Historical sampled DOM corridor clearance: 24.86 m, not certification of this DGM scene."}
                  </div>
                </>
              )}
              {options.showShadowSimulation && (
                <div>
                  Sun/shadows: day {options.shadowDayOfYear}, minute{" "}
                  {options.shadowMinutes},{" "}
                  {options.softSunShadows ? "soft" : "hard"},{" "}
                  {options.shadowAreaMeters.toFixed(0)} m area.
                </div>
              )}
              <div>
                Atmosphere: {options.atmosphereMode}
                {options.atmosphereMode !== REFERENCE_ATMOSPHERE_MODE.OFF
                  ? `, ${options.atmosphereVisibilityKilometers.toFixed(
                      0
                    )} km visibility, ellipsoid-referenced density`
                  : ""}
                .
              </div>
              <div>
                Terrain: {options.terrainModel.toUpperCase()},{" "}
                {options.terrainGeometryMode}, {options.terrainHeightDatum}
                {options.terrainHeightDatum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
                  ? " (H + GCG2016)"
                  : " (raw H)"}
                , {options.terrainAppearance}.
              </div>
              {options.showMesh2024 && (
                <div>
                  MeshX: {options.meshAppearance}
                  {options.meshAppearance === "elevation"
                    ? " (WGS84 ellipsoidal height)"
                    : ""}
                  .
                </div>
              )}
              <div>
                LOD target: terrain{" "}
                {options.terrainErrorTargetPixels.toFixed(1)} px, mesh{" "}
                {options.meshErrorTargetPixels.toFixed(1)} px. Viridis h clamp:{" "}
                {effectiveElevationRange[0].toFixed(2)}–
                {effectiveElevationRange[1].toFixed(2)} m
                {options.autoElevationRange ? " (view tiles)" : " (manual)"}.
              </div>
              {(Object.entries(status) as [StatusKey, string][]).map(
                ([key, value]) => (
                  <div key={key} style={{ color: statusColor(value) }}>
                    {key}: {value}
                  </div>
                )
              )}
              {options.showNivellementPoints && (
                <table
                  style={{
                    width: "100%",
                    marginTop: 6,
                    borderCollapse: "collapse",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: "right" }}>
                      <th style={{ textAlign: "left" }}>
                        signed scene distance (m)
                      </th>
                      <th>n</th>
                      <th>mean</th>
                      <th>RMS</th>
                      <th>min…max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      Object.values(REFERENCE_SURFACE) as ReferenceSurface[]
                    ).map((surface) => {
                      const summary = distanceSummaries[surface];
                      return (
                        <tr
                          key={surface}
                          style={{
                            color:
                              surface === options.validationSurface
                                ? "#006d75"
                                : undefined,
                            fontWeight:
                              surface === options.validationSurface ? 700 : 400,
                            textAlign: "right",
                          }}
                        >
                          <td style={{ textAlign: "left" }}>
                            {surfaceLabel[surface]}
                          </td>
                          <td>{summary?.count ?? "—"}</td>
                          <td>
                            {summary ? formatDistance(summary.meanMeters) : "—"}
                          </td>
                          <td>{summary?.rmsMeters.toFixed(3) ?? "—"}</td>
                          <td>
                            {summary
                              ? `${formatDistance(
                                  summary.minimumMeters
                                )}…${formatDistance(summary.maximumMeters)}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </details>
          </div>
        )}
      </div>
    </ControlLayout>
  );
};
