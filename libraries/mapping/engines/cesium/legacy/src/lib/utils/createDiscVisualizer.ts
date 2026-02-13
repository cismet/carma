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
    color = DEFAULT_COLOR,
    width = DEFAULT_WIDTH,
    segmentCount = DEFAULT_SEGMENT_COUNT,
  } = options;

  let _origin = initialOrigin;
  let _upVector = Cartesian3.normalize(initialUpVector, new Cartesian3());
  let _radius = Math.max(initialRadius, MIN_RADIUS);
  let _isAttached = false;
  let _isDestroyed = false;
  let _isVisible = true;

  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let polylineCollection: PolylineCollection | null = null;
  let lineMaterial: Material | null = null;
  let fillPrimitive: Primitive | null = null;

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

  const createPrimitives = () => {
    if (!scene) return;
    removePrimitives();

    const outlinePositions = createDiscPositions(
      _origin,
      _upVector,
      _radius,
      segmentCount,
      true
    );
    const fillPositions = createDiscPositions(
      _origin,
      _upVector,
      _radius,
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
      createPrimitives();
      _isAttached = true;
      requestRender?.();
    },

    detach: () => {
      if (!_isAttached || !scene) return;
      removePrimitives();
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

    update: (origin, upVector, radius) => {
      if (_isDestroyed) return;

      _origin = origin;
      _upVector = Cartesian3.normalize(upVector, new Cartesian3());
      if (radius !== undefined) {
        _radius = Math.max(radius, MIN_RADIUS);
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
