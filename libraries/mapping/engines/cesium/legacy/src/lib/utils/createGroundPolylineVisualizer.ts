import {
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  PolylineColorAppearance,
  getBoundingSphereFromCoordinates,
  type Scene,
} from "@carma/cesium";
import type { Feature, FeatureCollection } from "geojson";

import { extractRingsFromGeoJson } from "@carma/geo/utils";

const DEFAULT_LINE_COLOR = "#3A7CEB";

const normalizeColor = (color: string | Color | undefined): Color => {
  if (!color) return Color.fromCssColorString(DEFAULT_LINE_COLOR);
  if (typeof color === "string") return Color.fromCssColorString(color);
  return color;
};

export type GroundPolylineVisualizerOptions = {
  /** Line color (CSS string or Cesium Color) - defaults to white */
  lineColor?: string | Color;
  /** Opacity (0-1) - defaults to 0.5 */
  opacity?: number;
  /** Line width in pixels - defaults to 5 */
  lineWidth?: number;
};

export type GroundPolylineVisualizer = {
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

export const createGroundPolylineVisualizer = (
  id: string,
  geojson: Feature | FeatureCollection,
  options: GroundPolylineVisualizerOptions = {}
): GroundPolylineVisualizer => {
  // Normalize options with defaults
  const lineColor = normalizeColor(options.lineColor);
  const opacity = options.opacity ?? 0.5;
  const lineWidth = options.lineWidth ?? 5;

  // Internal state
  let _selected = false;
  let _isAttached = false;
  let _isReady = false;
  let _isDestroyed = false;

  // Geometry data - extract all rings from the geojson
  const rings = extractRingsFromGeoJson(geojson);

  // Cesium primitives
  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let polylinePrimitive: GroundPolylinePrimitive | null = null;

  const createGroundPolylines = () => {
    if (rings.length === 0 || !scene) return;

    const geometryInstances = rings
      .filter((ring) => {
        // Need at least 3 unique points for a valid polygon ring
        if (ring.length < 3) return false;
        // Check first and last point - if identical, we'll handle it
        return true;
      })
      .map((ring) => {
        // Remove duplicate last point if same as first (Cesium will close the loop)
        let coords = ring;
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] === last[0] && first[1] === last[1] && ring.length > 3) {
          coords = ring.slice(0, -1);
        }

        // Create Cartesian3 positions for GroundPolylineGeometry
        const positions = coords.map((coord) =>
          Cartesian3.fromDegrees(coord[0], coord[1])
        );

        return new GeometryInstance({
          id: { featureId: id },
          geometry: new GroundPolylineGeometry({
            positions: positions,
            width: lineWidth,
            loop: true,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              lineColor.withAlpha(opacity)
            ),
          },
        });
      });

    if (geometryInstances.length === 0) return;

    polylinePrimitive = new GroundPolylinePrimitive({
      geometryInstances: geometryInstances,
      appearance: new PolylineColorAppearance({
        translucent: true,
        renderState: {
          depthTest: {
            enabled: false,
          },
        },
      }),
      asynchronous: false,
    });

    scene.groundPrimitives.add(polylinePrimitive);
  };

  // Public API
  const visualizer: GroundPolylineVisualizer = {
    get id() {
      return id;
    },

    get selected() {
      return _selected;
    },

    set selected(value: boolean) {
      if (_selected === value) return;
      _selected = value;
      // No visual change for selection - always same line
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
        throw new Error("No valid rings in geojson");
      }

      scene = sceneRef;
      requestRender = requestRenderFn;

      if (_isDestroyed) return;

      // Create ground polyline primitives
      createGroundPolylines();

      _isAttached = true;
      _isReady = true;
      requestRender?.();
    },

    detach: () => {
      if (!_isAttached || !scene) return;

      if (polylinePrimitive) {
        scene.groundPrimitives.remove(polylinePrimitive);
        polylinePrimitive = null;
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
      if (rings.length === 0) return null;

      // Flatten all ring coordinates for bounding sphere calculation
      const allCoords: number[][] = [];
      for (const ring of rings) {
        for (const coord of ring) {
          allCoords.push([coord[0], coord[1], coord[2] ?? 0]);
        }
      }

      return getBoundingSphereFromCoordinates(allCoords);
    },

    isPicked: (pickedId: unknown) => {
      if (!pickedId || typeof pickedId !== "object") return false;
      const picked = pickedId as { featureId?: string };
      return picked.featureId === id;
    },
  };

  return visualizer;
};
