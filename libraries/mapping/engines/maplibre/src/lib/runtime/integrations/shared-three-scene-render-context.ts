import * as THREE from "three";

export type DepthRange = readonly [near: number, far: number];

export type RenderTargetDepthRangeBridge = {
  render: (depthRange: DepthRange, callback: () => void) => void;
  dispose: () => void;
};

type SharedCanvasViewportRenderer = Pick<THREE.WebGLRenderer, "setViewport">;

type OverlayDepthContext = Pick<
  WebGLRenderingContext,
  "DEPTH_BUFFER_BIT" | "clear" | "clearDepth" | "depthMask" | "depthRange"
>;

type GroundClearContext = OverlayDepthContext &
  Pick<
    WebGLRenderingContext,
    "COLOR_BUFFER_BIT" | "COLOR_CLEAR_VALUE" | "clearColor" | "getParameter"
  >;

/** Clear the shared framebuffer depth without disturbing MapLibre's range. */
const clearSharedDepthBuffer = (
  gl: OverlayDepthContext,
  mapLibreDepthRange: DepthRange
): void => {
  gl.depthMask(true);
  gl.depthRange(0, 1);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.depthRange(mapLibreDepthRange[0], mapLibreDepthRange[1]);
};

/**
 * Remove MapLibre's captured ground pass from the shared framebuffer before
 * Three draws the actual terrain. The color remains available through the
 * framebuffer texture, but MapLibre's flat fill, DEM surface and skirts must
 * not survive as a second visible ground surface.
 */
export const clearMapStyleGroundBeforeThreeTerrain = (
  gl: GroundClearContext,
  mapLibreDepthRange: DepthRange
): void => {
  const clearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;
  gl.depthMask(true);
  gl.depthRange(0, 1);
  gl.clearDepth(1);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
  gl.depthRange(mapLibreDepthRange[0], mapLibreDepthRange[1]);
};

/** Let the explicitly retained place-label layers render above Three. */
export const clearDepthForMapStyleOverlays = clearSharedDepthBuffer;

/**
 * Give the render camera the real local-scene pose while retaining MapLibre's
 * exact scene-to-clip transform.
 *
 * MapLibre supplies the complete scene-to-clip matrix, whereas Three expects
 * separate projection and view matrices. Compensating the projection by the
 * camera world matrix keeps `projection * view` unchanged and makes Three's
 * view-space shader inputs describe the synthesized map camera correctly.
 */
export const configureSharedRenderCamera = (
  renderCamera: THREE.PerspectiveCamera,
  lodCamera: THREE.PerspectiveCamera,
  sceneToClipMatrix: THREE.Matrix4
): void => {
  renderCamera.position.copy(lodCamera.position);
  renderCamera.quaternion.copy(lodCamera.quaternion);
  renderCamera.scale.copy(lodCamera.scale);
  renderCamera.up.copy(lodCamera.up);
  renderCamera.fov = lodCamera.fov;
  renderCamera.aspect = lodCamera.aspect;
  renderCamera.near = lodCamera.near;
  renderCamera.far = lodCamera.far;
  renderCamera.zoom = lodCamera.zoom;
  renderCamera.focus = lodCamera.focus;
  renderCamera.filmGauge = lodCamera.filmGauge;
  renderCamera.filmOffset = lodCamera.filmOffset;
  renderCamera.matrix.copy(lodCamera.matrix);
  renderCamera.matrixWorld.copy(lodCamera.matrixWorld);
  renderCamera.matrixWorldInverse.copy(lodCamera.matrixWorldInverse);
  renderCamera.projectionMatrix
    .copy(sceneToClipMatrix)
    .multiply(renderCamera.matrixWorld);
  renderCamera.projectionMatrixInverse
    .copy(renderCamera.projectionMatrix)
    .invert();
};

/**
 * Keep Three's main-framebuffer viewport in sync with the canvas MapLibre owns.
 *
 * WebGLRenderer snapshots the canvas dimensions when it is constructed. A
 * later MapLibre resize changes the shared canvas drawing buffer without
 * updating Three's private main viewport. After rendering a shadow map, Three
 * would therefore restore that stale viewport and stretch or clip the scene.
 * Updating only the viewport avoids calling `setSize`, which would write back
 * to a canvas whose size lifecycle belongs to MapLibre.
 */
export const syncSharedCanvasViewport = (
  renderer: SharedCanvasViewportRenderer,
  canvas: Pick<HTMLCanvasElement, "width" | "height">,
  viewport: THREE.Vector2
): void => {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  if (viewport.x === width && viewport.y === height) return;
  viewport.set(width, height);
  renderer.setViewport(0, 0, width, height);
};

/**
 * Three.js does not track `gl.depthRange`. MapLibre intentionally compresses
 * the main 3D depth range to leave room for later style layers, but that range
 * must not leak into Three's offscreen shadow maps: their lookup coordinates
 * are always normalized to [0, 1]. Route offscreen targets to the canonical
 * range while preserving MapLibre's range for the shared main framebuffer.
 */
export const installRenderTargetDepthRangeBridge = (
  renderer: Pick<THREE.WebGLRenderer, "setRenderTarget"> & {
    state?: Pick<THREE.WebGLRenderer["state"], "bindFramebuffer">;
  },
  gl: Pick<
    WebGLRenderingContext,
    | "depthRange"
    | "getParameter"
    | "bindFramebuffer"
    | "FRAMEBUFFER"
    | "FRAMEBUFFER_BINDING"
  >
): RenderTargetDepthRangeBridge => {
  const originalSetRenderTarget = renderer.setRenderTarget;
  let activeContext: {
    depthRange: DepthRange;
    framebuffer: WebGLFramebuffer | null;
  } | null = null;
  const bindHostFramebuffer = (framebuffer: WebGLFramebuffer | null) => {
    // Keep Three's framebuffer cache in sync; a raw GL bind alone lets its next
    // setRenderTarget(null) incorrectly skip rebinding the browser framebuffer.
    if (renderer.state) {
      renderer.state.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    }
  };

  renderer.setRenderTarget = function (...args) {
    originalSetRenderTarget.apply(renderer, args);
    if (!activeContext) return;
    if (args[0] === null) {
      // Restore immediately, not only at the outer callback's end: the next
      // draw is already a main-scene pass (e.g. after a hard corridor capture).
      bindHostFramebuffer(activeContext.framebuffer);
      gl.depthRange(...activeContext.depthRange);
    } else {
      gl.depthRange(0, 1);
    }
  };

  return {
    render(depthRange, callback) {
      // MapLibre may render custom layers into an internal framebuffer. Three
      // does not know about it and setRenderTarget(null) binds the browser's
      // default framebuffer after an offscreen shadow/accumulation pass.
      const hostFramebuffer = gl.getParameter(
        gl.FRAMEBUFFER_BINDING
      ) as WebGLFramebuffer | null;
      const previousContext = activeContext;
      activeContext = { depthRange, framebuffer: hostFramebuffer };
      try {
        callback();
      } finally {
        activeContext = previousContext;
        bindHostFramebuffer(hostFramebuffer);
        gl.depthRange(depthRange[0], depthRange[1]);
      }
    },
    dispose() {
      activeContext = null;
      renderer.setRenderTarget = originalSetRenderTarget;
    },
  };
};
