import * as THREE from "three";
import type { BestImageAreaCache } from "./best-image-area-cache";
import type {
  SharedThreeHostRenderState,
  SharedThreeSceneRuntime,
} from "../../core/shared-three-scene-types";
import type { Meters } from "@carma-units";
import {
  AXIS_BOUNDARY_FRAGMENT_FUNCTION,
  AXIS_BOUNDARY_FRAGMENT_HEADER,
  axisBoundaryVisibleBounds,
  createSharedThreeAxisBoundaries,
  type AxisBoundarySite,
} from "./shared-three-axis-boundaries";
import type { SharedThreePhotoDepth } from "./shared-three-photo-depth";
import {
  createAxisCellCache,
  type AxisCellQueryMetrics,
  type AxisCellCache,
} from "./shared-three-axis-cell-cache";

const MAX_DISPLAY_PIXELS = 1_000_000;
const MAX_TARGET_BYTES = 32 * 1024 * 1024;
const BYTES_PER_PIXEL = 24; // RGBA32F receiver + depth + RGBA8 display.
const MAX_TILE_PIXELS = 128;
const MAX_TILE_EVALUATIONS = 250_000;
const MAX_DRAWS_PER_FRAME = 2;
const MAX_READY_TILES = 4;
const QUERY_SLICE_MS = 4;
const CAMERA_SETTLE_MS = 80;
const DEFAULT_FOCUS_RADIUS_METERS = 1_000;
const MAX_FOCUS_RADIUS_METERS = 1_000;
const FOCUS_GRID_METERS = 64;
const FOCUS_HYSTERESIS_METERS = 16;

export type AxisBoundaryDisplayFocus = Readonly<{
  center: THREE.Vector3;
  radiusMeters?: Meters;
}>;

export type SharedThreeAxisBoundaryDisplayStyle = Readonly<{
  enabled?: boolean;
  color?: THREE.ColorRepresentation;
  opacity?: number;
  widthCss?: number;
  pixelRatio?: number;
}>;

export type AxisBoundaryDisplayState = Readonly<{
  active: boolean;
  pending: boolean;
  width: number;
  height: number;
  allocatedBytes: number;
  targetLimitBytes: number;
  sourceCount: number;
  queriedTiles: number;
  renderedTiles: number;
  totalTiles: number;
  positionPasses: number;
  fieldPasses: number;
  focusCenter: readonly [number, number, number] | null;
  focusRadiusMeters: number;
  candidateCount: number;
  cacheHits: number;
  cacheMisses: number;
  indexBytes: number;
  queryElapsedMs: number;
  lastFrameEvaluations: number;
  lastFrameDraws: number;
  lastCacheQuery: AxisCellQueryMetrics | null;
  error?: string;
}>;

type Tile = {
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: THREE.Box3 | null;
};
type ReadyTile = { tile: Tile; indices: Uint32Array };
type RendererSnapshot = {
  target: THREE.WebGLRenderTarget | null;
  autoClear: boolean;
  viewport: THREE.Vector4;
  scissor: THREE.Vector4;
  scissorTest: boolean;
  clearColor: THREE.Color;
  clearAlpha: number;
  framebuffer: WebGLFramebuffer | null;
  depthRange: readonly [number, number];
};

export type SharedThreeAxisBoundaryDisplayResult = Readonly<{
  texture: THREE.Texture | null;
  /** Camera clip transform for mapping scene positions into this screen texture. */
  sceneToClip: THREE.Matrix4;
  width: number;
  height: number;
  changed: boolean;
  pending: boolean;
  progress: number;
}>;

export type AxisBoundaryDisplayUniforms = Readonly<{
  carmaAxisBoundaryDisplayTexture: { value: THREE.Texture | null };
  carmaAxisBoundaryDisplaySceneToClip: { value: THREE.Matrix4 };
  carmaAxisBoundaryDisplayEnabled: { value: number };
}>;

/**
 * Progressively display the exact calibrated angular field on visible receiver
 * positions. The spatial cache is only a conservative candidate accelerator;
 * every returned candidate is scored in the fragment shader without truncation.
 */
