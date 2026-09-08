import * as THREE from "three";

import {
  DEFAULT_SCENE_ACCUMULATION_OPTIONS,
  resolveSceneAccumulationFormat,
  type SceneAccumulationOptions,
} from "@carma-mapping/engines/three/primitives/rendering";

import type {
  ShadowAccumulationPage,
  TiledShadowRenderer,
} from "./tiled-shadow-renderer";
import { ShadowCorridorPresentation } from "./shadow-corridor-presentation";

const MAX_PAGES = 64;
const MAX_ATLAS_BYTES = 512 * 1024 ** 2;

export const SHADOW_CORRIDOR_FALLBACK_REASONS = {
  inactive: "inactive",
  dimensions: "dimensions",
  budget: "budget",
  msaa: "msaa",
  format: "format",
  receivers: "receivers",
  pages: "pages",
  renderer: "renderer",
  disposed: "disposed",
} as const;

export type ShadowCorridorFallbackReason =
  (typeof SHADOW_CORRIDOR_FALLBACK_REASONS)[keyof typeof SHADOW_CORRIDOR_FALLBACK_REASONS];

const VERTEX = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLEND_FRAGMENT = /* glsl */ `
  layout(location = 0) out highp vec4 outColor;
  in vec2 vUv;
  uniform sampler2D tPrevious;
  uniform sampler2D tReference;
  uniform sampler2D tReferenceDepth;
  uniform sampler2D tSample;
  uniform sampler2D tSampleDepth;
  uniform mat4 uInverseViewProjection;
  uniform vec4 uBounds[${MAX_PAGES}];
  uniform int uBoundsCount;
  uniform bool uRefresh;
  uniform bool uResetAll;
  uniform float uWeights[${MAX_PAGES}];
  void main() {
    vec4 reference = texture(tReference, vUv);
    float depth = texture(tReferenceDepth, vUv).r;
    if (uResetAll || depth >= 1.0) {
      outColor = reference;
      return;
    }
    vec4 position = uInverseViewProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec2 world = position.xz / position.w;
    bool owned = false;
    float weight = 0.0;
    for (int i = 0; i < ${MAX_PAGES}; i++) {
      if (i >= uBoundsCount) break;
      vec4 bounds = uBounds[i];
      if (world.x >= bounds.x && world.y >= bounds.y &&
        world.x < bounds.z && world.y < bounds.w) {
        owned = true;
        weight = uWeights[i];
        break;
      }
    }
    vec4 previous = texture(tPrevious, vUv);
    if (!owned) {
      outColor = previous;
    } else if (uRefresh) {
      outColor = reference;
    } else {
      float sampleDepth = texture(tSampleDepth, vUv).r;
      // Screen rectangles overlap. Only the camera's nearest actual surface
      // belongs to this update, never a hidden receiver from another page.
      outColor = abs(sampleDepth - depth) <= 0.000001
        ? mix(previous, texture(tSample, vUv), weight)
        : previous;
    }
  }
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>
  layout(location = 0) out highp vec4 outColor;
  in vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform bool uOutputDither;
  void main() {
    vec4 color = texture(tColor, vUv);
    if (color.a < 0.004) discard;
    #ifdef TONE_MAPPING
      color.rgb = toneMapping(color.rgb);
    #endif
    outColor = linearToOutputTexel(color);
    #ifdef DITHERING
      if (uOutputDither) outColor.rgb = dithering(outColor.rgb);
    #endif
    gl_FragDepth = texture(tDepth, vUv).r;
  }
`;

export type ShadowCorridorProgress = Readonly<{
  progress: number;
  settled: boolean;
  needsRepaint: boolean;
}>;

