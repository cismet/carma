import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  ANNOTATION_LINE_COMPONENT_KINDS,
  getAnnotationLineComponentCssColor,
} from "@carma-mapping/annotations/core";
import { annotationVisualDefaults } from "@carma-mapping/annotations/runtime";
import type { Meta, StoryObj } from "@storybook/react";
import maplibregl, {
  type CustomLayerInterface,
  type Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

import {
  BUGA_BRIDGE_ASSET_URI,
  BUGA_BRIDGE_POSITION,
  addModelAxesToScene,
  addBugaBridgeAssetToScene,
  disposeObject,
  toLocalMercatorVector,
} from "./sample-gltf-asset";
import {
  SURFACE_TILE_LABELS,
  SURFACE_TILE_OPTIONS,
  WUPPERTAL_TERRAIN_SOURCE_ID,
  createWuppertalStoryStyle,
  type SurfaceTileMode,
} from "./maplibre-story-style";
import {
  removeMapLibreLod2Layer,
  syncMapLibreLod2Layer,
} from "./maplibre-lod2-layer";
import {
  SAMPLE_MEASUREMENT_LINES,
  SAMPLE_MEASUREMENT_POINTS,
  SAMPLE_MEASUREMENTS_STORY_CENTER,
  type SampleMeasurementLine,
  type SampleMeasurementPoint,
  type SampleMeasurementPosition,
} from "./sample-distance-annotation-data";
import {
  createPointExtrusionGeoJson,
  filterPointExtrusionsAsPolygons,
  findPointExtrusion,
  getPointExtrusionBaseMeters,
  getPointExtrusionColor,
  getPointExtrusionDefaults,
  getPointExtrusionOpacity,
  getPointExtrusionRadiusMeters,
  getPointExtrusionRadiusTransitionFraction,
  getPointExtrusionTopRadiusMeters,
  getPointExtrusionTopMeters,
  parsePointExtrusionGeoJson,
  type PointExtrusionFeature,
} from "./point-extrusion-geojson";
import samplePointExtrusionsGeoJsonRaw from "./data/sample-point-extrusions.geojson?raw";

import "maplibre-gl/dist/maplibre-gl.css";

const THREE_LAYER_ID = "carma-story-maplibre-render-capability-lines";
const CONTROL_CATEGORY_MAP = "Map settings";
const CONTROL_CATEGORY_LINE = "Line";
const CONTROL_CATEGORY_EXTRUSION = "Extrusion";
const MODEL_AXES_LENGTH_METERS = 40;
const EARTH_RADIUS_METERS = 6371008.8;
const POINT_EXTRUSION_SOURCE_ID = "carma-story-maplibre-point-extrusion-source";
const POINT_EXTRUSION_LAYER_ID = "carma-story-maplibre-point-extrusion-layer";
const MEASUREMENT_DIRECT_COLOR = getAnnotationLineComponentCssColor(
  ANNOTATION_LINE_COMPONENT_KINDS.DIRECT
);
const MEASUREMENT_VERTICAL_COLOR = getAnnotationLineComponentCssColor(
  ANNOTATION_LINE_COMPONENT_KINDS.VERTICAL
);
const MEASUREMENT_HORIZONTAL_COLOR = getAnnotationLineComponentCssColor(
  ANNOTATION_LINE_COMPONENT_KINDS.HORIZONTAL
);
const ANNOTATION_NODE_COLOR = annotationVisualDefaults.colors.surface;
const SAMPLE_POINT_EXTRUSION_SOURCE = parsePointExtrusionGeoJson(
  samplePointExtrusionsGeoJsonRaw
);
const SAMPLE_POINT_EXTRUSION_DEFAULTS = {
  name: "Heizkraftwerk Elberfeld",
  ...getPointExtrusionDefaults(SAMPLE_POINT_EXTRUSION_SOURCE),
} as const;

type LinePoint = SampleMeasurementPosition;

type LineVariant = {
  id: string;
  label: string;
  color: string;
  points: readonly [LinePoint, LinePoint];
};

type DomMarker = {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string;
  kind: "line-label" | "point-label";
};

type StraightLineRenderCapabilityStoryArgs = {
  showBugaBridge: boolean;
  showModelAxes: boolean;
  surfaceTiles: SurfaceTileMode;
  showLod2Buildings: boolean;
  terrainEnabled: boolean;
  terrainExaggeration: number;
  screenPixelLineWidth: number;
  lineOpacity: number;
  showNativeFillExtrusion: boolean;
  showTerrainRelativePointExtrusion: boolean;
  showFixedFloorPointExtrusion: boolean;
  pointExtrusionDiameterMeters: number;
  pointExtrusionHeightMeters: number;
  pitch: number;
  bearing: number;
  zoom: number;
};

type MapLibreRenderArgs = {
  defaultProjectionData?: {
    mainMatrix?: ArrayLike<number>;
  };
  modelViewProjectionMatrix?: ArrayLike<number>;
};

type ThreeProjectionState = {
  origin: {
    x: number;
    y: number;
    z: number;
  };
  matrix: number[];
  width: number;
  height: number;
};

type LineLayerOptions = Pick<
  StraightLineRenderCapabilityStoryArgs,
  "showBugaBridge" | "showModelAxes" | "screenPixelLineWidth" | "lineOpacity"
> & {
  showTerrainRelativePointExtrusion: boolean;
  showFixedFloorPointExtrusion: boolean;
  terrainRelativePointExtrusionFeature:
    | PointExtrusionFeature
    | null
    | undefined;
  fixedFloorPointExtrusionFeature: PointExtrusionFeature | null | undefined;
  onProjectionSync?: (state: ThreeProjectionState) => void;
};

const storyShellStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  minHeight: 640,
  overflow: "hidden",
  background: "#d8dee9",
};

const mapContainerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
};

const markerStyle: React.CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#ffffff",
  border: "2px solid currentColor",
  boxShadow: "0 1px 4px rgba(15, 23, 42, 0.38)",
  pointerEvents: "none",
};

const markerLabelStyle: React.CSSProperties = {
  position: "absolute",
  left: 12,
  top: -8,
  whiteSpace: "nowrap",
  color: "#0f172a",
  font: "600 11px/1.2 system-ui, sans-serif",
  textShadow: "0 1px 2px #ffffff",
};

const finiteNumber = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const clampNumber = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
) => Math.min(max, Math.max(min, finiteNumber(value, fallback)));

const createThreeProjectionStateKey = (state: ThreeProjectionState) =>
  [
    state.width,
    state.height,
    state.origin.x.toFixed(12),
    state.origin.y.toFixed(12),
    state.origin.z.toFixed(12),
    ...state.matrix.map((value) => value.toFixed(8)),
  ].join("|");

const useMapLibreThreeProjectionState = () => {
  const projectionStateKeyRef = useRef("");
  const [threeProjectionState, setThreeProjectionState] =
    useState<ThreeProjectionState | null>(null);

  const handleThreeProjectionSync = useCallback(
    (state: ThreeProjectionState) => {
      const key = createThreeProjectionStateKey(state);

      if (projectionStateKeyRef.current === key) {
        return;
      }

      projectionStateKeyRef.current = key;
      // Keep DOM labels on the same rendered frame as the MapLibre custom layer.
      flushSync(() => {
        setThreeProjectionState(state);
      });
    },
    []
  );

  const resetThreeProjectionState = useCallback(() => {
    projectionStateKeyRef.current = "";
    setThreeProjectionState(null);
  }, []);

  return {
    handleThreeProjectionSync,
    resetThreeProjectionState,
    threeProjectionState,
  };
};

const horizontalDistanceMeters = (start: LinePoint, end: LinePoint) => {
  const startLatitude = THREE.MathUtils.degToRad(start.latitude);
  const endLatitude = THREE.MathUtils.degToRad(end.latitude);
  const deltaLatitude = endLatitude - startLatitude;
  const deltaLongitude = THREE.MathUtils.degToRad(
    end.longitude - start.longitude
  );
  const sinLatitude = Math.sin(deltaLatitude / 2);
  const sinLongitude = Math.sin(deltaLongitude / 2);
  const haversine =
    sinLatitude * sinLatitude +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      sinLongitude *
      sinLongitude;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
  );
};

const resolveMeasurementLineColor = (
  points: readonly [LinePoint, LinePoint]
) => {
  const horizontalDistance = horizontalDistanceMeters(points[0], points[1]);
  const verticalDistance = Math.abs(points[1].altitude - points[0].altitude);

  if (verticalDistance < 1 && horizontalDistance >= 1) {
    return MEASUREMENT_HORIZONTAL_COLOR;
  }

  if (verticalDistance >= horizontalDistance * 3) {
    return MEASUREMENT_VERTICAL_COLOR;
  }

  return MEASUREMENT_DIRECT_COLOR;
};

const buildLineVariants = (
  lines: readonly SampleMeasurementLine[]
): readonly LineVariant[] =>
  lines.map((line) => ({
    id: line.id,
    label: line.displayName ? `${line.label} ${line.displayName}` : line.label,
    color: resolveMeasurementLineColor(line.points),
    points: line.points,
  }));

