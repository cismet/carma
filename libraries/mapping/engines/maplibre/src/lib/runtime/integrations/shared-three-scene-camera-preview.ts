import * as THREE from "three";

import type { SharedThreeSceneLayer } from "../../core/shared-three-scene-types";

export type SharedThreeSceneCameraPreview = Readonly<{
  /** Shared-canvas CSS region; element is also the clipping boundary. */
  renderViewport: (
    camera: THREE.Camera | null,
    element: HTMLElement,
    region?: Readonly<{ x: number; y: number; width: number; height: number }>,
    clippingPlanes?: readonly THREE.Plane[]
  ) => boolean;
  /** Embedded: scissored screen pass. Detached document: bounded async transport. */
  present: (
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ) => Promise<boolean>;
  renderTexture: (
    camera: THREE.Camera,
    width: number,
    height: number,
    clippingPlanes?: readonly THREE.Plane[]
  ) => THREE.Texture | null;
  render: (
    camera: THREE.Camera,
    width: number,
    height: number,
    onFrame?: (pixels: Uint8Array, width: number, height: number) => void,
    clippingPlanes?: readonly THREE.Plane[]
  ) => boolean;
  renderAsync: (
    camera: THREE.Camera,
    width: number,
    height: number,
    onFrame: (pixels: Uint8Array, width: number, height: number) => void,
    clippingPlanes?: readonly THREE.Plane[]
  ) => Promise<boolean>;
  dispose: () => void;
}>;

/**
 * Render a diagnostic camera with the mounted shared renderer and scene.
 * The render target keeps the preview off MapLibre's framebuffer while the
 * explicit state restoration leaves the host renderer untouched.
 */
