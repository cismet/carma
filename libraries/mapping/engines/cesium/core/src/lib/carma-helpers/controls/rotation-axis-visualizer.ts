import {
  Easing,
  lerp,
  type Easing as EasingFunction,
} from "@carma-commons/math";

import {
  Cartesian3,
  Cartesian4,
  Color,
  Material,
  Matrix4,
  PolylineCollection,
  type Scene,
} from "@carma-cesium";
import {
  areCameraSnapshotsEqual,
  getCameraSnapshot,
  type CameraSnapshot,
} from "../camera";
export type RotationAxisVisualizerOptions = {
  origin: Cartesian3;
  upVector: Cartesian3;
  lengthMultiplier?: number;
  dashPixelLength?: number;
  gapPixelLength?: number;
  color?: Color;
  width?: number;
};

export type RotationAxisVisualizer = {
  readonly id: string;
  readonly isAttached: boolean;
  readonly origin: Cartesian3;
  readonly isVisible: boolean;
  getPickExclusions: () => readonly object[];
  attach: (scene: Scene, requestRender: () => void) => void;
  detach: () => void;
  destroy: () => void;
  update: (origin: Cartesian3, upVector: Cartesian3) => void;
  show: () => void;
  hide: () => void;
  fadeIn: (durationMs: number) => void;
  fadeOut: (durationMs: number, onComplete?: () => void) => void;
};

type AnimateOpacityOptions = {
  durationMs?: number;
  easing?: EasingFunction;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
  onCancel?: () => void;
};

const DEFAULT_LENGTH_MULTIPLIER = 2;
const DEFAULT_DASH_PIXEL_LENGTH = 5;
const DEFAULT_GAP_PIXEL_LENGTH = 3;
const DEFAULT_WIDTH = 1;
const DEFAULT_COLOR = Color.WHITE;
const DEFAULT_OPACITY_EASING = Easing.SINUSOIDAL_IN_OUT;
const AXIS_VISUALIZER_ID_KEY = "__carmaAxisVisualizerId";
const AXIS_VECTOR_RELATIVE_EPSILON = 0;
const AXIS_VECTOR_ABSOLUTE_EPSILON = 1e-7;

const animateOpacity = (
  startOpacity: number,
  targetOpacity: number,
  {
    durationMs = 200,
    easing = DEFAULT_OPACITY_EASING,
    onUpdate,
    onComplete,
    onCancel,
  }: AnimateOpacityOptions
): (() => void) => {
  if (durationMs <= 0) {
    onUpdate(targetOpacity);
    onComplete?.();
    return () => undefined;
  }

  let cancelled = false;
  const startTime = performance.now();
  let frameId = 0;

  const step = (timestamp: number) => {
    if (cancelled) {
      return;
    }

    const elapsedMs = timestamp - startTime;
    const progress = Math.min(elapsedMs / durationMs, 1);
    const easedProgress = easing(progress);
    const opacity = lerp(startOpacity, targetOpacity, easedProgress);

    onUpdate(opacity);

    if (progress >= 1) {
      onComplete?.();
      return;
    }

    frameId = window.requestAnimationFrame(step);
  };

  frameId = window.requestAnimationFrame(step);

  return () => {
    if (cancelled) {
      return;
    }
    cancelled = true;
    window.cancelAnimationFrame(frameId);
    onCancel?.();
  };
};

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

const isSceneAlive = (scene: Scene | null): scene is Scene => {
  if (!scene) {
    return false;
  }

  try {
    return !scene.isDestroyed();
  } catch {
    return false;
  }
};

const getSceneViewportHeightPx = (scene: Scene): number =>
  Math.max(1, scene.canvas.clientHeight);

const removeStaleAxisPrimitivesById = (scene: Scene, visualizerId: string) => {
  const primitives = scene.primitives;
  for (let index = primitives.length - 1; index >= 0; index -= 1) {
    const primitive = primitives.get(index) as
      | (PolylineCollection & {
          [AXIS_VISUALIZER_ID_KEY]?: string;
        })
      | null;

    if (!primitive) {
      continue;
    }

    if (primitive[AXIS_VISUALIZER_ID_KEY] !== visualizerId) {
      continue;
    }

    try {
      primitives.remove(primitive);
    } catch {
      // Ignore teardown races while aggressively deduplicating leaked primitives.
    }
  }
};