const normalizeCssColorForThree = (cssColor: string) => {
  const rgbaMatch = cssColor.match(
    /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*[^)]+\)$/i
  );

  if (rgbaMatch) {
    return `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
  }

  return cssColor;
};

const createThreeColor = (color: string) => {
  try {
    return new THREE.Color(normalizeCssColorForThree(color));
  } catch {
    return new THREE.Color("#ffffff");
  }
};

const isFiniteVector3 = (point: THREE.Vector3) =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  Number.isFinite(point.z);

const setLineGeometryUnbounded = (geometry: THREE.BufferGeometry) => {
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, 0),
    Number.POSITIVE_INFINITY
  );
};

const createPointExtrusionGeometry = ({
  bottomRadius,
  topRadius,
  height,
  transitionFraction,
  segments = 32,
}: {
  bottomRadius: number;
  topRadius: number;
  height: number;
  transitionFraction: number;
  segments?: number;
}) => {
  const clampedTransitionFraction = clampNumber(transitionFraction, 1, 0, 1);
  const bottomY = -height / 2;
  const topY = height / 2;
  const transitionY = bottomY + height * clampedTransitionFraction;
  const hasRadiusStep =
    Math.abs(bottomRadius - topRadius) > Number.EPSILON &&
    clampedTransitionFraction > 0 &&
    clampedTransitionFraction < 1;
  const rings = hasRadiusStep
    ? [
        { y: bottomY, radius: bottomRadius },
        { y: transitionY, radius: bottomRadius },
        { y: transitionY, radius: topRadius },
        { y: topY, radius: topRadius },
      ]
    : [
        { y: bottomY, radius: bottomRadius },
        { y: topY, radius: topRadius },
      ];
  const positions: number[] = [];
  const indices: number[] = [];

  for (const ring of rings) {
    for (let segmentIndex = 0; segmentIndex < segments; segmentIndex += 1) {
      const angle = (segmentIndex / segments) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * ring.radius,
        ring.y,
        Math.sin(angle) * ring.radius
      );
    }
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const currentRingStart = ringIndex * segments;
    const nextRingStart = (ringIndex + 1) * segments;

    for (let segmentIndex = 0; segmentIndex < segments; segmentIndex += 1) {
      const nextSegmentIndex = (segmentIndex + 1) % segments;
      const current = currentRingStart + segmentIndex;
      const currentNext = currentRingStart + nextSegmentIndex;
      const next = nextRingStart + segmentIndex;
      const nextNext = nextRingStart + nextSegmentIndex;

      indices.push(current, next, currentNext, currentNext, next, nextNext);
    }
  }

  const bottomCenterIndex = positions.length / 3;
  positions.push(0, bottomY, 0);
  const topCenterIndex = positions.length / 3;
  positions.push(0, topY, 0);
  const topRingStart = (rings.length - 1) * segments;

  for (let segmentIndex = 0; segmentIndex < segments; segmentIndex += 1) {
    const nextSegmentIndex = (segmentIndex + 1) % segments;

    indices.push(
      bottomCenterIndex,
      nextSegmentIndex,
      segmentIndex,
      topCenterIndex,
      topRingStart + segmentIndex,
      topRingStart + nextSegmentIndex
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
};

const toMercatorCoordinate = (point: LinePoint) =>
  maplibregl.MercatorCoordinate.fromLngLat(
    [point.longitude, point.latitude],
    point.altitude
  );

const removeLayerIfPresent = (map: MapLibreMap, layerId: string) => {
  try {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  } catch {
    // MapLibre may already have disposed its style during Storybook unmount.
  }
};

const removeSourceIfPresent = (map: MapLibreMap, sourceId: string) => {
  try {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  } catch {
    // MapLibre may already have disposed its style during Storybook unmount.
  }
};

const isIgnorableMapLibreStoryError = (message: string | undefined) =>
  !message ||
  message === "__publicField is not defined" ||
  message === "Ge is not defined" ||
  message.startsWith(
    "AJAXError:  (400): https://geodaten.metropoleruhr.de/spw2"
  );

class RenderCapabilityLineLayer implements CustomLayerInterface {
  id = THREE_LAYER_ID;
  type: "custom" = "custom";
  renderingMode: "3d" = "3d";

  private camera: THREE.Camera | null = null;
  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private readonly origin = maplibregl.MercatorCoordinate.fromLngLat(
    [BUGA_BRIDGE_POSITION.longitude, BUGA_BRIDGE_POSITION.latitude],
    BUGA_BRIDGE_POSITION.altitude
  );
  private readonly screenLineMaterials: LineMaterial[] = [];
  private bridgeLoadCancelled = false;

  constructor(
    private readonly variants: readonly LineVariant[],
    private readonly options: LineLayerOptions
  ) {}

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;

    for (const variant of this.variants) {
      this.addScreenPixelLine(variant);
    }

    if (this.options.showBugaBridge) {
      this.addBugaBridgeAsset();
    }

    if (
      this.options.showTerrainRelativePointExtrusion &&
      this.options.terrainRelativePointExtrusionFeature
    ) {
      this.addPointExtrusion(
        this.options.terrainRelativePointExtrusionFeature,
        "terrain-relative"
      );
    }

    if (
      this.options.showFixedFloorPointExtrusion &&
      this.options.fixedFloorPointExtrusionFeature
    ) {
      this.addPointExtrusion(
        this.options.fixedFloorPointExtrusionFeature,
        "absolute"
      );
    }

    map.triggerRepaint();
  }

  render(
    _gl: WebGLRenderingContext | WebGL2RenderingContext,
    args: MapLibreRenderArgs
  ) {
    if (!this.camera || !this.renderer || !this.scene) return;

    const projectionMatrix =
      args.defaultProjectionData?.mainMatrix ?? args.modelViewProjectionMatrix;
    if (!projectionMatrix) return;

    this.syncScreenLineResolution();

    const mapProjection = new THREE.Matrix4().fromArray(
      Array.from(projectionMatrix)
    );
    const modelTransform = new THREE.Matrix4().makeTranslation(
      this.origin.x,
      this.origin.y,
      this.origin.z
    );

    this.camera.projectionMatrix = mapProjection.multiply(modelTransform);
    this.syncProjectionState();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  onRemove() {
    this.bridgeLoadCancelled = true;
    if (this.scene) {
      disposeObject(this.scene);
    }
    this.camera = null;
    this.map = null;
    this.renderer = null;
    this.scene = null;
    this.screenLineMaterials.length = 0;
  }

  private syncScreenLineResolution() {
    for (const material of this.screenLineMaterials) {
      this.syncScreenLineMaterialResolution(material);
    }
  }

  private syncScreenLineMaterialResolution(material: LineMaterial) {
    const canvas = this.map?.getCanvas();
    if (!canvas) return;

    material.resolution.set(
      Math.max(1, canvas.clientWidth || canvas.width || 1),
      Math.max(1, canvas.clientHeight || canvas.height || 1)
    );
  }

  private registerScreenPixelLine(line: Line2, material: LineMaterial) {
    this.screenLineMaterials.push(material);
    // MapLibre owns a DPR-scaled drawing buffer; keep LineMaterial in CSS pixels.
    line.onBeforeRender = () => {
      this.syncScreenLineMaterialResolution(material);
    };
    this.syncScreenLineMaterialResolution(material);
  }

  private toLocalPoint(point: LinePoint) {
    return toLocalMercatorVector(toMercatorCoordinate(point), this.origin);
  }

  private syncProjectionState() {
    if (!this.camera || !this.map || !this.options.onProjectionSync) return;

    const canvas = this.map.getCanvas();
    this.options.onProjectionSync({
      origin: {
        x: this.origin.x,
        y: this.origin.y,
        z: this.origin.z,
      },
      matrix: Array.from(this.camera.projectionMatrix.elements),
      width: canvas.clientWidth || canvas.width,
      height: canvas.clientHeight || canvas.height,
    });
  }

  private addScreenPixelLine(variant: LineVariant) {
    if (!this.scene) return;

    const localPoints = variant.points.map((point) => this.toLocalPoint(point));
    if (localPoints.some((point) => !isFiniteVector3(point))) {
      return;
    }

    const geometry = new LineGeometry();
    geometry.setPositions(localPoints.flatMap((point) => point.toArray()));
    setLineGeometryUnbounded(geometry);
    const material = new LineMaterial({
      color: createThreeColor(variant.color).getHex(),
      linewidth: clampNumber(this.options.screenPixelLineWidth, 4, 1, 12),
      opacity: clampNumber(this.options.lineOpacity, 0.96, 0.1, 1),
      transparent: true,
      worldUnits: false,
    });
    material.depthTest = true;
    material.depthWrite = false;

    const line = new Line2(geometry, material);
    line.frustumCulled = false;
    line.name = variant.label;
    this.registerScreenPixelLine(line, material);
    this.scene.add(line);
    this.syncScreenLineResolution();
  }

  private addBugaBridgeAsset() {
    if (!this.scene) return;

    addBugaBridgeAssetToScene({
      scene: this.scene,
      origin: this.origin,
      isCancelled: () => this.bridgeLoadCancelled || !this.scene || !this.map,
      onLoaded: (bridge) => {
        if (this.scene && this.options.showModelAxes) {
          addModelAxesToScene({
            scene: this.scene,
            name: bridge.name,
            length: MODEL_AXES_LENGTH_METERS,
            matrix: bridge.matrix,
          });
        }
        this.map?.triggerRepaint();
      },
      onError: (error) => {
        console.warn("[MapLibre render-capability story] bridge GLB failed", {
          source: BUGA_BRIDGE_ASSET_URI,
          error,
        });
        this.map?.triggerRepaint();
      },
    });
  }

  private addPointExtrusion(
    feature: PointExtrusionFeature,
    baseMode: "terrain-relative" | "absolute"
  ) {
    if (!this.scene) return;

    const baseMeters = getPointExtrusionBaseMeters(feature);
    const topMeters = getPointExtrusionTopMeters(feature);
    const terrainElevationMeters =
      baseMode === "terrain-relative"
        ? this.map?.queryTerrainElevation([
            feature.properties.centerLongitude,
            feature.properties.centerLatitude,
          ]) ?? SAMPLE_POINT_EXTRUSION_DEFAULTS.fixedFloorAltitudeMeters
        : 0;
    const coordinate = maplibregl.MercatorCoordinate.fromLngLat(
      [feature.properties.centerLongitude, feature.properties.centerLatitude],
      terrainElevationMeters + baseMeters
    );
    const position = toLocalMercatorVector(coordinate, this.origin);
    const mercatorScale = coordinate.meterInMercatorCoordinateUnits();
    const height = Math.max(0.1, topMeters - baseMeters) * mercatorScale;
    const bottomRadius =
      Math.max(0.1, getPointExtrusionRadiusMeters(feature)) * mercatorScale;
    const topRadius =
      Math.max(0.1, getPointExtrusionTopRadiusMeters(feature)) * mercatorScale;
    const geometry = createPointExtrusionGeometry({
      bottomRadius,
      topRadius,
      height,
      transitionFraction: getPointExtrusionRadiusTransitionFraction(feature),
    });
    const material = new THREE.MeshBasicMaterial({
      color: createThreeColor(getPointExtrusionColor(feature)),
      opacity: clampNumber(getPointExtrusionOpacity(feature), 0.78, 0.1, 1),
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    const extrusion = new THREE.Mesh(geometry, material);
    extrusion.name = feature.properties.name;
    extrusion.position.copy(position).add(new THREE.Vector3(0, 0, height / 2));
    extrusion.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    );
    this.scene.add(extrusion);

    if (this.options.showModelAxes) {
      addModelAxesToScene({
        scene: this.scene,
        name: extrusion.name,
        length: MODEL_AXES_LENGTH_METERS * mercatorScale,
        position: extrusion.position,
        quaternion: extrusion.quaternion,
      });
    }
  }
}

const getLineMidpoint = (
  points: readonly [LinePoint, LinePoint]
): LinePoint => ({
  id: `${points[0].id}-${points[1].id}-midpoint`,
  longitude: (points[0].longitude + points[1].longitude) / 2,
  latitude: (points[0].latitude + points[1].latitude) / 2,
  altitude: (points[0].altitude + points[1].altitude) / 2,
});

const projectMercatorCoordinateWithMatrix = (
  state: ThreeProjectionState,
  matrix: THREE.Matrix4,
  mercatorCoordinate: Pick<maplibregl.MercatorCoordinate, "x" | "y" | "z">
) => {
  const clip = new THREE.Vector4(
    mercatorCoordinate.x - state.origin.x,
    mercatorCoordinate.y - state.origin.y,
    mercatorCoordinate.z - state.origin.z,
    1
  ).applyMatrix4(matrix);

  if (!Number.isFinite(clip.w) || Math.abs(clip.w) < 1e-12) {
    return null;
  }

  const normalizedX = clip.x / clip.w;
  const normalizedY = clip.y / clip.w;

  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
    return null;
  }

  return {
    x: ((normalizedX + 1) / 2) * state.width,
    y: ((1 - normalizedY) / 2) * state.height,
  };
};

const projectPointWithThreeProjection = (
  state: ThreeProjectionState,
  point: LinePoint
) => {
  const matrix = new THREE.Matrix4().fromArray(state.matrix);
  return projectMercatorCoordinateWithMatrix(
    state,
    matrix,
    toMercatorCoordinate(point)
  );
};

const useDomMarkers = (
  projectionState: ThreeProjectionState | null,
  variants: readonly LineVariant[],
  measurementPoints: readonly SampleMeasurementPoint[]
) => {
  return useMemo(() => {
    if (!projectionState) {
      return [];
    }

    return [
      ...variants.flatMap((variant) => {
        const screen = projectPointWithThreeProjection(
          projectionState,
          getLineMidpoint(variant.points)
        );

        return screen
          ? [
              {
                id: `${variant.id}-label`,
                x: screen.x,
                y: screen.y,
                color: variant.color,
                label: variant.label,
                kind: "line-label" as const,
              },
            ]
          : [];
      }),
      ...measurementPoints.flatMap((markerPoint) => {
        const screen = projectPointWithThreeProjection(
          projectionState,
          markerPoint.point
        );

        return screen
          ? [
              {
                id: `${markerPoint.id}-label`,
                x: screen.x,
                y: screen.y,
                color: ANNOTATION_NODE_COLOR,
                label: markerPoint.displayName
                  ? `${markerPoint.label} ${markerPoint.displayName}`
                  : markerPoint.label,
                kind: "point-label" as const,
              },
            ]
          : [];
      }),
    ] satisfies DomMarker[];
  }, [measurementPoints, projectionState, variants]);
};

const syncTerrain = (
  map: MapLibreMap,
  terrainEnabled: boolean,
  terrainExaggeration: number
) => {
  if (!map.getSource(WUPPERTAL_TERRAIN_SOURCE_ID)) {
    return;
  }

  if (terrainEnabled) {
    map.setTerrain({
      source: WUPPERTAL_TERRAIN_SOURCE_ID,
      exaggeration: clampNumber(terrainExaggeration, 1, 0, 4),
    });
  } else if (map.terrain) {
    map.setTerrain(null);
  }

  map.triggerRepaint();
};

const syncLineLayer = (
  map: MapLibreMap,
  variants: readonly LineVariant[],
  options: LineLayerOptions
) => {
  removeLayerIfPresent(map, THREE_LAYER_ID);
  map.addLayer(new RenderCapabilityLineLayer(variants, options));
  map.triggerRepaint();
};

const syncNativePointExtrusionLayer = (
  map: MapLibreMap,
  {
    showExtrusion,
    diameterMeters,
    heightMeters,
  }: {
    showExtrusion: boolean;
    diameterMeters: number;
    heightMeters: number;
  }
) => {
  removeLayerIfPresent(map, POINT_EXTRUSION_LAYER_ID);

  if (!showExtrusion) {
    removeSourceIfPresent(map, POINT_EXTRUSION_SOURCE_ID);
    return;
  }

  const data = filterPointExtrusionsAsPolygons(
    createPointExtrusionGeoJson(SAMPLE_POINT_EXTRUSION_SOURCE, {
      diameterMeters: clampNumber(
        diameterMeters,
        SAMPLE_POINT_EXTRUSION_DEFAULTS.diameterMeters,
        1,
        60
      ),
      extrusionHeightMeters: clampNumber(
        heightMeters,
        SAMPLE_POINT_EXTRUSION_DEFAULTS.extrusionHeightMeters,
        1,
        260
      ),
    }),
    "maplibre-native-fill-extrusion"
  );
  const nativeFeature = data.features[0];
  const source = map.getSource(POINT_EXTRUSION_SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined;

  if (source) {
    source.setData(data);
  } else {
    map.addSource(POINT_EXTRUSION_SOURCE_ID, {
      type: "geojson",
      data,
    });
  }

  map.addLayer({
    id: POINT_EXTRUSION_LAYER_ID,
    type: "fill-extrusion",
    source: POINT_EXTRUSION_SOURCE_ID,
    paint: {
      "fill-extrusion-color": ["get", "fill-extrusion-color"],
      "fill-extrusion-height": ["get", "fill-extrusion-height"],
      "fill-extrusion-base": ["get", "fill-extrusion-base"],
      "fill-extrusion-opacity": nativeFeature
        ? getPointExtrusionOpacity(nativeFeature)
        : 0.72,
      "fill-extrusion-vertical-gradient": true,
    },
  });
  if (map.getLayer(THREE_LAYER_ID)) {
    map.moveLayer(THREE_LAYER_ID);
  }
  map.triggerRepaint();
};

const RenderCapabilityScene = (args: StraightLineRenderCapabilityStoryArgs) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCameraRef = useRef({
    bearing: clampNumber(args.bearing, -96, -180, 180),
    pitch: clampNumber(args.pitch, 70, 0, 85),
    zoom: clampNumber(args.zoom, 16.4, 13, 18),
  });
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const {
    handleThreeProjectionSync,
    resetThreeProjectionState,
    threeProjectionState,
  } = useMapLibreThreeProjectionState();
  const variants = useMemo(
    () => buildLineVariants(SAMPLE_MEASUREMENT_LINES),
    []
  );
  const pointExtrusionData = useMemo(
    () =>
      createPointExtrusionGeoJson(SAMPLE_POINT_EXTRUSION_SOURCE, {
        diameterMeters: clampNumber(
          args.pointExtrusionDiameterMeters,
          SAMPLE_POINT_EXTRUSION_DEFAULTS.diameterMeters,
          1,
          60
        ),
        extrusionHeightMeters: clampNumber(
          args.pointExtrusionHeightMeters,
          SAMPLE_POINT_EXTRUSION_DEFAULTS.extrusionHeightMeters,
          1,
          260
        ),
      }),
    [args.pointExtrusionDiameterMeters, args.pointExtrusionHeightMeters]
  );
  const domMarkers = useDomMarkers(
    threeProjectionState,
    variants,
    SAMPLE_MEASUREMENT_POINTS
  );
  const lineLayerOptions = useMemo<LineLayerOptions>(
    () => ({
      showBugaBridge: args.showBugaBridge === true,
      showModelAxes: args.showModelAxes === true,
      showTerrainRelativePointExtrusion:
        args.showTerrainRelativePointExtrusion === true,
      showFixedFloorPointExtrusion: args.showFixedFloorPointExtrusion === true,
      terrainRelativePointExtrusionFeature: findPointExtrusion(
        pointExtrusionData,
        "maplibre-native-fill-extrusion"
      ),
      fixedFloorPointExtrusionFeature: findPointExtrusion(
        pointExtrusionData,
        "maplibre-custom-layer"
      ),
      screenPixelLineWidth: args.screenPixelLineWidth,
      lineOpacity: args.lineOpacity,
      onProjectionSync: handleThreeProjectionSync,
    }),
    [
      pointExtrusionData,
      handleThreeProjectionSync,
      args.lineOpacity,
      args.screenPixelLineWidth,
      args.showTerrainRelativePointExtrusion,
      args.showFixedFloorPointExtrusion,
      args.showBugaBridge,
      args.showModelAxes,
    ]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createWuppertalStoryStyle(args.surfaceTiles),
      center: SAMPLE_MEASUREMENTS_STORY_CENTER,
      zoom: initialCameraRef.current.zoom,
      pitch: initialCameraRef.current.pitch,
      bearing: initialCameraRef.current.bearing,
      maxPitch: 85,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showZoom: true, showCompass: true }),
      "top-right"
    );

    const handleReady = () => {
      setStyleReady(true);
    };
    const handleMapError = (event: { error?: Error }) => {
      const message = event.error?.message;
      if (!isIgnorableMapLibreStoryError(message)) {
        console.warn("[MapLibre render-capability story]", message);
      }
    };

    map.on("load", handleReady);
    map.on("error", handleMapError);

    mapRef.current = map;
    setMapInstance(map);

    const resizeFrame = window.requestAnimationFrame(() => map.resize());

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      map.off("load", handleReady);
      map.off("error", handleMapError);
      setMapInstance(null);
      setStyleReady(false);
      resetThreeProjectionState();
      map.remove();
      mapRef.current = null;
    };
  }, [args.surfaceTiles, resetThreeProjectionState]);

  useEffect(() => {
    if (!mapInstance) return;

    mapInstance.jumpTo({
      center: SAMPLE_MEASUREMENTS_STORY_CENTER,
      zoom: clampNumber(args.zoom, 16.4, 13, 18),
      pitch: clampNumber(args.pitch, 70, 0, 85),
      bearing: clampNumber(args.bearing, -96, -180, 180),
    });
  }, [args.bearing, args.pitch, args.zoom, mapInstance]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    syncTerrain(
      mapInstance,
      args.terrainEnabled === true,
      args.terrainExaggeration
    );
  }, [args.terrainEnabled, args.terrainExaggeration, mapInstance, styleReady]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    const sync = () => {
      if (!mapInstance.isStyleLoaded()) return;
      syncNativePointExtrusionLayer(mapInstance, {
        showExtrusion: args.showNativeFillExtrusion === true,
        diameterMeters: args.pointExtrusionDiameterMeters,
        heightMeters: args.pointExtrusionHeightMeters,
      });
    };

    sync();
    mapInstance.on("style.load", sync);

    return () => {
      mapInstance.off("style.load", sync);
      removeLayerIfPresent(mapInstance, POINT_EXTRUSION_LAYER_ID);
      removeSourceIfPresent(mapInstance, POINT_EXTRUSION_SOURCE_ID);
    };
  }, [
    args.pointExtrusionDiameterMeters,
    args.pointExtrusionHeightMeters,
    args.showNativeFillExtrusion,
    mapInstance,
    styleReady,
  ]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    const sync = () => {
      if (!mapInstance.isStyleLoaded()) return;
      syncLineLayer(mapInstance, variants, lineLayerOptions);
    };

    sync();
    mapInstance.on("style.load", sync);

    return () => {
      mapInstance.off("style.load", sync);
      removeLayerIfPresent(mapInstance, THREE_LAYER_ID);
    };
  }, [lineLayerOptions, mapInstance, styleReady, variants]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    let cancelled = false;
    const sync = () => {
      if (cancelled || !mapInstance.isStyleLoaded()) return;
      syncMapLibreLod2Layer({
        enabled: args.showLod2Buildings === true,
        keepLayerIdsOnTop: [THREE_LAYER_ID],
        map: mapInstance,
      }).catch((error: unknown) => {
        if (!cancelled) {
          console.warn("[MapLibre render-capability story] LOD2 layer", error);
        }
      });
    };

    sync();
    mapInstance.on("style.load", sync);

    return () => {
      cancelled = true;
      mapInstance.off("style.load", sync);
      removeMapLibreLod2Layer(mapInstance);
    };
  }, [args.showLod2Buildings, mapInstance, styleReady]);

  return (
    <div style={storyShellStyle}>
      <div ref={containerRef} style={mapContainerStyle} />
      {domMarkers.map((marker) => (
        <div
          key={marker.id}
          style={{
            ...markerStyle,
            color: marker.color,
            left: marker.x,
            top: marker.y,
            width: marker.kind === "line-label" ? 8 : 10,
            height: marker.kind === "line-label" ? 8 : 10,
          }}
        >
          {marker.label ? (
            <span style={markerLabelStyle}>{marker.label}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
};

const meta: Meta<StraightLineRenderCapabilityStoryArgs> = {
  title: "MapLibre Playground",
  render: (args) => <RenderCapabilityScene {...args} />,
  args: {
    showBugaBridge: true,
    showModelAxes: false,
    surfaceTiles: "stadtplan",
    showLod2Buildings: false,
    terrainEnabled: true,
    terrainExaggeration: 1,
    screenPixelLineWidth: 4,
    lineOpacity: 0.96,
    showNativeFillExtrusion: false,
    showTerrainRelativePointExtrusion: true,
    showFixedFloorPointExtrusion: true,
    pointExtrusionDiameterMeters:
      SAMPLE_POINT_EXTRUSION_DEFAULTS.diameterMeters,
    pointExtrusionHeightMeters:
      SAMPLE_POINT_EXTRUSION_DEFAULTS.extrusionHeightMeters,
    pitch: 70,
    bearing: -96,
    zoom: 16.4,
  },
  argTypes: {
    showBugaBridge: {
      name: "show 3D bridge asset",
      control: { type: "boolean" },
      table: { category: CONTROL_CATEGORY_MAP },
    },
    showModelAxes: {
      name: "show model axes",
      control: { type: "boolean" },
      description:
        "Show generic local axes for each Three.js model in the story scene.",
      table: { category: CONTROL_CATEGORY_MAP },
    },
    terrainEnabled: {
      name: "render terrain surface",
      control: { type: "boolean" },
      description:
        "Render MapLibre raster-dem terrain. Disable when the terrain tile skirts get in the way of inspecting the custom geometry.",
      table: { category: CONTROL_CATEGORY_MAP },
    },
    surfaceTiles: {
      name: "basemap",
      options: SURFACE_TILE_OPTIONS,
      control: { type: "inline-radio", labels: SURFACE_TILE_LABELS },
      description: "Vector map or Luftbild raster basemap.",
      table: { category: CONTROL_CATEGORY_MAP },
    },
    showLod2Buildings: {
      name: "show LOD2 buildings",
      control: { type: "boolean" },
      description:
        "Load the basemap.de LOD2 buildings as an optional MapLibre custom layer.",
      table: { category: CONTROL_CATEGORY_MAP },
    },
    terrainExaggeration: {
      if: { arg: "terrainEnabled", eq: true },
      control: { type: "range", min: 0, max: 4, step: 0.1 },
      table: { category: CONTROL_CATEGORY_MAP },
    },
    screenPixelLineWidth: {
      control: { type: "range", min: 1, max: 12, step: 0.5 },
      description: "Fixed screen-pixel width for the Three.js Line2 line mode.",
      table: { category: CONTROL_CATEGORY_LINE },
    },
    lineOpacity: {
      control: { type: "range", min: 0.1, max: 1, step: 0.05 },
      table: { category: CONTROL_CATEGORY_LINE },
    },
    showNativeFillExtrusion: {
      control: { type: "boolean" },
      description:
        "Show the real native MapLibre fill-extrusion style layer, offset 20m west. This is experimental because it can interfere with CustomLayer 3D rendering.",
      table: { category: CONTROL_CATEGORY_EXTRUSION },
    },
    showTerrainRelativePointExtrusion: {
      control: { type: "boolean" },
      description:
        "Show the MapLibre-parameterized extrusion feature in the same Three layer as the lines, offset 20m west.",
      table: { category: CONTROL_CATEGORY_EXTRUSION },
    },
    showFixedFloorPointExtrusion: {
      control: { type: "boolean" },
      description:
        "Show the custom-layer extrusion feature, offset 20m east with a fixed 200m altitude floor.",
      table: { category: CONTROL_CATEGORY_EXTRUSION },
    },
    pointExtrusionDiameterMeters: {
      control: { type: "range", min: 1, max: 60, step: 1 },
      table: { category: CONTROL_CATEGORY_EXTRUSION },
    },
    pointExtrusionHeightMeters: {
      control: { type: "range", min: 1, max: 260, step: 1 },
      table: { category: CONTROL_CATEGORY_EXTRUSION },
    },
    pitch: {
      control: { type: "range", min: 0, max: 85, step: 1 },
      table: { category: CONTROL_CATEGORY_MAP },
    },
    bearing: {
      control: { type: "range", min: -180, max: 180, step: 1 },
      table: { category: CONTROL_CATEGORY_MAP },
    },
    zoom: {
      control: { type: "range", min: 13, max: 18, step: 0.1 },
      table: { category: CONTROL_CATEGORY_MAP },
    },
  },
  parameters: {
    controls: {
      include: [
        "render terrain surface",
        "basemap",
        "show LOD2 buildings",
        "terrainExaggeration",
        "pitch",
        "bearing",
        "zoom",
        "show 3D bridge asset",
        "show model axes",
        "screenPixelLineWidth",
        "lineOpacity",
        "showNativeFillExtrusion",
        "showTerrainRelativePointExtrusion",
        "showFixedFloorPointExtrusion",
        "pointExtrusionDiameterMeters",
        "pointExtrusionHeightMeters",
      ],
    },
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Straight3DLinePrimitives: Story = {
  name: "Straight 3D Line Primitives",
};
