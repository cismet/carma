import {
  Cartesian3,
  Color,
  Material,
  PolylineCollection,
  isValidScene,
  type Scene,
} from "@carma/cesium";

export type LineVisualizerOptions = {
  start: Cartesian3;
  end: Cartesian3;
  color?: Color;
  width?: number;
  dashed?: boolean;
  dashLength?: number;
  gapLength?: number;
};

export type LineVisualizer = {
  readonly id: string;
  readonly isAttached: boolean;
  readonly isVisible: boolean;
  readonly start: Cartesian3;
  readonly end: Cartesian3;

  attach: (scene: Scene, requestRender: () => void) => void;
  detach: () => void;
  destroy: () => void;

  update: (start: Cartesian3, end: Cartesian3) => void;
  show: () => void;
  hide: () => void;
};

const DEFAULT_COLOR = Color.WHITE.withAlpha(0.9);
const DEFAULT_WIDTH = 1.5;
const DEFAULT_DASHED = true;
const DEFAULT_DASH_LENGTH_METERS = 1.5;
const DEFAULT_GAP_LENGTH_METERS = 1.5;
const MIN_SEGMENT_LENGTH_METERS = 0.01;

const buildLineSegments = (
  start: Cartesian3,
  end: Cartesian3,
  dashed: boolean,
  dashLength: number,
  gapLength: number
): Array<[Cartesian3, Cartesian3]> => {
  const totalLength = Cartesian3.distance(start, end);
  if (totalLength <= MIN_SEGMENT_LENGTH_METERS) return [];

  if (!dashed) {
    return [[start, end]];
  }

  const safeDashLength = Math.max(dashLength, MIN_SEGMENT_LENGTH_METERS);
  const safeGapLength = Math.max(gapLength, 0);
  const step = safeDashLength + safeGapLength;
  const clampedStep = Math.max(step, MIN_SEGMENT_LENGTH_METERS);

  const segments: Array<[Cartesian3, Cartesian3]> = [];
  for (
    let segmentStartDistance = 0;
    segmentStartDistance < totalLength;
    segmentStartDistance += clampedStep
  ) {
    const segmentEndDistance = Math.min(
      segmentStartDistance + safeDashLength,
      totalLength
    );
    if (
      segmentEndDistance - segmentStartDistance <=
      MIN_SEGMENT_LENGTH_METERS * 0.5
    ) {
      continue;
    }

    const segmentStartT = segmentStartDistance / totalLength;
    const segmentEndT = segmentEndDistance / totalLength;

    const segmentStart = Cartesian3.lerp(
      start,
      end,
      segmentStartT,
      new Cartesian3()
    );
    const segmentEnd = Cartesian3.lerp(
      start,
      end,
      segmentEndT,
      new Cartesian3()
    );

    segments.push([segmentStart, segmentEnd]);
  }

  return segments;
};

export const createLineVisualizer = (
  id: string,
  options: LineVisualizerOptions
): LineVisualizer => {
  const {
    start: initialStart,
    end: initialEnd,
    color = DEFAULT_COLOR,
    width = DEFAULT_WIDTH,
    dashed = DEFAULT_DASHED,
    dashLength = DEFAULT_DASH_LENGTH_METERS,
    gapLength = DEFAULT_GAP_LENGTH_METERS,
  } = options;

  let _start = initialStart;
  let _end = initialEnd;
  let _isAttached = false;
  let _isDestroyed = false;
  let _isVisible = true;

  let scene: Scene | null = null;
  let requestRender: (() => void) | null = null;
  let polylineCollection: PolylineCollection | null = null;
  let lineMaterial: Material | null = null;

  const removePrimitive = () => {
    if (!scene || !polylineCollection) return;
    try {
      if (isValidScene(scene)) {
        scene.primitives.remove(polylineCollection);
      }
    } catch {
      // Scene/primitive may already be torn down during rapid lifecycle changes.
    }
    polylineCollection = null;
    lineMaterial = null;
  };

  const createPrimitive = () => {
    if (!scene) return;
    removePrimitive();

    const segments = buildLineSegments(
      _start,
      _end,
      dashed,
      dashLength,
      gapLength
    );
    if (segments.length === 0) return;

    polylineCollection = new PolylineCollection();
    lineMaterial = Material.fromType("Color", { color });

    segments.forEach(([segmentStart, segmentEnd], index) => {
      polylineCollection?.add({
        id: `${id}-${index}`,
        positions: [segmentStart, segmentEnd],
        width,
        material: lineMaterial,
        show: _isVisible,
      });
    });

    polylineCollection.show = _isVisible;
    scene.primitives.add(polylineCollection);
    requestRender?.();
  };

  const visualizer: LineVisualizer = {
    get id() {
      return id;
    },

    get isAttached() {
      return _isAttached;
    },

    get isVisible() {
      return _isVisible;
    },

    get start() {
      return _start;
    },

    get end() {
      return _end;
    },

    attach: (sceneRef, requestRenderFn) => {
      if (_isDestroyed) {
        throw new Error("Cannot attach destroyed line visualizer");
      }
      if (_isAttached) {
        visualizer.detach();
      }

      scene = sceneRef;
      requestRender = requestRenderFn;
      createPrimitive();
      _isAttached = true;
      requestRender?.();
    },

    detach: () => {
      if (!_isAttached) return;
      removePrimitive();
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

    update: (start, end) => {
      if (_isDestroyed) return;
      _start = start;
      _end = end;
      if (_isAttached) {
        createPrimitive();
      }
    },

    show: () => {
      if (_isDestroyed) return;
      _isVisible = true;
      if (polylineCollection) {
        polylineCollection.show = true;
      }
      requestRender?.();
    },

    hide: () => {
      if (_isDestroyed) return;
      _isVisible = false;
      if (polylineCollection) {
        polylineCollection.show = false;
      }
      requestRender?.();
    },
  };

  return visualizer;
};

export default createLineVisualizer;
