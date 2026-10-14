import {
  AlwaysStencilFunc,
  EqualStencilFunc,
  KeepStencilOp,
  ReplaceStencilOp,
  type Material,
  type Mesh,
  type WebGLRenderer,
} from "three";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";

const MASK_BIT = 0x80;
const stencilKeys = [
  "stencilWrite",
  "stencilWriteMask",
  "stencilRef",
  "stencilFunc",
  "stencilFuncMask",
  "stencilFail",
  "stencilZFail",
  "stencilZPass",
] as const;
const scopes = new WeakMap<MapLibreAnnotationScene, MapLibreSceneHaloMask>();

/** Use the disc's own depth-tested fragments, including its hole, as the mask.
 * MapLibre owns all stencil bits: borrow one only during this overlay draw.
 */
class MapLibreSceneHaloMask {
  private halos = new Set<Material>();
  private discs = new Set<Mesh>();
  private gl: WebGL2RenderingContext | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private buffer: WebGLRenderbuffer | null = null;
  private storageKey = "";

  trackHalo(material: Material) {
    this.halos.add(material);
    const remove = () => {
      this.halos.delete(material);
      material.removeEventListener("dispose", remove);
    };
    material.addEventListener("dispose", remove);
  }

  trackDisc(mesh: Mesh) {
    this.discs.add(mesh);
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const remove = () => {
      this.discs.delete(mesh);
      for (const material of materials)
        material.removeEventListener("dispose", remove);
    };
    for (const material of materials)
      material.addEventListener("dispose", remove);
  }

