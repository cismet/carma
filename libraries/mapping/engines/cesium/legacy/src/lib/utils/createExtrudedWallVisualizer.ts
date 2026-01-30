import {
  BoundingSphere,
  Cartographic,
  Color,
  Primitive,
  type CesiumTerrainProvider,
  type Scene,
} from "@carma/cesium";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { Easing, type Easing as EasingFunction } from "@carma-commons/math";

import {
  createWallPrimitives,
  type WallPrimitivesResult,
  type WallPrimitiveSegment,
} from "./adhoc-primitives/create-wall-primitives";
import { createSelectionEdgePrimitive } from "./adhoc-primitives/create-selection-edge-primitive";
import { getElevationAsync } from "./elevation";
import { getBoundingSphereFromCoordinates } from "./getBoundingSphereFromCoordinates";
import { animateOpacity } from "./animateOpacity";
import {
  applyGeometryInstanceOpacity,
  readGeometryInstanceOpacity,
} from "./geometryInstanceOpacity";

// Default values
const DEFAULT_WALL_HEIGHT_METERS = 15;
const DEFAULT_OPACITY = 0.7;
const DEFAULT_SELECTED_OPACITY = 0.4;
const DEFAULT_WALL_COLOR = "#3A7CEB";
const DEFAULT_SELECTION_LINE_WIDTH = 1.5;
const DEFAULT_ANIMATION_DURATION_MS = 200;

export type ExtrudedWallVisualizerOptions = {
  /** Wall height in meters, or array of per-segment heights */
  wallHeight?: number | number[];
  /** Wall color (CSS string or Cesium Color) */
  wallColor?: string | Color;
  /** Opacity when not selected (0-1) */
  opacity?: number;
  /** Opacity when selected (0-1) */
  selectedOpacity?: number;
  /** Selection edge line width in pixels */
  selectionLineWidth?: number;
  /** Selection edge line color */
  selectionColor?: Color;
  /** Animation duration in ms (0 for instant) */
  animationDurationMs?: number;
  /** Animation easing function */
  animationEasing?: EasingFunction;
};

export type ExtrudedWallVisualizerConfig = {
  /** Unique identifier */
  id: string;
  /** GeoJSON Feature with Polygon or MultiPolygon geometry */
  feature: Feature<Polygon | MultiPolygon>;
  /** Terrain provider for elevation sampling (DEM) */
  terrainProvider?: CesiumTerrainProvider;
  /** Surface provider for elevation sampling (DSM) */
  surfaceProvider?: CesiumTerrainProvider;
};

export type ExtrudedWallVisualizer = {
  readonly id: string;
  selected: boolean;
  readonly isAttached: boolean;
  readonly isReady: boolean;

  attach: (scene: Scene, requestRender: () => void) => Promise<void>;
  detach: () => void;
  destroy: () => void;

  getBoundingSphere: () => BoundingSphere | null;
  getCoordinatesWithHeight: () => number[][] | null;
  getWallSegments: () => WallPrimitiveSegment[];
  isPicked: (pickedId: unknown) => boolean;
};

const extractRingFromFeature = (
  feature: Feature<Polygon | MultiPolygon>
): number[][] | null => {
  const geometry = feature.geometry;
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ?? null;
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates[0]?.[0] ?? null;
  }

  return null;
};

const normalizeColor = (color: string | Color | undefined): Color => {
  if (!color) return Color.fromCssColorString(DEFAULT_WALL_COLOR);
  if (typeof color === "string") return Color.fromCssColorString(color);
  return color;
};