export const createSharedThreeSceneCameraPreview = (
  layer: SharedThreeSceneLayer
): SharedThreeSceneCameraPreview => {
  let target: THREE.WebGLRenderTarget | null = null;
  let pixels = new Uint8Array(0);
  let asyncReadbackPending = false;
  let disposed = false;
  const previousViewport = new THREE.Vector4();
  const previousScissor = new THREE.Vector4();
  const previousClearColor = new THREE.Color();
  let screenView: { camera: THREE.Camera; element: HTMLElement } | null = null;
  let removeScreenPass: (() => void) | null = null;
  let presentationPending = false;

  const ensureTarget = (width: number, height: number, readback = true) => {
    if (!target) {
      target = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: false,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });
      target.texture.colorSpace = THREE.SRGBColorSpace;
    } else if (target.width !== width || target.height !== height) {
      target.setSize(width, height);
    }
    const pixelCount = width * height * 4;
    if (readback && pixels.length !== pixelCount)
      pixels = new Uint8Array(pixelCount);
  };

  const getDimensions = (
    renderer: THREE.WebGLRenderer,
    requestedWidth: number,
    requestedHeight: number
  ): readonly [number, number] | null => {
    if (
      !Number.isFinite(requestedWidth) ||
      !Number.isFinite(requestedHeight) ||
      requestedWidth <= 0 ||
      requestedHeight <= 0
    ) {
      return null;
    }

    const width = Math.max(1, Math.floor(requestedWidth));
    const height = Math.max(1, Math.floor(requestedHeight));
    const maxTextureSize = renderer.capabilities?.maxTextureSize;
    if (
      Number.isFinite(maxTextureSize) &&
      maxTextureSize > 0 &&
      (width > maxTextureSize || height > maxTextureSize)
    ) {
      return null;
    }
    return [width, height];
  };

  const preview: SharedThreeSceneCameraPreview = {
    renderViewport(camera, element, region, clippingPlanes = []) {
      const renderer = layer.getRenderer();
      if (!renderer || disposed || !element.isConnected) return false;
      const canvas = renderer.domElement;
      if (canvas.ownerDocument !== element.ownerDocument) return false;
      const host = canvas.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      if (!host.width || !host.height || !bounds.width || !bounds.height)
        return false;
      const rect = region ?? {
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height,
      };
      const left = bounds.left + rect.x,
        top = bounds.top + rect.y;
      const right = left + rect.width,
        bottom = top + rect.height;
      const clipLeft = Math.max(host.left, bounds.left, left);
      const clipTop = Math.max(host.top, bounds.top, top);
      const clipRight = Math.min(host.right, bounds.right, right);
      const clipBottom = Math.min(host.bottom, bounds.bottom, bottom);
      if (clipRight <= clipLeft || clipBottom <= clipTop) return false;
      // Decision: SHARED-CANVAS-VIEWS-20260916 in README.md. Keep the full
      // viewport projection when partially clipped; scissor only trims pixels.
      const ratio = renderer.getPixelRatio();
      const sx = canvas.width / host.width / ratio;
      const sy = canvas.height / host.height / ratio;
      // Round shared edges, not independent widths, to avoid one-pixel seams.
      const vx = Math.round((left - host.left) * sx * ratio) / ratio;
      const vy = Math.round((host.bottom - bottom) * sy * ratio) / ratio;
      const vr = Math.round((right - host.left) * sx * ratio) / ratio;
      const vt = Math.round((host.bottom - top) * sy * ratio) / ratio;
      const cx = Math.round((clipLeft - host.left) * sx * ratio) / ratio;
      const cy = Math.round((host.bottom - clipBottom) * sy * ratio) / ratio;
      const cr = Math.round((clipRight - host.left) * sx * ratio) / ratio;
      const ct = Math.round((host.bottom - clipTop) * sy * ratio) / ratio;
      const gl = renderer.getContext();
      const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const depthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      const target = renderer.getRenderTarget();
      const planes = renderer.clippingPlanes;
      const autoClear = renderer.autoClear;
      renderer.getViewport(previousViewport);
      renderer.getScissor(previousScissor);
      const scissorTest = renderer.getScissorTest();
      renderer.getClearColor(previousClearColor);
      const alpha = renderer.getClearAlpha();
      try {
        renderer.resetState();
        renderer.setRenderTarget(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        renderer.setViewport(vx, vy, vr - vx, vt - vy);
        renderer.setScissor(cx, cy, cr - cx, ct - cy);
        renderer.setScissorTest(true);
        renderer.setClearColor(0x0f172a, 1);
        renderer.clippingPlanes = [...clippingPlanes];
        renderer.autoClear = false;
        gl.depthRange(0, 1);
        renderer.clear(true, true, false);
        if (camera) renderer.render(layer.getScene(), camera);
        return true;
      } finally {
        renderer.clippingPlanes = planes;
        renderer.autoClear = autoClear;
        renderer.setRenderTarget(target);
        renderer.setViewport(previousViewport);
        renderer.setScissor(previousScissor);
        renderer.setScissorTest(scissorTest);
        renderer.setClearColor(previousClearColor, alpha);
        renderer.resetState();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.depthRange(depthRange[0], depthRange[1]);
      }
    },
    async present(camera, canvas, width, height) {
      if (disposed || presentationPending || asyncReadbackPending) return false;
      const host = layer.getRenderer()?.domElement;
      if (!host) return false;
      if (host.ownerDocument === canvas.ownerDocument) {
        target?.dispose();
        target = null;
        pixels = new Uint8Array(0);
        screenView = { camera, element: canvas };
        if (!removeScreenPass)
          removeScreenPass = layer.addScreenRenderPass(() => {
            if (screenView)
              preview.renderViewport(screenView.camera, screenView.element);
          });
        canvas.style.visibility = "hidden";
        layer.requestScreenRender();
        return true;
      }
      screenView = null;
      canvas.style.visibility = "visible";
      presentationPending = true;
      try {
        // An adopted popup canvas cannot be a region of the opener's GL canvas.
        let pixels: Uint8Array | null = null;
        const rendered = await preview.renderAsync(
          camera,
          width,
          height,
          (value) => {
            pixels = value;
          }
        );
        if (rendered && pixels && !disposed) {
          await new Promise<void>((resolve) => {
            // Keep presentation on the opener's clock; disposal never leaves a promise waiting.
            requestAnimationFrame(() => {
              if (!disposed && canvas.ownerDocument !== host.ownerDocument) {
                if (canvas.width !== width) canvas.width = width;
                if (canvas.height !== height) canvas.height = height;
                canvas
                  .getContext("2d")
                  ?.putImageData(
                    new ImageData(
                      new Uint8ClampedArray(
                        pixels!.buffer,
                        pixels!.byteOffset,
                        pixels!.byteLength
                      ),
                      width,
                      height
                    ),
                    0,
                    0
                  );
              }
              resolve();
            });
          });
        }
        return rendered;
      } finally {
        presentationPending = false;
      }
    },
    renderTexture(camera, width, height, planes) {
      return preview.render(camera, width, height, undefined, planes)
        ? target!.texture
        : null;
    },
    render(
      camera,
      requestedWidth,
      requestedHeight,
      onFrame,
      clippingPlanes = []
    ) {
      const renderer = layer.getRenderer();
      if (!renderer || disposed || asyncReadbackPending) return false;
      const dimensions = getDimensions(
        renderer,
        requestedWidth,
        requestedHeight
      );
      if (!dimensions) return false;
      const [width, height] = dimensions;
      ensureTarget(width, height, !!onFrame);
      if (!target) return false;

      const gl = renderer.getContext();
      const hostFramebuffer = gl.getParameter(
        gl.FRAMEBUFFER_BINDING
      ) as WebGLFramebuffer | null;
      const hostDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      const previousTarget = renderer.getRenderTarget();
      const previousClippingPlanes = renderer.clippingPlanes;
      renderer.getViewport(previousViewport);
      renderer.getScissor(previousScissor);
      const previousScissorTest = renderer.getScissorTest();
      renderer.getClearColor(previousClearColor);
      const previousClearAlpha = renderer.getClearAlpha();

      try {
        renderer.clippingPlanes = [...clippingPlanes];
        renderer.resetState();
        renderer.setRenderTarget(target);
        renderer.setViewport(0, 0, width, height);
        renderer.setScissorTest(false);
        renderer.setClearColor(0x0f172a, 1);
        gl.depthRange(0, 1);
        renderer.clear(true, true, false);
        renderer.render(layer.getScene(), camera);
        if (onFrame) {
          renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
          onFrame(pixels, width, height);
        }
        return true;
      } finally {
        renderer.clippingPlanes = previousClippingPlanes;
        renderer.setRenderTarget(previousTarget);
        renderer.setViewport(previousViewport);
        renderer.setScissor(previousScissor);
        renderer.setScissorTest(previousScissorTest);
        renderer.setClearColor(previousClearColor, previousClearAlpha);
        renderer.resetState();
        gl.bindFramebuffer(gl.FRAMEBUFFER, hostFramebuffer);
        gl.depthRange(hostDepthRange[0], hostDepthRange[1]);
      }
    },
    async renderAsync(
      camera,
      requestedWidth,
      requestedHeight,
      onFrame,
      clippingPlanes = []
    ) {
      const renderer = layer.getRenderer();
      if (!renderer || disposed || asyncReadbackPending) return false;
      const dimensions = getDimensions(
        renderer,
        requestedWidth,
        requestedHeight
      );
      if (!dimensions) return false;
      const [width, height] = dimensions;
      ensureTarget(width, height);
      if (!target) return false;

      asyncReadbackPending = true;
      const activeTarget = target;
      const activePixels = pixels;
      const gl = renderer.getContext();
      const hostFramebuffer = gl.getParameter(
        gl.FRAMEBUFFER_BINDING
      ) as WebGLFramebuffer | null;
      // Pixel-pack buffers exist only in WebGL2; this readback path is gated
      // on a WebGL2 context, so name it rather than widening the union.
      const gl2 = gl as WebGL2RenderingContext;
      const hostPixelPackBuffer = gl2.getParameter(
        gl2.PIXEL_PACK_BUFFER_BINDING
      ) as WebGLBuffer | null;
      const hostDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      const previousTarget = renderer.getRenderTarget();
      renderer.getViewport(previousViewport);
      renderer.getScissor(previousScissor);
      const previousScissorTest = renderer.getScissorTest();
      renderer.getClearColor(previousClearColor);
      const previousClearAlpha = renderer.getClearAlpha();
      const previousClippingPlanes = renderer.clippingPlanes;
      let readback: Promise<THREE.TypedArray>;

      try {
        try {
          renderer.clippingPlanes = [...clippingPlanes];
          renderer.resetState();
          renderer.setRenderTarget(activeTarget);
          renderer.setViewport(0, 0, width, height);
          renderer.setScissorTest(false);
          renderer.setClearColor(0x0f172a, 1);
          gl.depthRange(0, 1);
          renderer.clear(true, true, false);
          renderer.render(layer.getScene(), camera);
          readback = renderer.readRenderTargetPixelsAsync(
            activeTarget,
            0,
            0,
            width,
            height,
            activePixels
          );
        } finally {
          renderer.clippingPlanes = previousClippingPlanes;
          renderer.setRenderTarget(previousTarget);
          renderer.setViewport(previousViewport);
          renderer.setScissor(previousScissor);
          renderer.setScissorTest(previousScissorTest);
          renderer.setClearColor(previousClearColor, previousClearAlpha);
          renderer.resetState();
          gl.bindFramebuffer(gl.FRAMEBUFFER, hostFramebuffer);
          gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, hostPixelPackBuffer);
          gl.depthRange(hostDepthRange[0], hostDepthRange[1]);
        }

        await readback;
        if (!disposed) onFrame(activePixels, width, height);
        return true;
      } finally {
        asyncReadbackPending = false;
        if (disposed) {
          activeTarget.dispose();
          if (target === activeTarget) target = null;
          pixels = new Uint8Array(0);
        }
      }
    },
    dispose() {
      removeScreenPass?.();
      screenView = null;
      disposed = true;
      if (!asyncReadbackPending) {
        target?.dispose();
        target = null;
        pixels = new Uint8Array(0);
      }
    },
  };
  return preview;
};