export const createSharedThreeAxisBoundaryDisplay = (
  runtimes: ReadonlyMap<string, SharedThreeSceneRuntime>,
  sharedDepth: SharedThreePhotoDepth,
  options: Readonly<{
    requestRepaint?: () => void;
    /** Optional externally-owned cache; injected caches are left alive on dispose. */
    cellCache?: AxisCellCache;
  }> = {}
) => {
  const cache = options.cellCache ?? createAxisCellCache();
  const ownsCache = options.cellCache === undefined;
  let candidateCache: BestImageAreaCache | undefined;
  let eligibleIds: ReadonlySet<string> | undefined;
  let eligibilityKey = "";
  let geometryRevision = -1;
  let axisRevision = -1;
  const packedSites = createSharedThreeAxisBoundaries({ maxUnusedEntries: 2 });
  const receiver = packedSites.acquire(null);
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.Camera();
  const positionUniform = { value: null as THREE.Texture | null };
  const positionTexelSizeUniform = { value: new THREE.Vector2(1, 1) };
  const displayIndicesUniform = { value: null as THREE.DataTexture | null };
  const displayIndicesSizeUniform = { value: new THREE.Vector2(1, 1) };
  const displayIndexCountUniform = { value: 0 };
  const displayTextureUniform = { value: null as THREE.Texture | null };
  const displaySceneToClipUniform = { value: new THREE.Matrix4() };
  const displayEnabledUniform = { value: 0 };
  const displayFocusCenterUniform = { value: new THREE.Vector3() };
  const displayFocusRadiusUniform = { value: DEFAULT_FOCUS_RADIUS_METERS };
  const uniforms: AxisBoundaryDisplayUniforms = {
    carmaAxisBoundaryDisplayTexture: displayTextureUniform,
    carmaAxisBoundaryDisplaySceneToClip: displaySceneToClipUniform,
    carmaAxisBoundaryDisplayEnabled: displayEnabledUniform,
  };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...receiver.uniforms,
      carmaAxisBoundaryReceiverPosition: positionUniform,
      carmaAxisBoundaryReceiverPositionTexelSize: positionTexelSizeUniform,
      carmaAxisBoundaryFocusCenter: displayFocusCenterUniform,
      carmaAxisBoundaryFocusRadius: displayFocusRadiusUniform,
      carmaAxisBoundaryDisplayIndices: displayIndicesUniform,
      carmaAxisBoundaryDisplayIndicesSize: displayIndicesSizeUniform,
      carmaAxisBoundaryDisplayIndexCount: displayIndexCountUniform,
    },
    vertexShader: /* glsl */ `
      varying vec2 vAxisDisplayUv;
      void main() {
        vAxisDisplayUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #define CARMA_AXIS_BOUNDARY_TILED_PASS
      #define CARMA_AXIS_BOUNDARY_DISPLAY_INDEXED_PASS
      #define CARMA_AXIS_BOUNDARY_DISPLAY_SURFACE_DERIVATIVES
      varying vec2 vAxisDisplayUv;
      uniform sampler2D carmaAxisBoundaryReceiverPosition;
      uniform vec2 carmaAxisBoundaryReceiverPositionTexelSize;
      uniform vec3 carmaAxisBoundaryFocusCenter;
      uniform float carmaAxisBoundaryFocusRadius;
      ${AXIS_BOUNDARY_FRAGMENT_HEADER}
      ${AXIS_BOUNDARY_FRAGMENT_FUNCTION}

      bool carmaAxisBoundaryDisplayReadMetricPoint(vec2 uv, out vec3 point) {
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)
          return false;
        vec4 receiver = texture2D(carmaAxisBoundaryReceiverPosition, uv);
        if (receiver.w <= 0.0) return false;
        vec4 metric = carmaAxisBoundarySceneToMetric * vec4(receiver.xyz, 1.0);
        if (metric.w == 0.0) return false;
        point = metric.xyz / metric.w;
        return true;
      }

      vec3 carmaAxisBoundaryDisplayNearestDerivative(
        vec2 positiveUv, vec2 negativeUv, vec3 centerPoint) {
        vec3 derivative = vec3(0.0);
        float nearestDistanceSquared = 1.0e30;
        vec3 neighborPoint;
        if (carmaAxisBoundaryDisplayReadMetricPoint(positiveUv, neighborPoint)) {
          vec3 delta = neighborPoint - centerPoint;
          float distanceSquared = dot(delta, delta);
          if (distanceSquared < nearestDistanceSquared) {
            nearestDistanceSquared = distanceSquared;
            derivative = delta;
          }
        }
        if (carmaAxisBoundaryDisplayReadMetricPoint(negativeUv, neighborPoint)) {
          vec3 delta = centerPoint - neighborPoint;
          float distanceSquared = dot(delta, delta);
          if (distanceSquared < nearestDistanceSquared) derivative = delta;
        }
        return derivative;
      }

      void main() {
        vec4 receiver = texture2D(carmaAxisBoundaryReceiverPosition, vAxisDisplayUv);
        if (receiver.w <= 0.0) discard;
        vec4 metric = carmaAxisBoundarySceneToMetric * vec4(receiver.xyz, 1.0);
        if (metric.w == 0.0) discard;
        vec3 centerPoint = metric.xyz / metric.w;
        vec3 focusDelta = centerPoint - carmaAxisBoundaryFocusCenter;
        if (dot(focusDelta, focusDelta) >
            carmaAxisBoundaryFocusRadius * carmaAxisBoundaryFocusRadius)
          discard;
        carmaAxisBoundaryDisplayPointDx =
          carmaAxisBoundaryDisplayNearestDerivative(
            vAxisDisplayUv + vec2(carmaAxisBoundaryReceiverPositionTexelSize.x, 0.0),
            vAxisDisplayUv - vec2(carmaAxisBoundaryReceiverPositionTexelSize.x, 0.0),
            centerPoint);
        carmaAxisBoundaryDisplayPointDy =
          carmaAxisBoundaryDisplayNearestDerivative(
            vAxisDisplayUv + vec2(0.0, carmaAxisBoundaryReceiverPositionTexelSize.y),
            vAxisDisplayUv - vec2(0.0, carmaAxisBoundaryReceiverPositionTexelSize.y),
            centerPoint);
        vec4 contour = carmaAxisBoundaryContour(receiver.xyz);
        if (contour.a <= 0.0) discard;
        gl_FragColor = contour;
      }
    `,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quadScene.add(quad);

  let positionTarget: THREE.WebGLRenderTarget | undefined;
  let displayTarget: THREE.WebGLRenderTarget | undefined;
  let indexDataTexture: THREE.DataTexture | undefined;
  let indexData: Float32Array | undefined;
  let sites: readonly AxisBoundarySite[] = [];
  let sceneToMetric = new THREE.Matrix4();
  let style: SharedThreeAxisBoundaryDisplayStyle = {
    enabled: false,
    color: 0xffcf40,
    opacity: 0.8,
    widthCss: 1,
    pixelRatio: 1,
  };
  let disposed = false;
  let generation = 0;
  let sourceRevision = 0;
  let queryAbort: AbortController | undefined;
  let queryQueue: Tile[] = [];
  let readyTiles: ReadyTile[] = [];
  let queryRunning = false;
  let positionKey = "";
  let viewKey = "";
  let lastViewChange = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let targetWidth = 0;
  let targetHeight = 0;
  let outputCleared = false;
  let styleDirty = true;
  let queryFailed = false;
  let renderError: string | undefined;
  let positionPasses = 0;
  let fieldPasses = 0;
  let candidateCount = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  let indexBytes = 0;
  let queryElapsedMs = 0;
  let lastFrameEvaluations = 0;
  let lastFrameDraws = 0;
  let lastCacheQuery: AxisCellQueryMetrics | null = null;
  let queriedTiles = 0;
  let renderedTiles = 0;
  let totalTiles = 0;
  let pendingView = false;
  let allocatedBytes = 0;

  const target = (
    width: number,
    height: number,
    type: THREE.TextureDataType,
    depthBuffer: boolean
  ) => {
    const value = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type,
      depthBuffer,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    value.texture.colorSpace = THREE.NoColorSpace;
    value.texture.generateMipmaps = false;
    if (type === THREE.FloatType) value.texture.internalFormat = "RGBA32F";
    return value;
  };

  const disposeTargets = () => {
    positionTarget?.dispose();
    displayTarget?.dispose();
    indexDataTexture?.dispose();
    positionTarget = displayTarget = undefined;
    indexDataTexture = undefined;
    indexData = undefined;
    positionUniform.value = null;
    displayIndicesUniform.value = null;
    displayIndexCountUniform.value = 0;
    displayTextureUniform.value = null;
    targetWidth = targetHeight = allocatedBytes = 0;
    positionKey = "";
    outputCleared = false;
  };

  const setDisplayIndices = (
    indices: Uint32Array,
    maxTextureSize: number
  ): boolean => {
    if (!indices.length) return false;
    const width = Math.min(maxTextureSize, indices.length);
    const height = Math.ceil(indices.length / width);
    if (height > maxTextureSize) {
      renderError = "Axis-boundary candidate index texture exceeds GPU limits.";
      return false;
    }
    if (
      !indexDataTexture ||
      indexDataTexture.image.width !== width ||
      indexDataTexture.image.height !== height
    ) {
      indexDataTexture?.dispose();
      indexData = new Float32Array(width * height * 4);
      indexDataTexture = new THREE.DataTexture(
        indexData,
        width,
        height,
        THREE.RGBAFormat,
        THREE.FloatType
      );
      indexDataTexture.minFilter = THREE.NearestFilter;
      indexDataTexture.magFilter = THREE.NearestFilter;
      indexDataTexture.generateMipmaps = false;
      indexDataTexture.colorSpace = THREE.NoColorSpace;
      indexDataTexture.internalFormat = "RGBA32F";
      indexDataTexture.needsUpdate = true;
      displayIndicesUniform.value = indexDataTexture;
      displayIndicesSizeUniform.value.set(width, height);
    }
    const buffer = indexData!;
    for (let index = 0; index < indices.length; index++)
      buffer[index * 4] = indices[index];
    indexDataTexture!.needsUpdate = true;
    displayIndexCountUniform.value = indices.length;
    return true;
  };

  const invalidate = (clearTexture = true) => {
    generation++;
    queryAbort?.abort();
    queryAbort = undefined;
    queryQueue = [];
    readyTiles = [];
    queryRunning = false;
    queriedTiles = renderedTiles = totalTiles = 0;
    pendingView = true;
    queryFailed = false;
    if (clearTexture) outputCleared = false;
    styleDirty = true;
    options.requestRepaint?.();
  };

  const captureRendererState = (
    renderer: THREE.WebGLRenderer,
    host: SharedThreeHostRenderState | undefined
  ): RendererSnapshot => {
    const gl = renderer.getContext();
    const previousTarget = renderer.getRenderTarget();
    const range =
      host && !previousTarget
        ? host.depthRange
        : (gl.getParameter(gl.DEPTH_RANGE) as readonly [number, number]);
    return {
      target: previousTarget,
      autoClear: renderer.autoClear,
      viewport: renderer.getViewport(new THREE.Vector4()),
      scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(),
      clearColor: renderer.getClearColor(new THREE.Color()),
      clearAlpha: renderer.getClearAlpha(),
      framebuffer: host
        ? host.framebuffer
        : (gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null),
      depthRange: [range[0], range[1]],
    };
  };

  const restoreRendererState = (
    renderer: THREE.WebGLRenderer,
    snapshot: RendererSnapshot
  ) => {
    const gl = renderer.getContext();
    renderer.autoClear = snapshot.autoClear;
    renderer.resetState();
    renderer.setRenderTarget(snapshot.target);
    renderer.setViewport(snapshot.viewport);
    renderer.setScissor(snapshot.scissor);
    renderer.setScissorTest(snapshot.scissorTest);
    renderer.setClearColor(snapshot.clearColor, snapshot.clearAlpha);
    if (!snapshot.target) {
      if (renderer.state)
        renderer.state.bindFramebuffer(gl.FRAMEBUFFER, snapshot.framebuffer);
      else gl.bindFramebuffer(gl.FRAMEBUFFER, snapshot.framebuffer);
    }
    gl.depthRange(snapshot.depthRange[0], snapshot.depthRange[1]);
  };

  const targetSize = (
    renderer: THREE.WebGLRenderer,
    viewport: THREE.Vector2
  ) => {
    const requestedWidth = Math.max(1, Math.floor(viewport.x));
    const requestedHeight = Math.max(1, Math.floor(viewport.y));
    const maxSize = Math.max(1, renderer.capabilities.maxTextureSize);
    const maxPixels = Math.min(
      MAX_DISPLAY_PIXELS,
      Math.floor(MAX_TARGET_BYTES / BYTES_PER_PIXEL)
    );
    const scale = Math.min(
      1,
      maxSize / requestedWidth,
      maxSize / requestedHeight,
      Math.sqrt(maxPixels / (requestedWidth * requestedHeight))
    );
    return {
      requestedWidth,
      requestedHeight,
      width: Math.max(1, Math.floor(requestedWidth * scale)),
      height: Math.max(1, Math.floor(requestedHeight * scale)),
    };
  };

  const ensureTargets = (
    renderer: THREE.WebGLRenderer,
    viewport: THREE.Vector2
  ) => {
    const size = targetSize(renderer, viewport);
    if (
      positionTarget &&
      displayTarget &&
      size.width === targetWidth &&
      size.height === targetHeight
    )
      return size;
    disposeTargets();
    targetWidth = size.width;
    targetHeight = size.height;
    positionTarget = target(targetWidth, targetHeight, THREE.FloatType, true);
    displayTarget = target(
      targetWidth,
      targetHeight,
      THREE.UnsignedByteType,
      false
    );
    positionUniform.value = positionTarget.texture;
    positionTexelSizeUniform.value.set(1 / targetWidth, 1 / targetHeight);
    displayTextureUniform.value = displayTarget.texture;
    allocatedBytes = targetWidth * targetHeight * BYTES_PER_PIXEL;
    return size;
  };

  const setTargetRect = (
    renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    tile?: Tile
  ) => {
    renderer.setViewport(new THREE.Vector4(0, 0, width, height));
    if (!tile) {
      renderer.setScissorTest(false);
      return;
    }
    renderer.setScissor(
      new THREE.Vector4(
        tile.x,
        height - tile.y - tile.height,
        tile.width,
        tile.height
      )
    );
    renderer.setScissorTest(true);
  };

  const clearDisplay = (renderer: THREE.WebGLRenderer) => {
    if (!displayTarget) return;
    renderer.setRenderTarget(displayTarget);
    setTargetRect(renderer, targetWidth, targetHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    outputCleared = true;
    styleDirty = false;
  };

  const clipForTile = (
    sceneToClip: THREE.Matrix4,
    tile: Tile
  ): THREE.Matrix4 => {
    const sx = targetWidth / tile.width;
    const sy = targetHeight / tile.height;
    const tx = (targetWidth - 2 * tile.x - tile.width) / tile.width;
    const ty = (tile.height - targetHeight + 2 * tile.y) / tile.height;
    const crop = new THREE.Matrix4();
    const output = crop.elements;
    const input = sceneToClip.elements;
    for (let column = 0; column < 4; column++) {
      const offset = column * 4;
      output[offset] = sx * input[offset] + tx * input[offset + 3];
      output[offset + 1] = sy * input[offset + 1] + ty * input[offset + 3];
      output[offset + 2] = input[offset + 2];
      output[offset + 3] = input[offset + 3];
    }
    return crop;
  };

  const tileBounds = (
    sceneToClip: THREE.Matrix4,
    tile: Tile,
    bounds: THREE.Box3 | null
  ): THREE.Box3 | null => {
    if (!bounds) return null;
    const metricToScene = sceneToMetric.clone().invert();
    if (
      !metricToScene.elements.every(Number.isFinite) ||
      !Number.isFinite(metricToScene.determinant()) ||
      metricToScene.determinant() === 0
    )
      return new THREE.Box3().makeEmpty();
    const metricToClip = sceneToClip.clone().multiply(metricToScene);
    return axisBoundaryVisibleBounds(bounds, clipForTile(metricToClip, tile));
  };

  const split = (tile: Tile): Tile[] => {
    if (tile.width <= 1 && tile.height <= 1) return [];
    const leftWidth = Math.floor(tile.width / 2);
    const topHeight = Math.floor(tile.height / 2);
    const widths =
      leftWidth > 0 ? [leftWidth, tile.width - leftWidth] : [tile.width];
    const heights =
      topHeight > 0 ? [topHeight, tile.height - topHeight] : [tile.height];
    const result: Tile[] = [];
    let y = tile.y;
    for (const height of heights) {
      let x = tile.x;
      for (const width of widths) {
        result.push({ x, y, width, height, bounds: null });
        x += width;
      }
      y += height;
    }
    return result;
  };

  const initTiles = (sceneToClip: THREE.Matrix4, bounds: THREE.Box3 | null) => {
    queryAbort?.abort();
    queryAbort = new AbortController();
    queryQueue = [];
    readyTiles = [];
    queriedTiles = renderedTiles = 0;
    for (let y = 0; y < targetHeight; y += MAX_TILE_PIXELS)
      for (let x = 0; x < targetWidth; x += MAX_TILE_PIXELS) {
        const tile: Tile = {
          x,
          y,
          width: Math.min(MAX_TILE_PIXELS, targetWidth - x),
          height: Math.min(MAX_TILE_PIXELS, targetHeight - y),
          bounds: null,
        };
        tile.bounds = tileBounds(sceneToClip, tile, bounds);
        queryQueue.push(tile);
      }
    totalTiles = queryQueue.length;
    pendingView = false;
    const requestGeneration = generation;
    void pumpQueries(requestGeneration);
  };

  const pumpQueries = async (requestGeneration: number) => {
    if (queryRunning || disposed || requestGeneration !== generation) return;
    queryRunning = true;
    let sliceStart = performance.now();
    try {
      while (
        !disposed &&
        requestGeneration === generation &&
        queryQueue.length &&
        readyTiles.length < MAX_READY_TILES
      ) {
        const tile = queryQueue.shift()!;
        if (tile.bounds?.isEmpty()) {
          queriedTiles++;
          renderedTiles++;
          continue;
        }
        const result = await (candidateCache
          ? candidateCache.query(tile.bounds, queryAbort?.signal)
          : cache.queryBounds(tile.bounds, queryAbort?.signal));
        if (!result || disposed || requestGeneration !== generation) return;
        if (
          candidateCache &&
          (!("geometryRevision" in result) ||
            result.geometryRevision !== geometryRevision ||
            !("axisRevision" in result) ||
            result.axisRevision !== axisRevision)
        ) {
          // The owner published another table while this query was pending.
          // Its next overlay update supplies matching packed data; never draw
          // a new global index against the preceding camera atlas.
          options.requestRepaint?.();
          return;
        }
        const indices = eligibleIds
          ? result.indices.filter(
              (index) => !!sites[index] && eligibleIds!.has(sites[index].id)
            )
          : result.indices;
        queriedTiles++;
        lastCacheQuery = result.metrics;
        candidateCount += indices.length;
        cacheHits += result.metrics.cacheHits;
        cacheMisses += result.metrics.cacheMisses;
        indexBytes = Math.max(indexBytes, result.metrics.indexBytes);
        queryElapsedMs += result.metrics.elapsedMs;
        const work = tile.width * tile.height * indices.length;
        if (work > MAX_TILE_EVALUATIONS) {
          const children = split(tile);
          if (children.length) {
            totalTiles += children.length - 1;
            for (const child of children) {
              child.bounds = tileBounds(
                currentSceneToClip,
                child,
                currentBounds
              );
              queryQueue.unshift(child);
            }
            continue;
          }
          renderError =
            "One pixel exceeds the axis-boundary evaluation budget.";
          renderedTiles++;
          continue;
        }
        if (indices.length >= 2) readyTiles.push({ tile, indices });
        else renderedTiles++;
        options.requestRepaint?.();
        if (performance.now() - sliceStart >= QUERY_SLICE_MS) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          sliceStart = performance.now();
        }
      }
    } catch (error) {
      if (!disposed && requestGeneration === generation) {
        renderError = error instanceof Error ? error.message : String(error);
        queryFailed = true;
        queryQueue = [];
        readyTiles = [];
        renderedTiles = totalTiles;
        pendingView = false;
        displayEnabledUniform.value = 0;
      }
    } finally {
      if (requestGeneration === generation) queryRunning = false;
      options.requestRepaint?.();
    }
  };

  let currentSceneToClip = new THREE.Matrix4();
  let currentBounds: THREE.Box3 | null = null;
  let snappedFocusCenter: THREE.Vector3 | null = null;
  let hasValidFocus = false;

  const resolveFocus = (focus: AxisBoundaryDisplayFocus | undefined) => {
    if (!focus || !focus.center.toArray().every(Number.isFinite)) return null;
    const requestedRadius = focus.radiusMeters ?? DEFAULT_FOCUS_RADIUS_METERS;
    if (!Number.isFinite(requestedRadius) || requestedRadius <= 0) return null;
    const radiusMeters = Math.min(requestedRadius, MAX_FOCUS_RADIUS_METERS);
    const coordinates = focus.center.toArray();
    const snapped = snappedFocusCenter?.toArray();
    const gridCoordinate = (coordinate: number) => {
      const value =
        Math.round(coordinate / FOCUS_GRID_METERS) * FOCUS_GRID_METERS;
      return value === 0 ? 0 : value;
    };
    const nextCoordinates = coordinates.map((coordinate, axis) => {
      if (!snapped) return gridCoordinate(coordinate);
      const current = snapped[axis];
      const nearest = gridCoordinate(coordinate);
      const threshold = FOCUS_GRID_METERS / 2 + FOCUS_HYSTERESIS_METERS;
      if (nearest > current && coordinate >= current + threshold)
        return nearest;
      if (nearest < current && coordinate <= current - threshold)
        return nearest;
      return current;
    });
    snappedFocusCenter = new THREE.Vector3(
      nextCoordinates[0],
      nextCoordinates[1],
      nextCoordinates[2]
    );
    return { center: snappedFocusCenter.clone(), radiusMeters };
  };

  const scheduleStableRepaint = (now: number) => {
    if (settleTimer !== undefined) return;
    const delay = Math.max(0, CAMERA_SETTLE_MS - (now - lastViewChange));
    settleTimer = setTimeout(() => {
      settleTimer = undefined;
      options.requestRepaint?.();
    }, delay);
  };

  const viewKeyOf = (
    sceneToClip: THREE.Matrix4,
    size: {
      width: number;
      height: number;
      requestedWidth: number;
      requestedHeight: number;
    },
    revision: number,
    bounds: THREE.Box3 | null,
    focusCenter: THREE.Vector3,
    focusRadius: number
  ) =>
    [
      ...sceneToClip.elements,
      ...sceneToMetric.elements,
      size.width,
      size.height,
      size.requestedWidth,
      size.requestedHeight,
      revision,
      sourceRevision,
      ...focusCenter.toArray(),
      focusRadius,
      bounds
        ? [...bounds.min.toArray(), ...bounds.max.toArray()].join(",")
        : "all",
    ].join(",");

  const render = (
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    viewport: THREE.Vector2,
    hostRenderState?: SharedThreeHostRenderState,
    boundsInMetric?: THREE.Box3 | null,
    preparedDepth?: ReturnType<SharedThreePhotoDepth["sync"]>,
    focusInMetric?: AxisBoundaryDisplayFocus
  ): SharedThreeAxisBoundaryDisplayResult => {
    lastFrameEvaluations = 0;
    lastFrameDraws = 0;
    const sceneToClip = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    currentSceneToClip.copy(sceneToClip);
    displaySceneToClipUniform.value.copy(sceneToClip);
    const focus = resolveFocus(focusInMetric);
    if (!focus) {
      const hadFocus = hasValidFocus;
      hasValidFocus = false;
      snappedFocusCenter = null;
      pendingView = false;
      if (hadFocus || positionTarget || displayTarget) detach();
      else displayEnabledUniform.value = 0;
      return {
        texture: null,
        sceneToClip,
        width: 0,
        height: 0,
        changed: false,
        pending: false,
        progress: 0,
      };
    }
    hasValidFocus = true;
    displayFocusCenterUniform.value.copy(focus.center);
    displayFocusRadiusUniform.value = focus.radiusMeters;
    const focusBounds = new THREE.Box3(
      focus.center.clone().addScalar(-focus.radiusMeters),
      focus.center.clone().addScalar(focus.radiusMeters)
    );
    currentBounds = boundsInMetric
      ? focusBounds.intersect(boundsInMetric.clone())
      : focusBounds;
    const styleEnabled =
      !disposed &&
      style.enabled !== false &&
      style.widthCss !== 0 &&
      style.opacity !== 0;
    if (queryFailed) {
      pendingView = false;
      displayEnabledUniform.value = 0;
      if (positionTarget || displayTarget) detach();
      return {
        texture: null,
        sceneToClip,
        width: targetWidth,
        height: targetHeight,
        changed: false,
        pending: false,
        progress: 0,
      };
    }
    if (!styleEnabled) {
      pendingView = false;
      if (positionTarget || displayTarget) detach();
      displayEnabledUniform.value = 0;
      return {
        texture: null,
        sceneToClip,
        width: targetWidth,
        height: targetHeight,
        changed: false,
        pending: false,
        progress: 0,
      };
    }
    if (renderer.extensions?.has("EXT_color_buffer_float") !== true) {
      pendingView = false;
      displayEnabledUniform.value = 0;
      renderError = "EXT_color_buffer_float is unavailable.";
      return {
        texture: null,
        sceneToClip,
        width: targetWidth,
        height: targetHeight,
        changed: false,
        pending: false,
        progress: 0,
      };
    }
    const size = ensureTargets(renderer, viewport);
    if (!positionTarget || !displayTarget) {
      pendingView = false;
      displayEnabledUniform.value = 0;
      return {
        texture: null,
        sceneToClip,
        width: targetWidth,
        height: targetHeight,
        changed: false,
        pending: false,
        progress: 0,
      };
    }
    displayEnabledUniform.value = 1;
    const receiverState = preparedDepth ?? sharedDepth.sync();
    const inputKey = viewKeyOf(
      sceneToClip,
      size,
      receiverState.revision,
      currentBounds,
      focus.center,
      focus.radiusMeters
    );
    const now = performance.now();
    if (inputKey !== viewKey) {
      viewKey = inputKey;
      lastViewChange = now;
      invalidate();
      renderError = undefined;
      const snapshot = captureRendererState(renderer, hostRenderState);
      try {
        clearDisplay(renderer);
      } finally {
        restoreRendererState(renderer, snapshot);
      }
      scheduleStableRepaint(now);
      return {
        texture: displayTarget.texture,
        sceneToClip,
        width: targetWidth,
        height: targetHeight,
        changed: true,
        pending: true,
        progress: 0,
      };
    }
    if (now - lastViewChange < CAMERA_SETTLE_MS) {
      scheduleStableRepaint(now);
      return {
        texture: displayTarget.texture,
        sceneToClip,
        width: targetWidth,
        height: targetHeight,
        changed: false,
        pending: true,
        progress: 0,
      };
    }

    const snapshot = captureRendererState(renderer, hostRenderState);
    let changed = false;
    try {
      if (!outputCleared || styleDirty) {
        clearDisplay(renderer);
        changed = true;
      }
      const currentPositionKey = `${sceneToClip.elements.join(
        ","
      )}:${sceneToMetric.elements.join(",")}:${
        receiverState.revision
      }:${targetWidth}:${targetHeight}`;
      if (positionKey !== currentPositionKey) {
        renderer.setRenderTarget(positionTarget);
        renderer.getContext().depthRange(0, 1);
        setTargetRect(renderer, targetWidth, targetHeight);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, false);
        sharedDepth.renderView(renderer, camera, { positions: true });
        positionKey = currentPositionKey;
        positionPasses++;
        changed = true;
        initTiles(sceneToClip, currentBounds);
      } else if (
        !queryQueue.length &&
        !queryRunning &&
        !readyTiles.length &&
        !totalTiles
      ) {
        initTiles(sceneToClip, currentBounds);
      }

      const pixelRatio =
        Math.max(0.0001, style.pixelRatio ?? 1) *
        Math.min(
          targetWidth / size.requestedWidth,
          targetHeight / size.requestedHeight
        );
      packedSites.setSceneToMetric(sceneToMetric);
      packedSites.setStyle({
        ...style,
        pixelRatio,
      });
      renderer.setRenderTarget(displayTarget);
      setTargetRect(renderer, targetWidth, targetHeight);
      let draws = 0;
      let evaluations = 0;
      while (readyTiles.length && draws < MAX_DRAWS_PER_FRAME) {
        const ready = readyTiles[0];
        const work =
          ready.tile.width * ready.tile.height * ready.indices.length;
        if (
          draws &&
          evaluations + work > MAX_TILE_EVALUATIONS * MAX_DRAWS_PER_FRAME
        )
          break;
        readyTiles.shift();
        if (
          !setDisplayIndices(
            ready.indices,
            renderer.capabilities.maxTextureSize
          )
        ) {
          renderedTiles++;
          continue;
        }
        renderer.setScissor(
          new THREE.Vector4(
            ready.tile.x,
            targetHeight - ready.tile.y - ready.tile.height,
            ready.tile.width,
            ready.tile.height
          )
        );
        renderer.setScissorTest(true);
        renderer.render(quadScene, quadCamera);
        draws++;
        evaluations += work;
        lastFrameEvaluations = evaluations;
        lastFrameDraws = draws;
        renderedTiles++;
        fieldPasses++;
        changed = true;
      }
      if (queryQueue.length && readyTiles.length < MAX_READY_TILES)
        void pumpQueries(generation);
      renderer.setScissorTest(false);
    } finally {
      restoreRendererState(renderer, snapshot);
    }
    const pending =
      queryQueue.length > 0 ||
      queryRunning ||
      readyTiles.length > 0 ||
      renderedTiles < totalTiles;
    if (pending) options.requestRepaint?.();
    return {
      texture: displayTarget.texture,
      sceneToClip,
      width: targetWidth,
      height: targetHeight,
      changed,
      pending,
      progress: totalTiles ? Math.min(1, renderedTiles / totalTiles) : 1,
    };
  };

  const detach = (notify = true) => {
    if (disposed) return;
    hasValidFocus = false;
    snappedFocusCenter = null;
    displayFocusCenterUniform.value.set(0, 0, 0);
    displayFocusRadiusUniform.value = 0;
    generation++;
    queryAbort?.abort();
    queryAbort = undefined;
    queryQueue = [];
    readyTiles = [];
    queryRunning = false;
    queriedTiles = renderedTiles = totalTiles = 0;
    pendingView = false;
    if (settleTimer !== undefined) clearTimeout(settleTimer);
    settleTimer = undefined;
    viewKey = "";
    lastViewChange = 0;
    displayEnabledUniform.value = 0;
    disposeTargets();
    if (notify) options.requestRepaint?.();
  };

  return {
    uniforms,
    get state(): AxisBoundaryDisplayState {
      return {
        active:
          style.enabled !== false &&
          style.widthCss !== 0 &&
          style.opacity !== 0 &&
          !disposed &&
          hasValidFocus,
        pending:
          pendingView ||
          settleTimer !== undefined ||
          queryQueue.length > 0 ||
          queryRunning ||
          readyTiles.length > 0 ||
          (renderedTiles < totalTiles && !queryFailed),
        width: targetWidth,
        height: targetHeight,
        allocatedBytes,
        targetLimitBytes: MAX_TARGET_BYTES,
        sourceCount: sites.length,
        queriedTiles,
        renderedTiles,
        totalTiles,
        positionPasses,
        fieldPasses,
        focusCenter:
          hasValidFocus && snappedFocusCenter
            ? [snappedFocusCenter.x, snappedFocusCenter.y, snappedFocusCenter.z]
            : null,
        focusRadiusMeters: hasValidFocus ? displayFocusRadiusUniform.value : 0,
        candidateCount,
        cacheHits,
        cacheMisses,
        indexBytes,
        queryElapsedMs,
        lastFrameEvaluations,
        lastFrameDraws,
        lastCacheQuery,
        error: renderError,
      };
    },
    setSites(
      next: readonly AxisBoundarySite[],
      shared: Readonly<{
        candidateCache?: BestImageAreaCache;
        eligibleIds?: ReadonlySet<string>;
      }> = {}
    ) {
      if (disposed) return false;
      const field = shared.candidateCache?.readField();
      const valid =
        field?.sites ??
        next.filter(
          (site) =>
            site.sceneToImage.elements.every(Number.isFinite) &&
            site.eye.toArray().every(Number.isFinite) &&
            site.direction.toArray().every(Number.isFinite) &&
            site.direction.lengthSq() > 0 &&
            Number.isFinite(site.direction.lengthSq())
        );
      const nextEligibilityKey = shared.eligibleIds
        ? JSON.stringify(
            valid
              .filter((site) => shared.eligibleIds!.has(site.id))
              .map((site) => site.id)
          )
        : "all";
      const bindingChanged =
        candidateCache !== shared.candidateCache ||
        eligibilityKey !== nextEligibilityKey ||
        geometryRevision !== (field?.geometryRevision ?? -1) ||
        axisRevision !== (field?.axisRevision ?? -1);
      const changed = packedSites.setSites(valid);
      if (!changed && !bindingChanged) return false;
      sites = valid;
      candidateCache = shared.candidateCache;
      eligibleIds = shared.eligibleIds
        ? new Set(shared.eligibleIds)
        : undefined;
      eligibilityKey = nextEligibilityKey;
      geometryRevision = field?.geometryRevision ?? -1;
      axisRevision = field?.axisRevision ?? -1;
      // Only the standalone display owns index configuration. The shared field
      // may include additional heading groups and must never be narrowed here.
      if (!candidateCache) cache.setSites(valid);
      sourceRevision++;
      invalidate();
      return true;
    },
    setSceneToMetric(matrix: THREE.Matrix4) {
      if (disposed || !matrix.elements.every(Number.isFinite)) return false;
      if (sceneToMetric.equals(matrix)) return false;
      sceneToMetric.copy(matrix);
      packedSites.setSceneToMetric(matrix);
      invalidate();
      return true;
    },
    setStyle(next: SharedThreeAxisBoundaryDisplayStyle) {
      if (disposed) return false;
      const previous = style;
      const merged = { ...style, ...next };
      if (
        previous.enabled === merged.enabled &&
        previous.color === merged.color &&
        previous.opacity === merged.opacity &&
        previous.widthCss === merged.widthCss &&
        previous.pixelRatio === merged.pixelRatio
      )
        return false;
      style = merged;
      packedSites.setStyle(style);
      invalidate(false);
      styleDirty = true;
      if (
        merged.enabled === false ||
        merged.widthCss === 0 ||
        merged.opacity === 0
      ) {
        displayEnabledUniform.value = 0;
        detach();
      }
      return true;
    },
    render,
    /** Release GPU targets and pending work while keeping the owned cache reusable. */
    detach,
    dispose() {
      if (disposed) return;
      detach(false);
      disposed = true;
      displayEnabledUniform.value = 0;
      if (ownsCache) cache.dispose();
      indexDataTexture?.dispose();
      receiver.dispose();
      packedSites.dispose();
      material.dispose();
      quad.geometry.dispose();
      quadScene.clear();
    },
  };
};