export const createExtrudedWallVisualizer = (
  config: ExtrudedWallVisualizerConfig,
  options: ExtrudedWallVisualizerOptions = {}
): ExtrudedWallVisualizer => {
  const { id, feature, terrainProvider, surfaceProvider } = config;

  // Normalize options with defaults
  const wallHeightConfig = options.wallHeight ?? DEFAULT_WALL_HEIGHT_METERS;
  const wallColor = normalizeColor(options.wallColor);
  const defaultOpacity = options.opacity ?? DEFAULT_OPACITY;
  const selectedOpacity = options.selectedOpacity ?? DEFAULT_SELECTED_OPACITY;
  const selectionLineWidth =
    options.selectionLineWidth ?? DEFAULT_SELECTION_LINE_WIDTH;
  const selectionColor = options.selectionColor ?? Color.YELLOW;
  const animationDurationMs =
    options.animationDurationMs ?? DEFAULT_ANIMATION_DURATION_MS;
  const animationEasing = options.animationEasing ?? Easing.SINUSOIDAL_IN_OUT;

  // Internal state
  let _selected = false;
  let _isAttached = false;
  let _isReady = false;
  let _isDestroyed = false;

  // Geometry data
  const ring = extractRingFromFeature(feature);
  let heights: number[] | null = ring
    ? ring.map((coord) => (typeof coord[2] === "number" ? coord[2] : 0))
    : null;
  let coordinatesWithHeight: number[][] | null = null;

  // Cesium primitives
  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let wallPrimitives: WallPrimitivesResult | null = null;
  let selectionPrimitive: Primitive | null = null;

  // Animation state
  let cancelAnimation: (() => void) | null = null;

  // Helper functions
  const getWallHeight = (segmentIndex: number): number => {
    if (Array.isArray(wallHeightConfig)) {
      return wallHeightConfig[segmentIndex] ?? DEFAULT_WALL_HEIGHT_METERS;
    }
    return wallHeightConfig;
  };

  const getWallColor = (isSelected: boolean): Color => {
    const opacity = isSelected ? selectedOpacity : defaultOpacity;
    return wallColor.withAlpha(opacity);
  };

  const updateCoordinatesWithHeight = () => {
    if (!ring || !heights) return;
    coordinatesWithHeight = ring.map((coord, index) => [
      coord[0],
      coord[1],
      heights![index] ?? 0,
    ]);
  };

  const sampleElevations = async (): Promise<void> => {
    if (!ring || !terrainProvider || !surfaceProvider) {
      updateCoordinatesWithHeight();
      return;
    }

    try {
      const positions = ring.map((coord) =>
        Cartographic.fromDegrees(coord[0], coord[1], 0)
      );

      const elevations = await getElevationAsync(
        terrainProvider,
        surfaceProvider,
        positions
      );

      if (_isDestroyed || elevations.length !== positions.length) {
        return;
      }

      const sampledHeights = elevations.map(
        (result) => result.surface?.height ?? result.terrain.height
      );

      // Merge sampled heights with explicit Z values
      heights = ring.map((coord, index) => {
        const coordHeight = coord[2];
        if (typeof coordHeight === "number") return coordHeight;
        return sampledHeights[index] ?? 0;
      });

      updateCoordinatesWithHeight();
    } catch {
      // Fallback to existing heights
      updateCoordinatesWithHeight();
    }
  };

  const createWalls = () => {
    if (!ring || !heights || !scene) return;

    wallPrimitives = createWallPrimitives({
      ring,
      heights,
      featureId: id,
      isSelected: _selected,
      getWallColor,
      getWallHeight,
    });

    scene.primitives.add(wallPrimitives.collection);
  };

  const addSelectionEdge = () => {
    if (!ring || !heights || !scene) return;

    selectionPrimitive = createSelectionEdgePrimitive({
      ring,
      heights,
      featureId: id,
      color: selectionColor,
      getWallHeight,
      widthPixels: selectionLineWidth,
    });

    if (selectionPrimitive) {
      scene.primitives.add(selectionPrimitive);
    }
  };

  const removeSelectionEdge = () => {
    if (!selectionPrimitive || !scene) return;
    scene.primitives.remove(selectionPrimitive);
    selectionPrimitive = null;
  };

  const cancelPendingAnimation = () => {
    if (cancelAnimation) {
      cancelAnimation();
      cancelAnimation = null;
    }
  };

  const animateWallOpacity = (targetOpacity: number) => {
    if (!wallPrimitives || !requestRender) return;

    cancelPendingAnimation();

    const segments = wallPrimitives.segments;
    const startOpacity = readGeometryInstanceOpacity(segments);

    if (startOpacity === null) {
      // Primitives not ready, retry on next frame
      let frameId = 0;
      let cancelled = false;

      const retry = () => {
        if (cancelled || _isDestroyed) return;
        const opacity = readGeometryInstanceOpacity(segments);
        if (opacity === null) {
          frameId = requestAnimationFrame(retry);
          return;
        }
        animateWallOpacity(targetOpacity);
      };

      frameId = requestAnimationFrame(retry);
      cancelAnimation = () => {
        cancelled = true;
        cancelAnimationFrame(frameId);
      };
      return;
    }

    cancelAnimation = animateOpacity(startOpacity, targetOpacity, {
      durationMs: animationDurationMs,
      easing: animationEasing,
      onUpdate: (value) => {
        applyGeometryInstanceOpacity(segments, value);
        requestRender?.();
      },
    });
  };

  const updateSelectionVisuals = () => {
    if (!_isAttached || !scene) return;

    // Animate wall opacity
    const targetOpacity = _selected ? selectedOpacity : defaultOpacity;
    animateWallOpacity(targetOpacity);

    // Toggle selection edge
    if (_selected) {
      addSelectionEdge();
    } else {
      removeSelectionEdge();
    }

    requestRender?.();
  };

  // Public API
  const visualizer: ExtrudedWallVisualizer = {
    get id() {
      return id;
    },

    get selected() {
      return _selected;
    },

    set selected(value: boolean) {
      if (_selected === value) return;
      _selected = value;
      updateSelectionVisuals();
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
      if (!ring || ring.length < 2) {
        throw new Error("Invalid polygon ring");
      }

      scene = sceneRef;
      requestRender = requestRenderFn;

      // Sample elevations if providers available
      await sampleElevations();

      if (_isDestroyed) return;

      // Create wall primitives
      createWalls();

      // Add selection edge if currently selected
      if (_selected) {
        addSelectionEdge();
      }

      _isAttached = true;
      _isReady = true;
      requestRender?.();
    },

    detach: () => {
      if (!_isAttached || !scene) return;

      cancelPendingAnimation();

      if (wallPrimitives) {
        scene.primitives.remove(wallPrimitives.collection);
        wallPrimitives = null;
      }

      if (selectionPrimitive) {
        scene.primitives.remove(selectionPrimitive);
        selectionPrimitive = null;
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
      heights = null;
      coordinatesWithHeight = null;
    },

    getBoundingSphere: () => {
      if (!coordinatesWithHeight || coordinatesWithHeight.length === 0) {
        return null;
      }
      return getBoundingSphereFromCoordinates(coordinatesWithHeight);
    },

    getCoordinatesWithHeight: () => coordinatesWithHeight,

    getWallSegments: () => wallPrimitives?.segments ?? [],

    isPicked: (pickedId: unknown) => {
      if (!pickedId || typeof pickedId !== "object") return false;
      const picked = pickedId as { featureId?: string };
      return picked.featureId === id;
    },
  };

  return visualizer;
};
