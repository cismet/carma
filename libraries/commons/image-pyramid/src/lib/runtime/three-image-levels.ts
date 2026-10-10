import * as THREE from "three";
import type { DevicePixels } from "@carma-units";
import {
  imageTileKey,
  imageTileRect,
  levelToNative,
  missingNeighbors,
  tileRangeFor,
  type ImageRect,
} from "../core/image-level-plan";
import type { ImageLevelStack } from "./image-level-stack";

/** Host state supplied explicitly by an embedding renderer; no host dependency. */
export type ImageLevelsHostRenderState = Readonly<{
  framebuffer: WebGLFramebuffer | null;
  depthRange: readonly [number, number];
}>;

export type ImageLevelsTexture = Readonly<{
  texture: THREE.Texture;
  /** Native image rectangle covered by texture UV 0..1; v = 1 is the top row. */
  rect: ImageRect;
  /** Changes whenever the texture content changes. */
  revision: number;
}>;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec2 uvScale;
uniform vec4 feather;
varying vec2 vUv;
void main() {
  // Bitmaps upload top row first; t.y runs from the tile's top to bottom.
  vec2 t = vec2(vUv.x, 1.0 - vUv.y);
  vec4 color = texture2D(map, t * uvScale);
  float alpha = 1.0;
  if (feather.x > 0.0) alpha *= smoothstep(0.0, feather.x, t.x);
  if (feather.y > 0.0) alpha *= smoothstep(0.0, feather.y, 1.0 - t.x);
  if (feather.z > 0.0) alpha *= smoothstep(0.0, feather.z, t.y);
  if (feather.w > 0.0) alpha *= smoothstep(0.0, feather.w, 1.0 - t.y);
  gl_FragColor = vec4(color.rgb, alpha);
  #include <colorspace_fragment>
}`;
const CAPACITY_STEP = 256;

/** Mipmaps only where minification aliases; they would soften levels drawn at 0.5..1. */
const tileTexture = (bitmap: ImageBitmap, mipmaps: boolean) => {
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = mipmaps
    ? THREE.LinearMipmapLinearFilter
    : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = mipmaps;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
};

/**
 * Same-frame GPU composition of resident pyramid tiles into a render target or
 * the current framebuffer. Coarser levels are drawn first; missing tiles stay
 * transparent so the level below shows through. No pixels are read back.
 */
export class ThreeImageLevels {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly meshes: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >[] = [];
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly targets: THREE.WebGLRenderTarget[] = [];
  private current = 0;
  private revision = 0;
  private dirty = true;
  private lastKey = "";
  private stack: ImageLevelStack | null = null;
  private unsubscribe: (() => void)[] = [];
  private readonly previousViewport = new THREE.Vector4();
  private readonly previousScissor = new THREE.Vector4();
  private readonly previousClearColor = new THREE.Color();

  /** Fade tile edges whose same-level neighbor is still missing, in output pixels; 0 disables. */
  featherPx = 0;

  /** Bind one image; evicted tiles release their GPU copies immediately. */
  attach(stack: ImageLevelStack | null) {
    if (stack === this.stack) return;
    this.unsubscribe.forEach((stop) => stop());
    this.unsubscribe = [];
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
    this.stack = stack;
    this.dirty = true;
    if (!stack) return;
    this.unsubscribe = [
      stack.onContentChange(() => {
        this.dirty = true;
      }),
      stack.onEvict((key) => {
        this.textures.get(key)?.dispose();
        this.textures.delete(key);
        this.dirty = true;
      }),
    ];
  }

  /**
   * Compose into a ping-pong render target covering at least `rect` at `size`
   * output pixels. Returns the previous result unchanged when nothing changed,
   * so consumers that key on texture identity see every content change.
   */
  renderToTarget(
    renderer: THREE.WebGLRenderer,
    rect: ImageRect,
    size: Readonly<{ width: number; height: number }>,
    hostRenderState?: ImageLevelsHostRenderState
  ): ImageLevelsTexture | null {
    if (!this.stack?.plan || size.width < 1 || size.height < 1) return null;
    const max = renderer.capabilities.maxTextureSize;
    const width = Math.min(
      max,
      Math.ceil(size.width / CAPACITY_STEP) * CAPACITY_STEP
    );
    const height = Math.min(
      max,
      Math.ceil(size.height / CAPACITY_STEP) * CAPACITY_STEP
    );
    const covered: ImageRect = {
      x: rect.x,
      y: rect.y,
      width: ((rect.width * width) /
        Math.min(size.width, width)) as DevicePixels,
      height: ((rect.height * height) /
        Math.min(size.height, height)) as DevicePixels,
    };
    const key = `${covered.x},${covered.y},${covered.width},${covered.height},${width},${height}`;
    const existing = this.targets[this.current];
    if (!this.dirty && key === this.lastKey && existing)
      return {
        texture: existing.texture,
        rect: covered,
        revision: this.revision,
      };
    const next = (this.current + 1) % 2;
    let target = this.targets[next];
    if (!target) {
      target = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: false,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
      target.texture.colorSpace = THREE.SRGBColorSpace;
      this.targets[next] = target;
    } else if (target.width !== width || target.height !== height)
      target.setSize(width, height);
    this.draw(renderer, covered, { width, height }, target, hostRenderState);
    this.current = next;
    this.lastKey = key;
    this.dirty = false;
    this.revision++;
    return { texture: target.texture, rect: covered, revision: this.revision };
  }

  /** Compose straight into the bound framebuffer, e.g. a standalone viewer canvas. */
  renderToScreen(
    renderer: THREE.WebGLRenderer,
    rect: ImageRect,
    size: Readonly<{ width: number; height: number }>
  ) {
    if (!this.stack?.plan) return;
    this.draw(renderer, rect, size, null);
    this.dirty = false;
  }

  dispose() {
    this.attach(null);
    this.meshes.forEach((mesh) => mesh.material.dispose());
    this.meshes.length = 0;
    this.geometry.dispose();
    this.targets.forEach((target) => target.dispose());
    this.targets.length = 0;
  }

  private draw(
    renderer: THREE.WebGLRenderer,
    rect: ImageRect,
    size: Readonly<{ width: number; height: number }>,
    target: THREE.WebGLRenderTarget | null,
    hostRenderState?: ImageLevelsHostRenderState
  ) {
    const count = this.layout(rect, size);
    this.camera.left = rect.x;
    this.camera.right = rect.x + rect.width;
    this.camera.top = -rect.y;
    this.camera.bottom = -(rect.y + rect.height);
    this.camera.updateProjectionMatrix();
    const gl = renderer.getContext();
    const previousTarget = renderer.getRenderTarget();
    const hostFramebuffer = hostRenderState
      ? hostRenderState.framebuffer
      : (gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null);
    const hostDepthRange = hostRenderState
      ? previousTarget
        ? [0, 1]
        : hostRenderState.depthRange
      : (gl.getParameter(gl.DEPTH_RANGE) as Float32Array);
    renderer.getViewport(this.previousViewport);
    renderer.getScissor(this.previousScissor);
    const previousScissorTest = renderer.getScissorTest();
    renderer.getClearColor(this.previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    try {
      renderer.resetState();
      renderer.setRenderTarget(target);
      renderer.setViewport(0, 0, size.width, size.height);
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = false;
      gl.depthRange(0, 1);
      renderer.clear(true, false, false);
      if (count) renderer.render(this.scene, this.camera);
    } finally {
      renderer.autoClear = previousAutoClear;
      renderer.resetState();
      renderer.setViewport(this.previousViewport);
      renderer.setScissor(this.previousScissor);
      renderer.setRenderTarget(previousTarget);
      renderer.setScissorTest(previousScissorTest);
      renderer.setClearColor(this.previousClearColor, previousClearAlpha);
      if (!previousTarget) {
        if (renderer.state)
          renderer.state.bindFramebuffer(gl.FRAMEBUFFER, hostFramebuffer);
        else gl.bindFramebuffer(gl.FRAMEBUFFER, hostFramebuffer);
      }
      gl.depthRange(hostDepthRange[0], hostDepthRange[1]);
    }
  }

  /** Place one quad per resident tile in view, bottom level first. */
  private layout(
    rect: ImageRect,
    size: Readonly<{ width: number; height: number }>
  ) {
    const stack = this.stack!,
      plan = stack.plan!,
      pyramid = stack.pyramid!;
    const feather = this.featherPx;
    const pixelsPerNative = size.width / rect.width;
    let used = 0;
    plan.layers.forEach((index, layer) => {
      const level = pyramid.levels.find(
        (candidate) => candidate.level === index
      );
      if (!level) return;
      // Below half size bilinear sampling skips texels and aliases. Only a
      // thumbnail's floor gets there, so re-uploading its few tiles is cheap.
      const mipmaps =
        pixelsPerNative * levelToNative(level, pyramid.native).x < 0.5;
      const range = tileRangeFor(level, pyramid.native, rect);
      const resident = (col: number, row: number) =>
        stack.isResident(index, col, row);
      for (let row = range.row0; row < range.row1; row++)
        for (let col = range.col0; col < range.col1; col++) {
          const bitmap = stack.tile(index, col, row);
          if (!bitmap) continue;
          const key = imageTileKey(index, col, row);
          let texture = this.textures.get(key);
          if (!texture || texture.generateMipmaps !== mipmaps) {
            texture?.dispose();
            texture = tileTexture(bitmap, mipmaps);
            this.textures.set(key, texture);
          }
          const tileRect = imageTileRect(level, pyramid.native, col, row);
          const mesh = this.mesh(used++);
          mesh.position.set(
            tileRect.x + tileRect.width / 2,
            -(tileRect.y + tileRect.height / 2),
            0
          );
          mesh.scale.set(tileRect.width, tileRect.height, 1);
          mesh.renderOrder = used;
          const uniforms = mesh.material.uniforms;
          uniforms.map.value = texture;
          (uniforms.uvScale.value as THREE.Vector2).set(
            Math.min(bitmap.width, level.width - col * level.tileWidth) /
              bitmap.width,
            Math.min(bitmap.height, level.height - row * level.tileHeight) /
              bitmap.height
          );
          const mask =
            feather > 0 && layer > 0
              ? missingNeighbors(level, col, row, resident)
              : 0;
          const fx = Math.min(
            0.5,
            feather / Math.max(1, tileRect.width * pixelsPerNative)
          );
          const fy = Math.min(
            0.5,
            feather / Math.max(1, tileRect.height * pixelsPerNative)
          );
          (uniforms.feather.value as THREE.Vector4).set(
            mask & 1 ? fx : 0,
            mask & 2 ? fx : 0,
            mask & 4 ? fy : 0,
            mask & 8 ? fy : 0
          );
          mesh.visible = true;
        }
    });
    for (let i = used; i < this.meshes.length; i++)
      this.meshes[i].visible = false;
    return used;
  }

  private mesh(index: number) {
    let mesh = this.meshes[index];
    if (!mesh) {
      mesh = new THREE.Mesh(
        this.geometry,
        new THREE.ShaderMaterial({
          uniforms: {
            map: { value: null },
            uvScale: { value: new THREE.Vector2(1, 1) },
            feather: { value: new THREE.Vector4() },
          },
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        })
      );
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.scene.add(mesh);
    }
    return mesh;
  }
}
