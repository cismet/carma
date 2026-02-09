import {
  BoundingSphere,
  Color,
  Primitive,
  PrimitiveCollection,
  getBoundingSphereFromCoordinates,
  type Scene,
} from "@carma/cesium";
import type { Feature, FeatureCollection } from "geojson";
import { Easing, type Easing as EasingFunction } from "@carma-commons/math";

import { extractRingsFromGeoJson } from "@carma/geo/utils";

import {
  createWallPrimitives,
  type WallPrimitiveSegment,
} from "./adhoc-primitives/create-wall-primitives";
import { createSelectionEdgePrimitive } from "./adhoc-primitives/create-selection-edge-primitive";
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
const DEFAULT_SELECTION_COLOR = "#FFFF00";
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

const normalizeColor = (color: string | Color | undefined): Color => {
  if (!color) return Color.fromCssColorString(DEFAULT_WALL_COLOR);
  if (typeof color === "string") return Color.fromCssColorString(color);
  return color;
};

export const createExtrudedWallVisualizer = (
  id: string,
  geojson: Feature | FeatureCollection,
  options: ExtrudedWallVisualizerOptions = {}
): ExtrudedWallVisualizer => {
  // Normalize options with defaults
  const wallHeightConfig = options.wallHeight ?? DEFAULT_WALL_HEIGHT_METERS;
  const wallColor = normalizeColor(options.wallColor);
  const defaultOpacity = options.opacity ?? DEFAULT_OPACITY;
  const selectedOpacity = options.selectedOpacity ?? DEFAULT_SELECTED_OPACITY;
  const selectionLineWidth =
    options.selectionLineWidth ?? DEFAULT_SELECTION_LINE_WIDTH;
  const selectionColor =
    options.selectionColor ?? Color.fromCssColorString(DEFAULT_SELECTION_COLOR);
  const animationDurationMs =
    options.animationDurationMs ?? DEFAULT_ANIMATION_DURATION_MS;
  const animationEasing = options.animationEasing ?? Easing.SINUSOIDAL_IN_OUT;

  // Internal state
  let _selected = false;
  let _isAttached = false;
  let _isReady = false;
  let _isDestroyed = false;

  // Geometry data - extract all rings from the geojson
  const rings = extractRingsFromGeoJson(geojson);
  const hasExplicitHeights = rings.some((ring) =>
    ring.some((coord) => typeof coord[2] === "number")
  );

  // Initialize heights for each ring from coordinate Z values
  let heightsPerRing: number[][] = rings.map((ring) =>
    ring.map((coord) => (typeof coord[2] === "number" ? coord[2] : 0))
  );
  let coordinatesWithHeight: number[][] | null = null;

  // Cesium primitives
  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let wallPrimitivesCollections: PrimitiveCollection[] = [];
  let selectionPrimitives: Primitive[] = [];

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
    if (rings.length === 0 || heightsPerRing.length === 0) return;
    // Flatten all rings with their heights
    const allCoords: number[][] = [];
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const heights = heightsPerRing[i];
      if (!ring || !heights) continue;
      for (let j = 0; j < ring.length; j++) {
        const coord = ring[j];
        const height = heights[j] ?? 0;
        allCoords.push([coord[0], coord[1], height]);
      }
    }
    coordinatesWithHeight = allCoords;
  };

  const createWalls = () => {
    if (rings.length === 0 || !scene) return;

    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const heights = heightsPerRing[i];
      if (!ring || !heights || ring.length < 2) continue;

      const wallPrimitives = createWallPrimitives({
        ring,
        heights,
        featureId: id,
        isSelected: _selected,
        getWallColor,
        getWallHeight,
      });

      wallPrimitivesCollections.push(wallPrimitives.collection);
      scene.primitives.add(wallPrimitives.collection);
    }
  };

  const addSelectionEdge = () => {
    if (rings.length === 0 || !scene) return;

    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const heights = heightsPerRing[i];
      if (!ring || !heights || ring.length < 2) continue;

      const selectionPrimitive = createSelectionEdgePrimitive({
        ring,
        heights,
        featureId: id,
        color: selectionColor,
        getWallHeight,
        widthPixels: selectionLineWidth,
      });

      if (selectionPrimitive) {
        selectionPrimitives.push(selectionPrimitive);
        scene.primitives.add(selectionPrimitive);
      }
    }
  };

  const removeSelectionEdge = () => {
    if (selectionPrimitives.length === 0 || !scene) return;
    for (const primitive of selectionPrimitives) {
      scene.primitives.remove(primitive);
    }
    selectionPrimitives = [];
  };

  const cancelPendingAnimation = () => {
    if (cancelAnimation) {
      cancelAnimation();
      cancelAnimation = null;
    }
  };

  const animateWallOpacity = (targetOpacity: number) => {
    if (wallPrimitivesCollections.length === 0 || !requestRender) return;

    cancelPendingAnimation();

    // Collect all segments from all wall collections
    const allSegments: WallPrimitiveSegment[] = [];
    for (const collection of wallPrimitivesCollections) {
      for (let i = 0; i < collection.length; i++) {
        const primitive = collection.get(i) as Primitive | undefined;
        if (primitive && "geometryInstances" in primitive) {
          const geomPrimitive = primitive as unknown as {
            geometryInstances?: {
              id?: { featureId: string; segmentIndex: number };
            };
          };
          const instanceId = geomPrimitive.geometryInstances?.id;
          if (instanceId) {
            allSegments.push({ primitive, instanceId });
          }
        }
      }
    }

    if (allSegments.length === 0) return;

    const startOpacity = readGeometryInstanceOpacity(allSegments);

    if (startOpacity === null) {
      // Primitives not ready, retry on next frame
      let frameId = 0;
      let cancelled = false;

      const retry = () => {
        if (cancelled || _isDestroyed) return;
        const opacity = readGeometryInstanceOpacity(allSegments);
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
        applyGeometryInstanceOpacity(allSegments, value);
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
      if (rings.length === 0) {
        throw new Error("No valid polygon rings");
      }

      scene = sceneRef;
      requestRender = requestRenderFn;

      updateCoordinatesWithHeight();

      if (!hasExplicitHeights) {
        console.warn(
          "[CESIUM|WALL] No elevations present in geojson coordinates for wall visualizer:",
          id
        );
      }

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

      for (const collection of wallPrimitivesCollections) {
        scene.primitives.remove(collection);
      }
      wallPrimitivesCollections = [];

      for (const primitive of selectionPrimitives) {
        scene.primitives.remove(primitive);
      }
      selectionPrimitives = [];

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
      heightsPerRing = [];
      coordinatesWithHeight = null;
    },

    getBoundingSphere: () => {
      if (!coordinatesWithHeight || coordinatesWithHeight.length === 0) {
        return null;
      }
      return getBoundingSphereFromCoordinates(coordinatesWithHeight);
    },

    getCoordinatesWithHeight: () => coordinatesWithHeight,

    getWallSegments: () => {
      const allSegments: WallPrimitiveSegment[] = [];
      for (const collection of wallPrimitivesCollections) {
        for (let i = 0; i < collection.length; i++) {
          const primitive = collection.get(i);
          if (primitive && "geometryInstances" in primitive) {
            const instanceId = (
              primitive as unknown as { geometryInstances?: { id?: unknown } }
            ).geometryInstances?.id;
            if (instanceId) {
              allSegments.push({
                primitive: primitive as Primitive,
                instanceId: instanceId as {
                  featureId: string;
                  segmentIndex: number;
                },
              });
            }
          }
        }
      }
      return allSegments;
    },

    isPicked: (pickedId: unknown) => {
      if (!pickedId || typeof pickedId !== "object") return false;
      const picked = pickedId as { featureId?: string };
      return picked.featureId === id;
    },
  };

  return visualizer;
};
