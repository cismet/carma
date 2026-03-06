import {
  Cartesian3,
  Cartesian4,
  Color,
  Matrix4,
  Material,
  PolylineCollection,
  isValidScene,
  type Scene,
} from "@carma/cesium";
import { animateOpacity } from "./animateOpacity";

export type RotationAxisVisualizerOptions = {
  /** Origin point in ECEF (Earth-Centered Earth-Fixed) coordinates */
  origin: Cartesian3;
  /** Up direction vector (typically surface normal), will be normalized */
  upVector: Cartesian3;
  /** Camera position for dynamic line length calculation */
  cameraPosition?: Cartesian3;
  /** Line length multiplier relative to camera distance (default: 2) */
  lengthMultiplier?: number;
  /** Dash length in screen pixels (default: 5) */
  dashPixelLength?: number;
  /** Gap length in screen pixels (default: 3) */
  gapPixelLength?: number;
  /** Line color (default: white) */
  color?: Color;
  /** Line width in pixels (default: 1) */
  width?: number;
};

export type RotationAxisVisualizer = {
  readonly id: string;
  readonly isAttached: boolean;
  readonly origin: Cartesian3;
  readonly isVisible: boolean;

  /** Attach to scene - adds primitives to scene */
  attach: (scene: Scene, requestRender: () => void) => void;
  /** Detach from scene - removes primitives */
  detach: () => void;
  /** Destroy and cleanup */
  destroy: () => void;

  /** Update origin position, up vector, and optionally camera position (all in ECEF) */
  update: (
    origin: Cartesian3,
    upVector: Cartesian3,
    cameraPosition?: Cartesian3
  ) => void;
  /** Show the visualizer immediately */
  show: () => void;
  /** Hide the visualizer immediately */
  hide: () => void;
  /** Fade in over duration in ms */
  fadeIn: (durationMs: number) => void;
  /** Fade out over duration in ms, with optional callback when complete */
  fadeOut: (durationMs: number, onComplete?: () => void) => void;
};

const DEFAULT_LENGTH_MULTIPLIER = 2;
const DEFAULT_DASH_PIXEL_LENGTH = 5;
const DEFAULT_GAP_PIXEL_LENGTH = 3;
const DEFAULT_WIDTH = 1;
const DEFAULT_COLOR = Color.WHITE;
const AXIS_VISUALIZER_ID_KEY = "__carmaAxisVisualizerId";

const createAxisModelMatrix = (
  origin: Cartesian3,
  upVector: Cartesian3
): Matrix4 => {
  const up = Cartesian3.normalize(upVector, new Cartesian3());
  const reference =
    Math.abs(Cartesian3.dot(up, Cartesian3.UNIT_Z)) > 0.9
      ? Cartesian3.UNIT_X
      : Cartesian3.UNIT_Z;
  const xAxis = Cartesian3.normalize(
    Cartesian3.cross(up, reference, new Cartesian3()),
    new Cartesian3()
  );
  const yAxis = Cartesian3.normalize(
    Cartesian3.cross(xAxis, up, new Cartesian3()),
    new Cartesian3()
  );

  const matrix = Matrix4.clone(Matrix4.IDENTITY, new Matrix4());
  Matrix4.setColumn(
    matrix,
    0,
    new Cartesian4(xAxis.x, xAxis.y, xAxis.z, 0),
    matrix
  );
  Matrix4.setColumn(
    matrix,
    1,
    new Cartesian4(yAxis.x, yAxis.y, yAxis.z, 0),
    matrix
  );
  Matrix4.setColumn(matrix, 2, new Cartesian4(up.x, up.y, up.z, 0), matrix);
  Matrix4.setColumn(
    matrix,
    3,
    new Cartesian4(origin.x, origin.y, origin.z, 1),
    matrix
  );
  return matrix;
};

const removeStaleAxisPrimitivesById = (scene: Scene, visualizerId: string) => {
  if (!isValidScene(scene)) return;
  const primitives = scene.primitives;
  for (let i = primitives.length - 1; i >= 0; i -= 1) {
    const primitive = primitives.get(i) as
      | (PolylineCollection & {
          [AXIS_VISUALIZER_ID_KEY]?: string;
        })
      | null;
    if (!primitive) continue;
    if (primitive[AXIS_VISUALIZER_ID_KEY] !== visualizerId) continue;
    try {
      primitives.remove(primitive);
    } catch {
      // Ignore teardown races while aggressively deduplicating leaked primitives.
    }
  }
};

