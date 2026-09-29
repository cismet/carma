import * as THREE from "three";

import {
  FESTPUNKTE_WUPPERTAL,
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
} from "@carma-commons/resources";
import type { LngLatArray } from "@carma-geo/data-structures";
import { getGcg2016HeightAnomalies, getProj4Converter } from "@carma-geo/proj";
import type { SharedThreeSceneRuntime } from "@carma-mapping/engines/maplibre";

import {
  localUpAt,
  sceneSurfacePoint,
  signedCorrespondingDistance,
  summarizeSignedDistances,
  type DistanceSummary,
} from "./reference-surface-distance";
import {
  projectGeodeticToScene,
  type ReferenceFrame,
} from "./reference-surface-frame";
import type { Gcg2016ShaderField } from "./reference-gcg2016-field";
import {
  REFERENCE_SURFACE,
  TERRAIN_GEOMETRY_MODE,
  type TerrainGeometryMode,
  type TerrainHeightDatum,
} from "./reference-surface-types";
import type { buildRasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import type { ReferenceSurface } from "./reference-surface-types";

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

export type NivellementPoint = Readonly<{
  id: string;
  longitude: number;
  latitude: number;
  normalHeightMeters: number;
  undulationMeters: number;
}>;

export type DistanceSummaries = Partial<
  Record<ReferenceSurface, DistanceSummary | null>
>;

export const createNivellementMaterial = (
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

export const createNivellementRuntime = (
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

export const loadNivellementPoints = async (
  signal: AbortSignal
): Promise<readonly NivellementPoint[]> => {
  const response = await fetch(FESTPUNKTE_WUPPERTAL, { signal });
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
  const undulations = await getGcg2016HeightAnomalies(coordinates);
  return valid.map((point, index) => ({
    ...point,
    undulationMeters: undulations[index] ?? 0,
  }));
};

type TerrainRuntime = ReturnType<typeof buildRasterDemTerrainRuntime>;

export const createNivellementValidationGeometry = (
  nivellementPoints: readonly NivellementPoint[],
  frame: ReferenceFrame,
  gcgField: Gcg2016ShaderField,
  terrain: Pick<TerrainRuntime, "getElevation"> | null,
  options: Readonly<{
    terrainGeometryMode: TerrainGeometryMode;
    terrainHeightDatum: TerrainHeightDatum;
    referenceVerticalScale: number;
    referenceVerticalOffsetMeters: number;
    validationSurface: ReferenceSurface;
  }>
): { geometry: THREE.BufferGeometry; distanceSummaries: DistanceSummaries } => {
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
    const terrainHeight = terrain?.getElevation(
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
  const geometry = new THREE.BufferGeometry();
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

  const distanceSummaries = Object.fromEntries(
    Object.entries(distanceValues).map(([surface, values]) => [
      surface,
      summarizeSignedDistances(values),
    ])
  ) as DistanceSummaries;
  return { geometry, distanceSummaries };
};
