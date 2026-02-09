import {
  BoundingSphere,
  Cartesian3,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPrimitive,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  getBoundingSphereFromCoordinates,
  type Scene,
} from "@carma/cesium";
import type { Feature, FeatureCollection, Geometry } from "geojson";

const DEFAULT_FILL_COLOR = "#ffffff";
const MIN_NON_ZERO_OPACITY = 1 / 254;
const DEFAULT_OPACITY = MIN_NON_ZERO_OPACITY;

type PolygonCoordinates = number[][][];

const normalizeColor = (color: string | Color | undefined): Color => {
  if (!color) return Color.fromCssColorString(DEFAULT_FILL_COLOR);
  if (typeof color === "string") return Color.fromCssColorString(color);
  return color;
};

export type ClampOpacityOptions = {
  defaultOpacity?: number;
  minNonZeroOpacity?: number;
};

export const clampOpacityToColorBuffer = (
  opacity: number | undefined,
  options: ClampOpacityOptions = {}
): number => {
  const minNonZeroOpacity = options.minNonZeroOpacity ?? MIN_NON_ZERO_OPACITY;
  const defaultOpacity = options.defaultOpacity ?? DEFAULT_OPACITY;
  const normalized = opacity ?? defaultOpacity;
  const clamped = Math.max(0, Math.min(1, normalized));
  if (clamped === 0) return 0;
  return Math.max(minNonZeroOpacity, clamped);
};

const isSameCoordinate = (
  left: number[] | undefined,
  right: number[] | undefined
): boolean => {
  if (!left || !right) return false;
  return (
    left[0] === right[0] &&
    left[1] === right[1] &&
    (left[2] ?? 0) === (right[2] ?? 0)
  );
};

const normalizeRing = (ring: number[][]): number[][] => {
  const validCoordinates = ring.filter((coord) => coord.length >= 2);
  if (validCoordinates.length === 0) return [];

  const first = validCoordinates[0];
  const last = validCoordinates[validCoordinates.length - 1];
  if (
    validCoordinates.length > 3 &&
    isSameCoordinate(first, last) &&
    first !== undefined &&
    last !== undefined
  ) {
    return validCoordinates.slice(0, -1);
  }

  return validCoordinates;
};

const extractPolygonsFromGeometry = (
  geometry: Geometry
): PolygonCoordinates[] => {
  switch (geometry.type) {
    case "Polygon":
      return [geometry.coordinates as PolygonCoordinates];
    case "MultiPolygon":
      return geometry.coordinates as PolygonCoordinates[];
    default:
      return [];
  }
};

const extractPolygonsFromGeoJson = (
  geojson: Feature | FeatureCollection
): PolygonCoordinates[] => {
  const features =
    geojson.type === "FeatureCollection" ? geojson.features : [geojson];
  return features.flatMap((feature) => {
    if (!feature.geometry) return [];
    return extractPolygonsFromGeometry(feature.geometry);
  });
};

const toPositions = (ring: number[][]): Cartesian3[] =>
  normalizeRing(ring).map((coord) =>
    Cartesian3.fromDegrees(coord[0], coord[1], coord[2] ?? 0)
  );

const toPolygonHierarchy = (
  polygonCoordinates: PolygonCoordinates
): PolygonHierarchy | null => {
  const [outerRing, ...holeRings] = polygonCoordinates;
  if (!outerRing) return null;

  const outerPositions = toPositions(outerRing);
  if (outerPositions.length < 3) return null;

  const holeHierarchies = holeRings.flatMap((holeRing) => {
    const holePositions = toPositions(holeRing);
    if (holePositions.length < 3) return [];
    return [new PolygonHierarchy(holePositions)];
  });

  return new PolygonHierarchy(outerPositions, holeHierarchies);
};

const getAllCoordinates = (polygons: PolygonCoordinates[]): number[][] => {
  const coordinates: number[][] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const coord of normalizeRing(ring)) {
        coordinates.push(coord);
      }
    }
  }
  return coordinates;
};

