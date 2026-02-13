import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Material,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolylineCollection,
  Primitive,
  isValidScene,
  type Scene,
} from "@carma/cesium";

export type DiscVisualizerOptions = {
  origin: Cartesian3;
  upVector: Cartesian3;
  radius: number;
  /**
   * If set, disc radius is computed in meters from this screen-space target radius (in px),
   * based on current camera distance and FOV.
   */
  screenPixelRadius?: number;
  color?: Color;
  width?: number;
  segmentCount?: number;
};

export type DiscVisualizer = {
  readonly id: string;
  readonly isAttached: boolean;
  readonly isVisible: boolean;
  readonly origin: Cartesian3;
  readonly radius: number;

  attach: (scene: Scene, requestRender: () => void) => void;
  detach: () => void;
  destroy: () => void;

  update: (origin: Cartesian3, upVector: Cartesian3, radius?: number) => void;
  show: () => void;
  hide: () => void;
};

const DEFAULT_WIDTH = 1;
const DEFAULT_SEGMENT_COUNT = 48;
const DEFAULT_COLOR = Color.WHITE.withAlpha(0.65);
const MIN_RADIUS = 0.1;
const MIN_SCREEN_PIXEL_RADIUS = 1;
const MIN_CAMERA_DISTANCE = 1;
const MIN_CANVAS_HEIGHT = 1;
const RADIUS_UPDATE_RELATIVE_THRESHOLD = 0.02;
const RADIUS_UPDATE_ABSOLUTE_THRESHOLD = 0.01;
const DISTANCE_UPDATE_RELATIVE_THRESHOLD = 0.01;
const DISTANCE_UPDATE_ABSOLUTE_THRESHOLD = 0.1;
const FOV_UPDATE_THRESHOLD_RAD = 1e-4;

const createPlaneBasis = (upVector: Cartesian3) => {
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
  return { xAxis, yAxis };
};

const createDiscPositions = (
  origin: Cartesian3,
  upVector: Cartesian3,
  radius: number,
  segmentCount: number,
  closeLoop: boolean
): Cartesian3[] => {
  const safeRadius = Math.max(radius, MIN_RADIUS);
  const segments = Math.max(8, segmentCount);
  const iterations = closeLoop ? segments + 1 : segments;
  const { xAxis, yAxis } = createPlaneBasis(upVector);
  const positions: Cartesian3[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const xComponent = Cartesian3.multiplyByScalar(
      xAxis,
      Math.cos(angle) * safeRadius,
      new Cartesian3()
    );
    const yComponent = Cartesian3.multiplyByScalar(
      yAxis,
      Math.sin(angle) * safeRadius,
      new Cartesian3()
    );
    const offset = Cartesian3.add(xComponent, yComponent, new Cartesian3());
    positions.push(Cartesian3.add(origin, offset, new Cartesian3()));
  }

  return positions;
};