export type ShadowCorridorFrame = Readonly<{
  width: number;
  height: number;
  /** Includes camera pose/projection and every view-dependent material input. */
  viewKey: string;
  styleEpoch: string | number;
  samples: number;
  active: boolean;
  options?: SceneAccumulationOptions;
  /** Admission only: never scales the native colour or draped map pixels. */
  maxRenderTargetPixels?: number;
  /** Submission cap, independent of the total number of visible corridors. */
  maxPagesPerFrame?: number;
  /** CPU submission budget; not a claim about asynchronous GPU execution time. */
  maxFrameCpuMilliseconds?: number;
  isPageReady?: (id: string) => boolean;
  visibilityOnly?: boolean;
}>;

type PageProgress = {
  page: ShadowAccumulationPage;
  samples: number;
};

type PageRenderer = Pick<
  TiledShadowRenderer,
  | "accumulationPages"
  | "supportsOpaqueAccumulation"
  | "renderSample"
  | "renderPageSample"
>;

/** Camera-registered RGB refinement with independently invalidated corridors.
 * Replaces the global round counter only for the opaque tiled MSAA0 path.
 * Decision: native shared targets preserve MapLibre gl_FragCoord registration;
 * camera/style changes restart RGB, while world-fixed light depths stay owned
 * by TiledShadowRenderer. See three/TILED_SHADOW_PAGES.md, CORRIDOR-RGB-20260907.
 */