export type GroundPolygonVisualizerOptions = {
  /** Fill color (CSS string or Cesium Color) */
  fillColor?: string | Color;
  /** Fill opacity in range [0, 1] */
  opacity?: number;
};

export type GroundPolygonVisualizer = {
  readonly id: string;
  selected: boolean;
  readonly isAttached: boolean;
  readonly isReady: boolean;

  attach: (scene: Scene, requestRender: () => void) => Promise<void>;
  detach: () => void;
  destroy: () => void;

  getBoundingSphere: () => BoundingSphere | null;
  isPicked: (pickedId: unknown) => boolean;
};

export const createGroundPolygonVisualizer = (
  id: string,
  geojson: Feature | FeatureCollection,
  options: GroundPolygonVisualizerOptions = {}
): GroundPolygonVisualizer => {
  const fillColor = normalizeColor(options.fillColor);
  const opacity = clampOpacityToColorBuffer(options.opacity);
  const polygons = extractPolygonsFromGeoJson(geojson);

  let _selected = false;
  let _isAttached = false;
  let _isReady = false;
  let _isDestroyed = false;

  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let polygonPrimitive: GroundPrimitive | null = null;

  const createGroundPolygons = (): boolean => {
    if (!scene || polygons.length === 0) return false;

    const geometryInstances = polygons.flatMap((polygon, polygonIndex) => {
      const hierarchy = toPolygonHierarchy(polygon);
      if (!hierarchy) return [];

      return [
        new GeometryInstance({
          id: { featureId: id, polygonIndex },
          geometry: new PolygonGeometry({
            polygonHierarchy: hierarchy,
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              fillColor.withAlpha(opacity)
            ),
          },
        }),
      ];
    });

    if (geometryInstances.length === 0) return false;

    polygonPrimitive = new GroundPrimitive({
      geometryInstances,
      appearance: new PerInstanceColorAppearance({
        translucent: opacity < 1,
      }),
      asynchronous: false,
      releaseGeometryInstances: false,
      classificationType: ClassificationType.BOTH,
    });

    scene.groundPrimitives.add(polygonPrimitive);
    return true;
  };

  const visualizer: GroundPolygonVisualizer = {
    get id() {
      return id;
    },

    get selected() {
      return _selected;
    },

    set selected(value: boolean) {
      if (_selected === value) return;
      _selected = value;
      // No visual distinction for selection at the moment.
    },

    get isAttached() {
      return _isAttached;
    },

    get isReady() {
      return _isReady;
    },

    attach: async (sceneRef, requestRenderFn) => {
      if (_isDestroyed) {
        throw new Error("Cannot attach destroyed visualizer");
      }
      if (_isAttached) {
        visualizer.detach();
      }
      if (polygons.length === 0) {
        throw new Error("No valid polygon geometry in geojson");
      }

      scene = sceneRef;
      requestRender = requestRenderFn;

      if (_isDestroyed) return;

      const created = createGroundPolygons();
      if (!created) {
        throw new Error("No valid polygon geometry in geojson");
      }

      _isAttached = true;
      _isReady = true;
      requestRender?.();
    },

    detach: () => {
      if (!_isAttached || !scene) return;

      if (polygonPrimitive) {
        scene.groundPrimitives.remove(polygonPrimitive);
        polygonPrimitive = null;
      }

      _isAttached = false;
      _isReady = false;
      requestRender?.();
    },

    destroy: () => {
      if (_isDestroyed) return;
      visualizer.detach();
      _isDestroyed = true;
      scene = null;
      requestRender = null;
    },

    getBoundingSphere: () => {
      const allCoordinates = getAllCoordinates(polygons);
      if (allCoordinates.length === 0) return null;
      return getBoundingSphereFromCoordinates(allCoordinates);
    },

    isPicked: (pickedId: unknown) => {
      if (!pickedId || typeof pickedId !== "object") return false;
      const picked = pickedId as { featureId?: string };
      return picked.featureId === id;
    },
  };

  return visualizer;
};
