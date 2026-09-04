import * as THREE from "three";

import type { SharedThreeSceneLayer } from "./shared-three-scene-layer";

export type SharedThreeSceneCameraPreview = Readonly<{
  render: (
    camera: THREE.Camera,
    width: number,
    height: number,
    onFrame: (pixels: Uint8Array, width: number, height: number) => void
  ) => boolean;
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
  const previousViewport = new THREE.Vector4();
  const previousScissor = new THREE.Vector4();
  const previousClearColor = new THREE.Color();

  const ensureTarget = (width: number, height: number) => {
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
    if (pixels.length !== pixelCount) pixels = new Uint8Array(pixelCount);
  };

  return {
    render(camera, requestedWidth, requestedHeight, onFrame) {
      const renderer = layer.getRenderer();
      if (!renderer) return false;
      const width = Math.max(1, Math.floor(requestedWidth));
      const height = Math.max(1, Math.floor(requestedHeight));
      ensureTarget(width, height);
      if (!target) return false;

      const gl = renderer.getContext();
      const hostFramebuffer = gl.getParameter(
        gl.FRAMEBUFFER_BINDING
      ) as WebGLFramebuffer | null;
      const hostDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      const previousTarget = renderer.getRenderTarget();
      renderer.getViewport(previousViewport);
      renderer.getScissor(previousScissor);
      const previousScissorTest = renderer.getScissorTest();
      renderer.getClearColor(previousClearColor);
      const previousClearAlpha = renderer.getClearAlpha();

      try {
        renderer.resetState();
        renderer.setRenderTarget(target);
        renderer.setViewport(0, 0, width, height);
        renderer.setScissorTest(false);
        renderer.setClearColor(0x0f172a, 1);
        gl.depthRange(0, 1);
        renderer.clear(true, true, false);
        renderer.render(layer.getScene(), camera);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        onFrame(pixels, width, height);
        return true;
      } finally {
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
    dispose() {
      target?.dispose();
      target = null;
      pixels = new Uint8Array(0);
    },
  };
};