export const createRotationAxisVisualizer = (
  id: string,
  {
    origin: initialOrigin,
    upVector: initialUpVector,
    lengthMultiplier = DEFAULT_LENGTH_MULTIPLIER,
    dashPixelLength = DEFAULT_DASH_PIXEL_LENGTH,
    gapPixelLength = DEFAULT_GAP_PIXEL_LENGTH,
    color = DEFAULT_COLOR,
    width = DEFAULT_WIDTH,
  }: RotationAxisVisualizerOptions
): RotationAxisVisualizer => {
  let origin = Cartesian3.clone(initialOrigin);
  let upVector = Cartesian3.normalize(initialUpVector, new Cartesian3());
  let cameraSnapshot: CameraSnapshot | null = null;
  let viewportHeightPx: number | undefined;
  let isAttached = false;
  let isDestroyed = false;
  let isVisible = true;
  let opacity = 1;

  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let polylineCollection: PolylineCollection | null = null;
  let lineMaterial: Material | null = null;
  let cancelAnimation: (() => void) | null = null;

  const baseColor = color;

  const safeRequestRender = () => {
    try {
      requestRender?.();
    } catch {
      // Ignore transient requestRender races.
    }
  };

  const getMetersPerPixel = (distance: number): number => {
    const fov = cameraSnapshot?.frustumFovY || 1;
    return (distance * Math.tan(fov / 2) * 2) / (viewportHeightPx ?? 1);
  };

  const getLineLength = (): number => {
    if (!cameraSnapshot) {
      return 100000;
    }

    const distance = Cartesian3.distance(cameraSnapshot.position, origin);
    return distance * lengthMultiplier;
  };

  const getDashParams = () => {
    if (!cameraSnapshot) {
      return { dashMeters: 1000, gapMeters: 500 };
    }

    const distance = Cartesian3.distance(cameraSnapshot.position, origin);
    const metersPerPixel = getMetersPerPixel(distance);

    return {
      dashMeters: dashPixelLength * metersPerPixel,
      gapMeters: gapPixelLength * metersPerPixel,
    };
  };

  const applyOpacity = (value: number) => {
    if (!polylineCollection || !lineMaterial) {
      return;
    }

    const colorUniform = lineMaterial.uniforms.color as Color | undefined;
    if (colorUniform) {
      colorUniform.red = baseColor.red;
      colorUniform.green = baseColor.green;
      colorUniform.blue = baseColor.blue;
      colorUniform.alpha = value;
    } else {
      lineMaterial.uniforms.color = baseColor.withAlpha(value);
    }

    safeRequestRender();
  };

  const createPolyline = () => {
    if (!scene) {
      return;
    }

    if (polylineCollection) {
      try {
        scene.primitives.remove(polylineCollection);
      } catch {
        // Ignore transient primitive removal races.
      }
    }

    removeStaleAxisPrimitivesById(scene, id);

    const lineLength = getLineLength();
    const { dashMeters, gapMeters } = getDashParams();
    const totalLength = lineLength * 2;
    const segmentLength = dashMeters + gapMeters;
    const numSegments = Math.floor(totalLength / segmentLength);

    polylineCollection = new PolylineCollection();
    polylineCollection.modelMatrix = createAxisModelMatrix(origin, upVector);
    lineMaterial = Material.fromType("Color", {
      color: baseColor.withAlpha(opacity),
    });

    for (let index = 0; index < numSegments; index += 1) {
      const segmentStart = -lineLength + index * segmentLength;
      const segmentEnd = segmentStart + dashMeters;

      polylineCollection.add({
        positions: [
          new Cartesian3(0, 0, segmentStart),
          new Cartesian3(0, 0, segmentEnd),
        ],
        width,
        material: lineMaterial,
        show: isVisible,
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
    if (!polylineCollection || !scene) {
      return;
    }

    polylineCollection.modelMatrix = createAxisModelMatrix(origin, upVector);

    const lineLength = getLineLength();
    const { dashMeters, gapMeters } = getDashParams();
    const totalLength = lineLength * 2;
    const segmentLength = dashMeters + gapMeters;
    const numSegments = Math.floor(totalLength / segmentLength);

    if (polylineCollection.length !== numSegments) {
      createPolyline();
      return;
    }

    for (let index = 0; index < numSegments; index += 1) {
      const polyline = polylineCollection.get(index);
      if (!polyline) {
        continue;
      }

      const segmentStart = -lineLength + index * segmentLength;
      const segmentEnd = segmentStart + dashMeters;

      polyline.positions = [
        new Cartesian3(0, 0, segmentStart),
        new Cartesian3(0, 0, segmentEnd),
      ];
      polyline.show = isVisible;
    }

    safeRequestRender();
  };

  const cancelPendingAnimation = () => {
    cancelAnimation?.();
    cancelAnimation = null;
  };

  const visualizer: RotationAxisVisualizer = {
    get id() {
      return id;
    },

    get isAttached() {
      return isAttached;
    },

    get origin() {
      return origin;
    },

    get isVisible() {
      return isVisible;
    },

    getPickExclusions: () => (polylineCollection ? [polylineCollection] : []),

    attach: (sceneRef, requestRenderFn) => {
      if (isDestroyed) {
        throw new Error("Cannot attach destroyed visualizer");
      }

      if (isAttached) {
        visualizer.detach();
      }

      scene = sceneRef;
      requestRender = requestRenderFn;
      cameraSnapshot = getCameraSnapshot(scene);
      viewportHeightPx = getSceneViewportHeightPx(scene);
      createPolyline();
      isAttached = true;
      safeRequestRender();
    },

    detach: () => {
      if (!isAttached || !scene) {
        return;
      }

      cancelPendingAnimation();

      if (polylineCollection && isSceneAlive(scene)) {
        try {
          scene.primitives.remove(polylineCollection);
        } catch {
          // Ignore scene/primitive teardown races.
        }
      }

      polylineCollection = null;
      lineMaterial = null;
      isAttached = false;
      safeRequestRender();
    },

    destroy: () => {
      if (isDestroyed) {
        return;
      }

      visualizer.detach();
      isDestroyed = true;
      scene = null;
      requestRender = null;
    },

    update: (nextOrigin, nextUpVector) => {
      if (isDestroyed) {
        return;
      }

      const currentScene = isSceneAlive(scene) ? scene : null;
      const nextCameraSnapshot = currentScene
        ? getCameraSnapshot(currentScene)
        : null;
      const nextViewportHeightPx =
        currentScene !== null
          ? getSceneViewportHeightPx(currentScene)
          : undefined;
      const nextNormalizedUpVector = Cartesian3.normalize(
        nextUpVector,
        new Cartesian3()
      );
      const originChanged = !Cartesian3.equalsEpsilon(
        origin,
        nextOrigin,
        AXIS_VECTOR_RELATIVE_EPSILON,
        AXIS_VECTOR_ABSOLUTE_EPSILON
      );
      const upVectorChanged = !Cartesian3.equalsEpsilon(
        upVector,
        nextNormalizedUpVector,
        AXIS_VECTOR_RELATIVE_EPSILON,
        AXIS_VECTOR_ABSOLUTE_EPSILON
      );
      const cameraSnapshotChanged =
        nextCameraSnapshot !== null &&
        !areCameraSnapshotsEqual(cameraSnapshot, nextCameraSnapshot);
      const viewportHeightChanged =
        nextViewportHeightPx !== undefined &&
        viewportHeightPx !== nextViewportHeightPx;

      if (
        !originChanged &&
        !upVectorChanged &&
        !cameraSnapshotChanged &&
        !viewportHeightChanged
      ) {
        return;
      }

      Cartesian3.clone(nextOrigin, origin);
      Cartesian3.clone(nextNormalizedUpVector, upVector);
      if (nextCameraSnapshot) {
        cameraSnapshot = nextCameraSnapshot;
      }
      if (nextViewportHeightPx !== undefined) {
        viewportHeightPx = nextViewportHeightPx;
      }

      if (isAttached) {
        updatePolyline();
      }
    },

    show: () => {
      if (isDestroyed) {
        return;
      }

      cancelPendingAnimation();
      isVisible = true;
      opacity = 1;

      if (polylineCollection) {
        for (let index = 0; index < polylineCollection.length; index += 1) {
          const polyline = polylineCollection.get(index);
          if (polyline) {
            polyline.show = true;
          }
        }
      }

      applyOpacity(opacity);
    },

    hide: () => {
      if (isDestroyed) {
        return;
      }

      cancelPendingAnimation();
      isVisible = false;
      opacity = 0;

      if (polylineCollection) {
        for (let index = 0; index < polylineCollection.length; index += 1) {
          const polyline = polylineCollection.get(index);
          if (polyline) {
            polyline.show = false;
          }
        }
      }

      applyOpacity(opacity);
    },

    fadeIn: (durationMs: number) => {
      if (isDestroyed || !isAttached) {
        return;
      }

      cancelPendingAnimation();
      isVisible = true;

      if (polylineCollection) {
        for (let index = 0; index < polylineCollection.length; index += 1) {
          const polyline = polylineCollection.get(index);
          if (polyline) {
            polyline.show = true;
          }
        }
      }

      cancelAnimation = animateOpacity(opacity, 1, {
        durationMs,
        onUpdate: (value) => {
          opacity = value;
          applyOpacity(value);
        },
      });
    },

    fadeOut: (durationMs: number, onComplete?: () => void) => {
      if (isDestroyed || !isAttached) {
        return;
      }

      cancelPendingAnimation();

      cancelAnimation = animateOpacity(opacity, 0, {
        durationMs,
        onUpdate: (value) => {
          opacity = value;
          applyOpacity(value);
        },
        onComplete: () => {
          isVisible = false;
          if (polylineCollection) {
            for (let index = 0; index < polylineCollection.length; index += 1) {
              const polyline = polylineCollection.get(index);
              if (polyline) {
                polyline.show = false;
              }
            }
          }
          safeRequestRender();
          onComplete?.();
        },
      });
    },
  };

  return visualizer;
};

export default createRotationAxisVisualizer;