  render(renderer: WebGLRenderer, draw: () => void) {
    const visibleDiscs = [...this.discs].filter((mesh) => {
      for (
        let object = mesh as Mesh | null;
        object;
        object = object.parent as Mesh | null
      )
        if (!object.visible) return false;
      return (
        !Array.isArray(mesh.material) &&
        mesh.material.visible &&
        mesh.material.opacity > 0
      );
    });
    if (!visibleDiscs.length || !this.halos.size) return draw();
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (
      !gl.blitFramebuffer ||
      gl.isContextLost() ||
      gl.getParameter(gl.STENCIL_BITS) < 8
    )
      return draw();
    const samples = gl.getParameter(gl.SAMPLES) as number;
    if (samples > 0) return draw();
    const target = renderer.getRenderTarget();
    const width = target?.width ?? gl.drawingBufferWidth;
    const height = target?.height ?? gl.drawingBufferHeight;
    if (!width || !height) return draw();
    const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const destination = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    const renderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);
    const scissor = gl.isEnabled(gl.SCISSOR_TEST);
    const stencil = gl.isEnabled(gl.STENCIL_TEST);
    const clear = gl.getParameter(gl.STENCIL_CLEAR_VALUE);
    const front = [
      gl.STENCIL_FUNC,
      gl.STENCIL_REF,
      gl.STENCIL_VALUE_MASK,
      gl.STENCIL_FAIL,
      gl.STENCIL_PASS_DEPTH_FAIL,
      gl.STENCIL_PASS_DEPTH_PASS,
      gl.STENCIL_WRITEMASK,
    ].map((parameter) => gl.getParameter(parameter));
    const back = [
      gl.STENCIL_BACK_FUNC,
      gl.STENCIL_BACK_REF,
      gl.STENCIL_BACK_VALUE_MASK,
      gl.STENCIL_BACK_FAIL,
      gl.STENCIL_BACK_PASS_DEPTH_FAIL,
      gl.STENCIL_BACK_PASS_DEPTH_PASS,
      gl.STENCIL_BACK_WRITEMASK,
    ].map((parameter) => gl.getParameter(parameter));
    const restoreBindings = () => {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destination);
      gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
      if (scissor) gl.enable(gl.SCISSOR_TEST);
      else gl.disable(gl.SCISSOR_TEST);
    };
    const saved = new Map<
      Material,
      Pick<Material, (typeof stencilKeys)[number]>
    >();
    let backedUp = false;
    try {
      if (this.gl !== gl) {
        this.disposeBuffers();
        this.gl = gl;
      }
      if (this.framebuffer && !gl.isFramebuffer(this.framebuffer)) {
        this.framebuffer = null;
        this.buffer = null;
        this.storageKey = "";
      }
      this.framebuffer ??= gl.createFramebuffer();
      this.buffer ??= gl.createRenderbuffer();
      if (!this.framebuffer || !this.buffer) return draw();
      const format =
        gl.getParameter(gl.DEPTH_BITS) > 24
          ? gl.DEPTH32F_STENCIL8
          : gl.DEPTH24_STENCIL8;
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.buffer);
      const storageKey = `${width}:${height}:${samples}:${format}`;
      if (storageKey !== this.storageKey) {
        gl.renderbufferStorage(gl.RENDERBUFFER, format, width, height);
        this.storageKey = storageKey;
      }
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer);
      gl.framebufferRenderbuffer(
        gl.DRAW_FRAMEBUFFER,
        gl.DEPTH_STENCIL_ATTACHMENT,
        gl.RENDERBUFFER,
        this.buffer
      );
      gl.drawBuffers([gl.NONE]);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
      gl.readBuffer(gl.NONE);
      if (
        gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !==
        gl.FRAMEBUFFER_COMPLETE
      ) {
        restoreBindings();
        return draw();
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, destination);
      gl.blitFramebuffer(
        0,
        0,
        width,
        height,
        0,
        0,
        width,
        height,
        gl.STENCIL_BUFFER_BIT,
        gl.NEAREST
      );
      backedUp = true;
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destination);
      gl.stencilMask(MASK_BIT);
      gl.clearStencil(0);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      restoreBindings();
      const configure = (material: Material, disc: boolean) => {
        if (saved.has(material)) return;
        saved.set(
          material,
          Object.fromEntries(
            stencilKeys.map((key) => [key, material[key]])
          ) as Pick<Material, (typeof stencilKeys)[number]>
        );
        material.stencilWrite = true;
        material.stencilWriteMask = disc ? MASK_BIT : 0;
        material.stencilRef = disc ? MASK_BIT : 0;
        material.stencilFunc = disc ? AlwaysStencilFunc : EqualStencilFunc;
        material.stencilFuncMask = MASK_BIT;
        material.stencilFail = KeepStencilOp;
        material.stencilZFail = KeepStencilOp;
        material.stencilZPass = disc ? ReplaceStencilOp : KeepStencilOp;
      };
      for (const mesh of visibleDiscs)
        configure(mesh.material as Material, true);
      for (const material of this.halos) configure(material, false);
      renderer.state.buffers.stencil.reset();
      draw();
    } finally {
      for (const [material, properties] of saved)
        Object.assign(material, properties);
      if (backedUp) {
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destination);
        gl.blitFramebuffer(
          0,
          0,
          width,
          height,
          0,
          0,
          width,
          height,
          gl.STENCIL_BUFFER_BIT,
          gl.NEAREST
        );
      }
      gl.stencilFuncSeparate(gl.FRONT, front[0], front[1], front[2]);
      gl.stencilOpSeparate(gl.FRONT, front[3], front[4], front[5]);
      gl.stencilMaskSeparate(gl.FRONT, front[6]);
      gl.stencilFuncSeparate(gl.BACK, back[0], back[1], back[2]);
      gl.stencilOpSeparate(gl.BACK, back[3], back[4], back[5]);
      gl.stencilMaskSeparate(gl.BACK, back[6]);
      gl.clearStencil(clear);
      renderer.state.buffers.stencil.setTest(stencil);
      if (stencil) gl.enable(gl.STENCIL_TEST);
      else gl.disable(gl.STENCIL_TEST);
      restoreBindings();
      renderer.state.buffers.stencil.reset();
    }
  }

  private disposeBuffers() {
    if (this.gl) {
      this.gl.deleteFramebuffer(this.framebuffer);
      this.gl.deleteRenderbuffer(this.buffer);
    }
    this.framebuffer = null;
    this.buffer = null;
    this.storageKey = "";
  }

  dispose() {
    this.disposeBuffers();
    this.halos.clear();
    this.discs.clear();
  }
}

export const getMapLibreSceneHaloMask = (scene: MapLibreAnnotationScene) => {
  let scope = scopes.get(scene);
  if (!scope) scopes.set(scene, (scope = new MapLibreSceneHaloMask()));
  return scope;
};

export const disposeMapLibreSceneHaloMask = (
  scene: MapLibreAnnotationScene
) => {
  scopes.get(scene)?.dispose();
  scopes.delete(scene);
};