export class ShadowCorridorAccumulator {
  private readonly fullscreenScene = new THREE.Scene();
  private readonly fullscreenCamera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0,
    1
  );
  private readonly blendMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERTEX,
    fragmentShader: BLEND_FRAGMENT,
    uniforms: {
      tPrevious: { value: null },
      tReference: { value: null },
      tReferenceDepth: { value: null },
      tSample: { value: null },
      tSampleDepth: { value: null },
      uInverseViewProjection: { value: new THREE.Matrix4() },
      uBounds: {
        value: Array.from({ length: MAX_PAGES }, () => new THREE.Vector4()),
      },
      uBoundsCount: { value: 0 },
      uRefresh: { value: false },
      uResetAll: { value: false },
      uWeights: { value: new Float32Array(MAX_PAGES).fill(1) },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  private readonly compositeMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      uOutputDither: { value: false },
    },
    dithering: true,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: true,
    depthFunc: THREE.AlwaysDepth,
    depthWrite: true,
  });
  private readonly quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    this.blendMaterial
  );
  private referenceTarget: THREE.WebGLRenderTarget | null = null;
  private sampleTarget: THREE.WebGLRenderTarget | null = null;
  private readTarget: THREE.WebGLRenderTarget | null = null;
  private writeTarget: THREE.WebGLRenderTarget | null = null;
  private pages = new Map<string, PageProgress>();
  private stateKey = "";
  private targetKey = "";
  private cursor = 0;
  private totalSamples = 1;
  private broken = false;
  private disposed = false;
  private allocatedBytes = 0;
  private lastFallbackReason: ShadowCorridorFallbackReason | null = null;
  readonly presentation: ShadowCorridorPresentation;
  private readonly publishedStateKeys = new Map<string, string>();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.presentation = new ShadowCorridorPresentation(renderer);
    this.quad.frustumCulled = false;
    this.fullscreenScene.add(this.quad);
  }

  get pageProgress(): readonly Readonly<{
    id: string;
    samples: number;
    totalSamples: number;
  }>[] {
    return [...this.pages].map(([id, page]) => ({
      id,
      samples: page.samples,
      totalSamples: this.totalSamples,
    }));
  }

  get memoryBytes(): number {
    return this.allocatedBytes + this.presentation.memoryBytes;
  }

  get fallbackReason(): ShadowCorridorFallbackReason | null {
    return this.lastFallbackReason;
  }

  render(
    camera: THREE.Camera,
    pageRenderer: PageRenderer,
    frame: ShadowCorridorFrame
  ): ShadowCorridorProgress | null {
    if (this.disposed)
      return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.disposed);
    if (this.broken)
      return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.renderer);
    if (!frame.active) {
      // A motion interval may return to the same matrix; never reuse the RGB
      // sampled before intervening untracked scene/material changes.
      this.stateKey = "";
      this.lastFallbackReason = SHADOW_CORRIDOR_FALLBACK_REASONS.inactive;
      return null;
    }
    const { width, height, samples } = frame;
    const buffer = resolveSceneAccumulationFormat(frame.options?.format);
    const msaa =
      frame.options?.msaaSamples ??
      DEFAULT_SCENE_ACCUMULATION_OPTIONS.msaaSamples;
    const pixels = width * height;
    const bytes =
      pixels *
      (2 * (buffer.bytesPerPixel + 4) + 2 * buffer.accumulationBytesPerPixel);
    if (
      !Number.isInteger(width) ||
      width < 1 ||
      !Number.isInteger(height) ||
      height < 1 ||
      !Number.isInteger(samples) ||
      samples < 1 ||
      width > this.renderer.capabilities.maxTextureSize ||
      height > this.renderer.capabilities.maxTextureSize
    )
      return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.dimensions);
    if (
      (frame.maxRenderTargetPixels !== undefined &&
        (!(frame.maxRenderTargetPixels > 0) ||
          pixels > frame.maxRenderTargetPixels)) ||
      bytes + this.presentation.memoryBytes > MAX_ATLAS_BYTES
    )
      return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.budget);
    if (buffer.format !== THREE.RGBAFormat)
      return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.format);
    if (msaa !== 0) return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.msaa);
    if (!pageRenderer.supportsOpaqueAccumulation)
      return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.receivers);
    const descriptors = pageRenderer.accumulationPages.map((page) => ({
      ...page,
      ready: page.ready !== false && (frame.isPageReady?.(page.id) ?? true),
    }));
    if (descriptors.length === 0 || descriptors.length > MAX_PAGES) {
      return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.pages);
    }
    this.lastFallbackReason = null;
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousCubeFace = renderer.getActiveCubeFace();
    const previousMipmapLevel = renderer.getActiveMipmapLevel();
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousViewport = renderer.getViewport(new THREE.Vector4());
    const previousScissor = renderer.getScissor(new THREE.Vector4());
    const previousScissorTest = renderer.getScissorTest();
    try {
      renderer.autoClear = false;
      const targetKey = JSON.stringify([
        width,
        height,
        buffer.type,
        buffer.accumulationType,
      ]);
      if (this.targetKey !== targetKey) {
        this.releaseTargets();
        const sceneOptions = {
          type: buffer.type,
          format: THREE.RGBAFormat,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          depthBuffer: true,
          samples: 0,
        } as const;
        this.referenceTarget = new THREE.WebGLRenderTarget(width, height, {
          ...sceneOptions,
          depthTexture: new THREE.DepthTexture(
            width,
            height,
            THREE.UnsignedIntType
          ),
        });
        this.sampleTarget = new THREE.WebGLRenderTarget(width, height, {
          ...sceneOptions,
          depthTexture: new THREE.DepthTexture(
            width,
            height,
            THREE.UnsignedIntType
          ),
        });
        const accumulationOptions = {
          type: buffer.accumulationType,
          format: THREE.RGBAFormat,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          depthBuffer: false,
        } as const;
        this.readTarget = new THREE.WebGLRenderTarget(
          width,
          height,
          accumulationOptions
        );
        this.writeTarget = new THREE.WebGLRenderTarget(
          width,
          height,
          accumulationOptions
        );
        this.targetKey = targetKey;
        this.allocatedBytes = bytes;
      }
      const stateKey = JSON.stringify([
        frame.viewKey,
        frame.styleEpoch,
        samples,
        targetKey,
      ]);
      const resetAll = this.stateKey !== stateKey;
      const descriptorIds = new Set(descriptors.map(({ id }) => id));
      const removed = [...this.pages.values()]
        .filter(({ page }) => !descriptorIds.has(page.id))
        .map(({ page }) => page);
      const changed = resetAll
        ? descriptors
        : descriptors.filter(
            (page) => this.pages.get(page.id)?.page.revision !== page.revision
          );
      // Removing a foreground receiver may reveal a different corridor. Reset
      // its screen-overlap neighbours as well, not only the caster dependency.
      const changedScreens = [...changed, ...removed].flatMap((page) => [
        page.screenBounds,
        ...(this.pages.has(page.id)
          ? [this.pages.get(page.id)!.page.screenBounds]
          : []),
      ]);
      const resetPages = resetAll
        ? descriptors
        : descriptors.filter((page) =>
            changedScreens.some((bounds) =>
              this.overlaps(page.screenBounds, bounds)
            )
          );
      this.blendMaterial.uniforms.uInverseViewProjection.value
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        .invert();
      if (resetAll) {
        this.pages.clear();
        this.cursor = 0;
      }
      for (const page of removed) this.pages.delete(page.id);
      this.cursor %= Math.max(1, descriptors.length);
      for (const page of descriptors) {
        const progress = this.pages.get(page.id);
        if (progress) progress.page = page;
        else this.pages.set(page.id, { page, samples: 0 });
      }
      this.totalSamples = samples;
      if (resetPages.length > 0 || removed.length > 0) {
        this.clearTarget(this.referenceTarget!);
        // One complete first sample guarantees a filled, depth-ordered preview
        // before any single-page refinement, including roofs and floating meshes.
        pageRenderer.renderSample(camera, 0, samples);
        this.blend(
          resetPages,
          true,
          resetAll,
          resetPages.map(() => 1)
        );
        for (const page of resetPages) this.pages.get(page.id)!.samples = 1;
      } else {
        const progress = [...this.pages.values()];
        const selected: PageProgress[] = [];
        const startedAt = performance.now();
        const requestedLimit = frame.maxPagesPerFrame ?? 4;
        const pageLimit = Number.isFinite(requestedLimit)
          ? Math.min(MAX_PAGES, Math.max(1, Math.floor(requestedLimit)))
          : 4;
        const requestedMilliseconds = frame.maxFrameCpuMilliseconds ?? 4;
        const milliseconds = Number.isFinite(requestedMilliseconds)
          ? Math.max(0, requestedMilliseconds)
          : 4;
        const firstIndex = this.cursor;
        for (let offset = 0; offset < progress.length; offset += 1) {
          const index = (firstIndex + offset) % progress.length;
          const page = progress[index];
          if (page.samples >= samples || page.page.ready === false) continue;
          if (selected.length === 0) this.clearTarget(this.sampleTarget!);
          if (
            !pageRenderer.renderPageSample(
              camera,
              page.page.id,
              page.samples,
              samples
            )
          )
            return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.pages);
          selected.push(page);
          this.cursor = (index + 1) % progress.length;
          if (
            selected.length >= pageLimit ||
            performance.now() - startedAt >= milliseconds
          )
            break;
        }
        if (selected.length > 0) {
          this.blend(
            selected.map(({ page }) => page),
            false,
            false,
            selected.map((page) => 1 / (page.samples + 1))
          );
          for (const page of selected) page.samples += 1;
        }
      }
      this.stateKey = stateKey;
      renderer.setRenderTarget(
        previousTarget,
        previousCubeFace,
        previousMipmapLevel
      );
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
      this.quad.material = this.compositeMaterial;
      // The host replays independent completed captures over this first-fill
      // preview. Never show a running mean which pulses on tile publication.
      const integrationComplete = [...this.pages.values()].every(
        (page) => page.samples >= samples
      );
      this.compositeMaterial.uniforms.tColor.value = integrationComplete
        ? this.readTarget!.texture
        : this.referenceTarget!.texture;
      this.compositeMaterial.uniforms.tDepth.value =
        this.referenceTarget!.depthTexture;
      this.compositeMaterial.uniforms.uOutputDither.value =
        previousTarget === null;
      if (!frame.visibilityOnly)
        renderer.render(this.fullscreenScene, this.fullscreenCamera);
      const completed = [...this.pages.values()].reduce(
        (sum, page) => sum + page.samples,
        0
      );
      const settled = completed >= this.pages.size * samples;
      for (const { page, samples: completedSamples } of this.pages.values()) {
        if (page.ready === false || completedSamples < samples) continue;
        const key = JSON.stringify([stateKey, page.revision]);
        if (this.publishedStateKeys.get(page.id) === key) continue;
        // Cache admission/copy failures must not disable shadow rendering.
        try {
          this.presentation.publish(
            this.readTarget!,
            this.referenceTarget!,
            camera,
            page,
            samples
          );
        } catch (error) {
          console.error(
            "[shadow-simulation] retaining previous corridor capture after copy failure",
            error
          );
        }
        this.publishedStateKeys.set(page.id, key);
      }
      for (const id of this.publishedStateKeys.keys()) {
        if (!descriptorIds.has(id)) this.publishedStateKeys.delete(id);
      }
      return {
        progress: completed / (this.pages.size * samples),
        settled,
        needsRepaint: [...this.pages.values()].some(
          (page) => page.samples < samples && page.page.ready !== false
        ),
      };
    } catch (error) {
      this.broken = true;
      console.error(
        "[shadow-simulation] corridor accumulation failed; using direct rendering",
        error
      );
      return this.fallback(SHADOW_CORRIDOR_FALLBACK_REASONS.renderer);
    } finally {
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.setRenderTarget(
        previousTarget,
        previousCubeFace,
        previousMipmapLevel
      );
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
    }
  }

  private overlaps(a: THREE.Vector4, b: THREE.Vector4): boolean {
    return (
      a.x <= b.x + b.z &&
      a.x + a.z >= b.x &&
      a.y <= b.y + b.w &&
      a.y + a.w >= b.y
    );
  }

  private clearTarget(target: THREE.WebGLRenderTarget) {
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(0, 0);
    this.renderer.clear(true, true, false);
  }

  private blend(
    pages: readonly ShadowAccumulationPage[],
    refresh: boolean,
    resetAll: boolean,
    weights: readonly number[]
  ) {
    const uniforms = this.blendMaterial.uniforms;
    uniforms.tPrevious.value = this.readTarget!.texture;
    uniforms.tReference.value = this.referenceTarget!.texture;
    uniforms.tReferenceDepth.value = this.referenceTarget!.depthTexture;
    uniforms.tSample.value = this.sampleTarget!.texture;
    uniforms.tSampleDepth.value = this.sampleTarget!.depthTexture;
    uniforms.uBoundsCount.value = pages.length;
    pages.forEach(({ receiverBounds: bounds }, index) =>
      uniforms.uBounds.value[index].set(
        bounds.min.x,
        bounds.min.z,
        bounds.max.x,
        bounds.max.z
      )
    );
    uniforms.uRefresh.value = refresh;
    uniforms.uResetAll.value = resetAll;
    uniforms.uWeights.value.set(weights);
    this.quad.material = this.blendMaterial;
    this.renderer.setRenderTarget(this.writeTarget);
    this.renderer.render(this.fullscreenScene, this.fullscreenCamera);
    const previousRead = this.readTarget;
    this.readTarget = this.writeTarget;
    this.writeTarget = previousRead;
  }

  private releaseTargets() {
    for (const target of [
      this.referenceTarget,
      this.sampleTarget,
      this.readTarget,
      this.writeTarget,
    ]) {
      target?.depthTexture?.dispose();
      target?.dispose();
    }
    this.referenceTarget = null;
    this.sampleTarget = null;
    this.readTarget = null;
    this.writeTarget = null;
    this.stateKey = "";
    this.targetKey = "";
    this.allocatedBytes = 0;
    this.pages.clear();
  }

  private fallback(reason: ShadowCorridorFallbackReason): null {
    this.lastFallbackReason = reason;
    this.releaseTargets();
    return null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseTargets();
    this.presentation.dispose();
    this.quad.geometry.dispose();
    this.blendMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
