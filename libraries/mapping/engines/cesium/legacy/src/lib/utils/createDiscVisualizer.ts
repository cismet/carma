import {
  Cartesian3,
  Cartesian4,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  Matrix4,
  SceneTransforms,
  GeometryInstance,
  PerInstanceColorAppearance,
  Primitive,
  defined,
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
  unitCircleSegments?: number;
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

const DEFAULT_UNIT_CIRCLE_SEGMENTS = 24;
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
const MIN_PROJECTED_PIXEL_PER_WORLD = 1e-6;
const PROJECTION_SCALE_SAMPLE_COUNT = 16;
const ORIGIN_UPDATE_THRESHOLD_METERS = 1e-4;
const UP_VECTOR_DOT_CHANGE_THRESHOLD = 1e-5;
const DISC_VISUALIZER_ID_KEY = "__carmaDiscVisualizerId";

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

const createUnitDiscPositions = (segmentCount: number): Cartesian3[] => {
  const segments = Math.max(8, segmentCount);
  const positions: Cartesian3[] = [];

  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    positions.push(new Cartesian3(Math.cos(angle), Math.sin(angle), 0));
  }

  return positions;
};

const getDiscModelMatrix = (
  origin: Cartesian3,
  upVector: Cartesian3,
  radius: number
): Matrix4 => {
  const safeRadius = Math.max(radius, MIN_RADIUS);
  const up = Cartesian3.normalize(upVector, new Cartesian3());
  const { xAxis, yAxis } = createPlaneBasis(up);

  const matrix = Matrix4.clone(Matrix4.IDENTITY, new Matrix4());
  Matrix4.setColumn(
    matrix,
    0,
    new Cartesian4(
      xAxis.x * safeRadius,
      xAxis.y * safeRadius,
      xAxis.z * safeRadius,
      0
    ),
    matrix
  );
  Matrix4.setColumn(
    matrix,
    1,
    new Cartesian4(
      yAxis.x * safeRadius,
      yAxis.y * safeRadius,
      yAxis.z * safeRadius,
      0
    ),
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

const removeStaleDiscPrimitivesById = (scene: Scene, visualizerId: string) => {
  if (!isValidScene(scene)) return;
  const primitives = scene.primitives;
  for (let i = primitives.length - 1; i >= 0; i -= 1) {
    const primitive = primitives.get(i) as
      | (Primitive & {
          [DISC_VISUALIZER_ID_KEY]?: string;
        })
      | null;
    if (!primitive) continue;
    if (primitive[DISC_VISUALIZER_ID_KEY] !== visualizerId) continue;
    try {
      primitives.remove(primitive);
    } catch {
      // Ignore teardown races while aggressively deduplicating leaked primitives.
    }
  }
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
    unitCircleSegments = DEFAULT_UNIT_CIRCLE_SEGMENTS,
  } = options;

  let _origin = initialOrigin;
  let _upVector = Cartesian3.normalize(initialUpVector, new Cartesian3());
  let _radius = Math.max(initialRadius, MIN_RADIUS);
  let _screenPixelRadius = initialScreenPixelRadius;
  let _isAttached = false;
  let _isDestroyed = false;
  let _isVisible = true;
  let _lastRenderedOrigin = Cartesian3.clone(_origin);
  let _lastRenderedUpVector = Cartesian3.clone(_upVector);
  let _lastConfiguredRadius = _radius;

  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let fillPrimitive: Primitive | null = null;
  let removePostRenderListener: (() => void) | null = null;
  let _lastRenderedRadius = _radius;
  let _lastCameraDistance = Number.NaN;
  let _lastCameraFovRad = Number.NaN;
  let _lastRenderableRadius = _radius;

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

    const center = SceneTransforms.worldToWindowCoordinates(scene, _origin);
    if (defined(center)) {
      const { xAxis, yAxis } = createPlaneBasis(_upVector);
      let pixelsPerWorldMax = 0;

      for (let i = 0; i < PROJECTION_SCALE_SAMPLE_COUNT; i += 1) {
        const t = (i / PROJECTION_SCALE_SAMPLE_COUNT) * Math.PI * 2;
        const sampleDirection = Cartesian3.add(
          Cartesian3.multiplyByScalar(xAxis, Math.cos(t), new Cartesian3()),
          Cartesian3.multiplyByScalar(yAxis, Math.sin(t), new Cartesian3()),
          new Cartesian3()
        );
        const sampleWorld = Cartesian3.add(
          _origin,
          sampleDirection,
          new Cartesian3()
        );
        const sampleCanvas = SceneTransforms.worldToWindowCoordinates(
          scene,
          sampleWorld
        );
        if (!defined(sampleCanvas)) continue;

        const dx = sampleCanvas.x - center.x;
        const dy = sampleCanvas.y - center.y;
        const d = Math.hypot(dx, dy);
        if (Number.isFinite(d) && d > pixelsPerWorldMax) {
          pixelsPerWorldMax = d;
        }
      }

      if (pixelsPerWorldMax > MIN_PROJECTED_PIXEL_PER_WORLD) {
        const targetPixels = Math.max(
          _screenPixelRadius,
          MIN_SCREEN_PIXEL_RADIUS
        );
        return Math.max(targetPixels / pixelsPerWorldMax, MIN_RADIUS);
      }
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
    removeStaleDiscPrimitivesById(scene, id);
    const effectiveRadius = getResponsiveRadius();
    _lastRenderableRadius = effectiveRadius;

    const fillPositions = createUnitDiscPositions(unitCircleSegments);

    const fillGeometry = CoplanarPolygonGeometry.fromPositions({
      positions: fillPositions,
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
      // The move-gizmo disc is interacted with through the SVG overlay, not Cesium scene picking.
      // Disabling primitive picking also saves pick ID memory.
      allowPicking: false,
      asynchronous: false,
      releaseGeometryInstances: false,
      show: _isVisible,
      modelMatrix: getDiscModelMatrix(_origin, _upVector, effectiveRadius),
    });
    (fillPrimitive as Primitive & { [DISC_VISUALIZER_ID_KEY]?: string })[
      DISC_VISUALIZER_ID_KEY
    ] = id;
    scene.primitives.add(fillPrimitive);
    _lastRenderedRadius = effectiveRadius;
    _lastCameraDistance = getCameraDistance();
    _lastCameraFovRad = getCameraFovRad();
    _lastRenderedOrigin = Cartesian3.clone(_origin);
    _lastRenderedUpVector = Cartesian3.clone(_upVector);
    _lastConfiguredRadius = _radius;
    requestRender?.();
  };

  const updatePrimitiveTransform = (effectiveRadius: number) => {
    if (!fillPrimitive) return;
    fillPrimitive.modelMatrix = getDiscModelMatrix(
      _origin,
      _upVector,
      effectiveRadius
    );
    _lastRenderableRadius = effectiveRadius;
    _lastRenderedRadius = effectiveRadius;
    _lastRenderedOrigin = Cartesian3.clone(_origin);
    _lastRenderedUpVector = Cartesian3.clone(_upVector);
    _lastConfiguredRadius = _radius;
    requestRender?.();
  };

  const updateVisibility = () => {
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

      const nextRadius = getResponsiveRadius();
      const radiusChanged =
        Math.abs(nextRadius - _lastRenderableRadius) >
        Math.max(
          RADIUS_UPDATE_ABSOLUTE_THRESHOLD,
          _lastRenderableRadius * RADIUS_UPDATE_RELATIVE_THRESHOLD
        );

      if (!radiusChanged) return;
      updatePrimitiveTransform(nextRadius);
    });
  };

  const hasMeaningfulDiscChange = (
    nextOrigin: Cartesian3,
    nextUpVector: Cartesian3,
    nextRadius: number
  ): boolean => {
    const originDelta = Cartesian3.distance(nextOrigin, _lastRenderedOrigin);
    if (originDelta > ORIGIN_UPDATE_THRESHOLD_METERS) return true;

    const upDot = Math.abs(Cartesian3.dot(nextUpVector, _lastRenderedUpVector));
    if (1 - upDot > UP_VECTOR_DOT_CHANGE_THRESHOLD) return true;

    const radiusDelta = Math.abs(nextRadius - _lastConfiguredRadius);
    if (
      radiusDelta >
      Math.max(
        RADIUS_UPDATE_ABSOLUTE_THRESHOLD,
        _lastConfiguredRadius * RADIUS_UPDATE_RELATIVE_THRESHOLD
      )
    ) {
      return true;
    }

    return false;
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

      const normalizedUp = Cartesian3.normalize(upVector, new Cartesian3());
      const nextRadius =
        radius !== undefined ? Math.max(radius, MIN_RADIUS) : _radius;
      const hasChanged = hasMeaningfulDiscChange(
        origin,
        normalizedUp,
        nextRadius
      );

      _origin = origin;
      _upVector = normalizedUp;
      if (radius !== undefined) {
        _radius = nextRadius;
      }
      if (
        _screenPixelRadius !== undefined &&
        !Number.isFinite(_screenPixelRadius)
      ) {
        _screenPixelRadius = undefined;
      }

      if (_isAttached && hasChanged) {
        if (!fillPrimitive) {
          createPrimitives();
        } else {
          updatePrimitiveTransform(getResponsiveRadius());
        }
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