export const createDiscVisualizer = (
  id: string,
  options: DiscVisualizerOptions
): DiscVisualizer => {
  const {
    origin: initialOrigin,
    upVector: initialUpVector,
    radius: initialRadius,
    screenPixelRadius: initialScreenPixelRadius,
    color = DEFAULT_COLOR,
    width = DEFAULT_WIDTH,
    segmentCount = DEFAULT_SEGMENT_COUNT,
  } = options;

  let _origin = initialOrigin;
  let _upVector = Cartesian3.normalize(initialUpVector, new Cartesian3());
  let _radius = Math.max(initialRadius, MIN_RADIUS);
  let _screenPixelRadius = initialScreenPixelRadius;
  let _isAttached = false;
  let _isDestroyed = false;
  let _isVisible = true;

  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let polylineCollection: PolylineCollection | null = null;
  let lineMaterial: Material | null = null;
  let fillPrimitive: Primitive | null = null;
  let removePostRenderListener: (() => void) | null = null;
  let _lastRenderedRadius = _radius;
  let _lastCameraDistance = Number.NaN;
  let _lastCameraFovRad = Number.NaN;

  const getCameraFovRad = (): number => {
    if (!scene) return 1;
    const frustum = scene.camera.frustum as { fov?: number; fovy?: number };
    const fov = frustum.fov ?? frustum.fovy ?? 1;
    return Number.isFinite(fov) && fov > 0 ? fov : 1;
  };

  const getCameraDistance = (): number => {
    if (!scene) return MIN_CAMERA_DISTANCE;
    return Math.max(
      Cartesian3.distance(scene.camera.position, _origin),
      MIN_CAMERA_DISTANCE
    );
  };

  const getResponsiveRadius = (): number => {
    if (_screenPixelRadius === undefined || !scene) {
      return Math.max(_radius, MIN_RADIUS);
    }

    const distance = getCameraDistance();
    const fov = getCameraFovRad();
    const canvasHeight = Math.max(scene.canvas.clientHeight, MIN_CANVAS_HEIGHT);
    const metersPerPixel = (distance * Math.tan(fov / 2) * 2) / canvasHeight;
    const targetPixels = Math.max(_screenPixelRadius, MIN_SCREEN_PIXEL_RADIUS);
    return Math.max(targetPixels * metersPerPixel, MIN_RADIUS);
  };

  const removePrimitives = () => {
    if (!scene) return;

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

    if (fillPrimitive) {
      try {
        if (isValidScene(scene)) {
          scene.primitives.remove(fillPrimitive);
        }
      } catch {
        // Scene/primitive may already be torn down during rapid lifecycle changes.
      }
      fillPrimitive = null;
    }
  };

  const removeCameraSyncListener = () => {
    if (!removePostRenderListener) return;
    removePostRenderListener();
    removePostRenderListener = null;
  };

  const createPrimitives = () => {
    if (!scene) return;
    removePrimitives();
    const effectiveRadius = getResponsiveRadius();

    const outlinePositions = createDiscPositions(
      _origin,
      _upVector,
      effectiveRadius,
      segmentCount,
      true
    );
    const fillPositions = createDiscPositions(
      _origin,
      _upVector,
      effectiveRadius,
      segmentCount,
      false
    );

    polylineCollection = new PolylineCollection();
    lineMaterial = Material.fromType("Color", { color });
    polylineCollection.add({
      positions: outlinePositions,
      width,
      material: lineMaterial,
      show: _isVisible,
      id: `${id}-outline`,
    });
    scene.primitives.add(polylineCollection);

    const fillGeometry = PolygonGeometry.fromPositions({
      positions: fillPositions,
      perPositionHeight: true,
      vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
    });
    fillPrimitive = new Primitive({
      geometryInstances: new GeometryInstance({
        id: `${id}-fill`,
        geometry: fillGeometry,
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(color),
        },
      }),
      appearance: new PerInstanceColorAppearance({
        translucent: color.alpha < 1,
        closed: false,
      }),
      asynchronous: false,
      releaseGeometryInstances: false,
      show: _isVisible,
    });
    scene.primitives.add(fillPrimitive);
    _lastRenderedRadius = effectiveRadius;
    _lastCameraDistance = getCameraDistance();
    _lastCameraFovRad = getCameraFovRad();
    requestRender?.();
  };

  const updateVisibility = () => {
    if (polylineCollection) {
      polylineCollection.show = _isVisible;
    }
    if (fillPrimitive) {
      fillPrimitive.show = _isVisible;
    }
    requestRender?.();
  };

  const setupResponsiveCameraSync = () => {
    removeCameraSyncListener();

    if (!scene || _screenPixelRadius === undefined) return;

    removePostRenderListener = scene.postRender.addEventListener(() => {
      if (!scene || scene.isDestroyed() || !_isAttached) return;

      const nextDistance = getCameraDistance();
      const nextFovRad = getCameraFovRad();
      const distanceChanged =
        !Number.isFinite(_lastCameraDistance) ||
        Math.abs(nextDistance - _lastCameraDistance) >
          Math.max(
            DISTANCE_UPDATE_ABSOLUTE_THRESHOLD,
            _lastCameraDistance * DISTANCE_UPDATE_RELATIVE_THRESHOLD
          );
      const fovChanged =
        !Number.isFinite(_lastCameraFovRad) ||
        Math.abs(nextFovRad - _lastCameraFovRad) > FOV_UPDATE_THRESHOLD_RAD;

      if (!distanceChanged && !fovChanged) {
        return;
      }

      const nextRadius = getResponsiveRadius();
      const radiusChanged =
        Math.abs(nextRadius - _lastRenderedRadius) >
        Math.max(
          RADIUS_UPDATE_ABSOLUTE_THRESHOLD,
          _lastRenderedRadius * RADIUS_UPDATE_RELATIVE_THRESHOLD
        );

      _lastCameraDistance = nextDistance;
      _lastCameraFovRad = nextFovRad;

      if (!radiusChanged) return;

      createPrimitives();
    });
  };

  const visualizer: DiscVisualizer = {
    get id() {
      return id;
    },

    get isAttached() {
      return _isAttached;
    },

    get isVisible() {
      return _isVisible;
    },

    get origin() {
      return _origin;
    },

    get radius() {
      return _radius;
    },

    attach: (sceneRef, requestRenderFn) => {
      if (_isDestroyed) {
        throw new Error("Cannot attach destroyed disc visualizer");
      }
      if (_isAttached) {
        visualizer.detach();
      }

      scene = sceneRef;
      requestRender = requestRenderFn;
      _isAttached = true;
      createPrimitives();
      setupResponsiveCameraSync();
      requestRender?.();
    },

    detach: () => {
      if (!_isAttached || !scene) return;
      removeCameraSyncListener();
      removePrimitives();
      _isAttached = false;
      requestRender?.();
    },

    destroy: () => {
      if (_isDestroyed) return;
      visualizer.detach();
      _isDestroyed = true;
      removeCameraSyncListener();
      scene = null;
      requestRender = null;
    },

    update: (origin, upVector, radius) => {
      if (_isDestroyed) return;

      _origin = origin;
      _upVector = Cartesian3.normalize(upVector, new Cartesian3());
      if (radius !== undefined) {
        _radius = Math.max(radius, MIN_RADIUS);
      }
      if (
        _screenPixelRadius !== undefined &&
        !Number.isFinite(_screenPixelRadius)
      ) {
        _screenPixelRadius = undefined;
      }

      if (_isAttached) {
        createPrimitives();
      }
    },

    show: () => {
      if (_isDestroyed) return;
      _isVisible = true;
      if (_isAttached) {
        updateVisibility();
      }
    },

    hide: () => {
      if (_isDestroyed) return;
      _isVisible = false;
      if (_isAttached) {
        updateVisibility();
      }
    },
  };

  return visualizer;
};

export default createDiscVisualizer;