export const createRotationAxisVisualizer = (
  id: string,
  options: RotationAxisVisualizerOptions
): RotationAxisVisualizer => {
  // Destructure options with defaults
  const {
    origin: initialOrigin,
    upVector: initialUpVector,
    cameraPosition: initialCameraPosition,
    lengthMultiplier = DEFAULT_LENGTH_MULTIPLIER,
    dashPixelLength = DEFAULT_DASH_PIXEL_LENGTH,
    gapPixelLength = DEFAULT_GAP_PIXEL_LENGTH,
    color = DEFAULT_COLOR,
    width = DEFAULT_WIDTH,
  } = options;

  // Internal state
  let _origin = initialOrigin;
  let _upVector = Cartesian3.normalize(initialUpVector, new Cartesian3());
  let _cameraPosition = initialCameraPosition;
  let _isAttached = false;
  let _isDestroyed = false;
  let _isVisible = true;
  let _opacity = 1.0;
  const baseColor = color;

  // Cesium references
  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let polylineCollection: PolylineCollection | null = null;
  let lineMaterial: Material | null = null;

  // Animation cancel function
  let cancelAnimation: (() => void) | null = null;

  /** Calculate meters per pixel at given distance from camera */
  const getMetersPerPixel = (distance: number): number => {
    if (!scene) return 1;
    const canvas = scene.canvas;
    const camera = scene.camera;
    // metersPerPixel = distance * tan(fov/2) / (height/2)
    const fov = (camera.frustum as { fov?: number }).fov || 1;
    return (distance * Math.tan(fov / 2) * 2) / canvas.clientHeight;
  };

  /** Get dynamic line length based on camera distance */
  const getLineLength = (): number => {
    if (!_cameraPosition) return 100000;
    const distance = Cartesian3.distance(_cameraPosition, _origin);
    return distance * lengthMultiplier;
  };

  /** Get dash parameters in meters based on screen pixels */
  const getDashParams = (): { dashMeters: number; gapMeters: number } => {
    if (!_cameraPosition || !scene) {
      return { dashMeters: 1000, gapMeters: 500 };
    }
    const distance = Cartesian3.distance(_cameraPosition, _origin);
    const metersPerPixel = getMetersPerPixel(distance);
    return {
      dashMeters: dashPixelLength * metersPerPixel,
      gapMeters: gapPixelLength * metersPerPixel,
    };
  };

  const applyOpacity = (value: number) => {
    if (!polylineCollection || !lineMaterial) return;
    const colorUniform = lineMaterial.uniforms.color as Color | undefined;
    if (colorUniform) {
      colorUniform.red = baseColor.red;
      colorUniform.green = baseColor.green;
      colorUniform.blue = baseColor.blue;
      colorUniform.alpha = value;
    } else {
      lineMaterial.uniforms.color = baseColor.withAlpha(value);
    }
    requestRender?.();
  };

  const createPolyline = () => {
    if (!scene) return;

    // Remove existing if any
    if (polylineCollection) {
      scene.primitives.remove(polylineCollection);
    }
    removeStaleAxisPrimitivesById(scene, id);

    const lineLength = getLineLength();
    const { dashMeters, gapMeters } = getDashParams();
    const totalLength = lineLength * 2;
    const segmentLength = dashMeters + gapMeters;
    const numSegments = Math.floor(totalLength / segmentLength);

    polylineCollection = new PolylineCollection();
    polylineCollection.modelMatrix = createAxisModelMatrix(_origin, _upVector);
    lineMaterial = Material.fromType("Color", {
      color: baseColor.withAlpha(_opacity),
    });

    for (let i = 0; i < numSegments; i++) {
      const segmentStart = -lineLength + i * segmentLength;
      const segmentEnd = segmentStart + dashMeters;

      const startPoint = new Cartesian3(0, 0, segmentStart);
      const endPoint = new Cartesian3(0, 0, segmentEnd);

      polylineCollection.add({
        positions: [startPoint, endPoint],
        width,
        material: lineMaterial,
        show: _isVisible,
      });
    }

    (
      polylineCollection as PolylineCollection & {
        [AXIS_VISUALIZER_ID_KEY]?: string;
      }
    )[AXIS_VISUALIZER_ID_KEY] = id;
    scene.primitives.add(polylineCollection);
  };

  const updatePolyline = () => {
    if (!polylineCollection || !scene) return;

    polylineCollection.modelMatrix = createAxisModelMatrix(_origin, _upVector);

    const lineLength = getLineLength();
    const { dashMeters, gapMeters } = getDashParams();
    const totalLength = lineLength * 2;
    const segmentLength = dashMeters + gapMeters;
    const numSegments = Math.floor(totalLength / segmentLength);

    if (polylineCollection.length !== numSegments) {
      createPolyline();
      return;
    }

    for (let i = 0; i < numSegments; i++) {
      const polyline = polylineCollection.get(i);
      if (!polyline) continue;

      const segmentStart = -lineLength + i * segmentLength;
      const segmentEnd = segmentStart + dashMeters;

      const startPoint = new Cartesian3(0, 0, segmentStart);
      const endPoint = new Cartesian3(0, 0, segmentEnd);

      polyline.positions = [startPoint, endPoint];
      polyline.show = _isVisible;
    }

    requestRender?.();
  };

  const cancelPendingAnimation = () => {
    if (cancelAnimation) {
      cancelAnimation();
      cancelAnimation = null;
    }
  };

  // Public API
  const visualizer: RotationAxisVisualizer = {
    get id() {
      return id;
    },

    get isAttached() {
      return _isAttached;
    },

    get origin() {
      return _origin;
    },

    get isVisible() {
      return _isVisible;
    },

    attach: (sceneRef, requestRenderFn) => {
      if (_isDestroyed) {
        throw new Error("Cannot attach destroyed visualizer");
      }
      if (_isAttached) {
        visualizer.detach();
      }

      scene = sceneRef;
      requestRender = requestRenderFn;

      createPolyline();

      _isAttached = true;
      requestRender?.();
    },

    detach: () => {
      if (!_isAttached || !scene) return;

      cancelPendingAnimation();

      if (polylineCollection) {
        try {
          if (isValidScene(scene)) {
            scene.primitives.remove(polylineCollection);
          }
        } catch {
          // Scene/primitive may already be torn down during rapid lifecycle changes.
        }
        polylineCollection = null;
        lineMaterial = null;
      }

      _isAttached = false;
      requestRender?.();
    },

    destroy: () => {
      if (_isDestroyed) return;
      visualizer.detach();
      _isDestroyed = true;
      scene = null;
      requestRender = null;
    },

    update: (newOrigin, newUpVector, cameraPosition?) => {
      if (_isDestroyed) return;

      _origin = newOrigin;
      _upVector = Cartesian3.normalize(newUpVector, new Cartesian3());
      if (cameraPosition) {
        _cameraPosition = cameraPosition;
      }

      if (_isAttached) {
        updatePolyline();
      }
    },

    show: () => {
      if (_isDestroyed) return;
      cancelPendingAnimation();
      _isVisible = true;
      _opacity = 1.0;
      if (_isAttached && polylineCollection) {
        for (let i = 0; i < polylineCollection.length; i++) {
          const polyline = polylineCollection.get(i);
          if (polyline) {
            polyline.show = true;
          }
        }
        applyOpacity(_opacity);
      }
    },

    hide: () => {
      if (_isDestroyed) return;
      cancelPendingAnimation();
      _isVisible = false;
      _opacity = 0;
      if (_isAttached && polylineCollection) {
        for (let i = 0; i < polylineCollection.length; i++) {
          const polyline = polylineCollection.get(i);
          if (polyline) {
            polyline.show = false;
          }
        }
        applyOpacity(_opacity);
      }
    },

    fadeIn: (durationMs: number) => {
      if (_isDestroyed || !_isAttached) return;

      cancelPendingAnimation();
      _isVisible = true;

      // Ensure all polylines are visible
      if (polylineCollection) {
        for (let i = 0; i < polylineCollection.length; i++) {
          const polyline = polylineCollection.get(i);
          if (polyline) {
            polyline.show = true;
          }
        }
      }

      cancelAnimation = animateOpacity(_opacity, 1, {
        durationMs,
        onUpdate: (value) => {
          _opacity = value;
          applyOpacity(value);
        },
      });
    },

    fadeOut: (durationMs: number, onComplete?: () => void) => {
      if (_isDestroyed || !_isAttached) return;

      cancelPendingAnimation();

      cancelAnimation = animateOpacity(_opacity, 0, {
        durationMs,
        onUpdate: (value) => {
          _opacity = value;
          applyOpacity(value);
        },
        onComplete: () => {
          _isVisible = false;
          if (polylineCollection) {
            for (let i = 0; i < polylineCollection.length; i++) {
              const polyline = polylineCollection.get(i);
              if (polyline) {
                polyline.show = false;
              }
            }
          }
          requestRender?.();
          onComplete?.();
        },
      });
    },
  };

  return visualizer;
};

export default createRotationAxisVisualizer;
