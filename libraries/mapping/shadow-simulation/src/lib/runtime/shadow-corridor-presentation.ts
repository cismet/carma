import * as THREE from "three";

import type { ShadowAccumulationPage } from "./tiled-shadow-renderer";

const MAX_PAGES = 64;
const MAX_BYTES = 256 * 1024 ** 2;
const CAPTURE_BYTES_PER_PIXEL = 8; // R32F visibility + depth32, no baked basemap.

type CorridorCapture = Readonly<{
  target: THREE.WebGLRenderTarget;
  revision: string;
  presentationKey: string;
  samples: number;
  matrix: THREE.Matrix4;
  crop: THREE.Vector4;
}>;

/** Bounded per-corridor scalar visibility captures, reprojected onto their world
 * surfaces. Basemap, normals and materials are shaded live, never baked here.
 * Decision: preserve complete disc stages during input without integrating in
 * the pointer path. See three/TILED_SHADOW_PAGES.md, RETAINED-VISIBILITY-20260907.
 */
export class ShadowCorridorPresentation {
  private readonly captures = new Map<string, CorridorCapture>();
  private visiblePageIds = new Set<string>();
  private samples = 0;
  private replayCount = 0;
  private matchingPages = 0;
  private readonly materials = new Map<THREE.Material, () => void>();
  private readonly copyScene = new THREE.Scene();
  private readonly copyCamera = new THREE.Camera();
  private readonly copyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      source: { value: null as THREE.Texture | null },
      crop: { value: new THREE.Vector4() },
    },
    vertexShader:
      "varying vec2 uvCopy; void main() { uvCopy = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader:
      "uniform sampler2D source; uniform vec4 crop; varying vec2 uvCopy; void main() { gl_FragColor = vec4(texture2D(source, crop.xy + uvCopy * crop.zw).r, 0.0, 0.0, 1.0); }",
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  private readonly copyQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    this.copyMaterial
  );
  private readonly uniforms = {
    carmaCaptureVisibility: { value: false },
    carmaRetainedEnabled: { value: false },
    carmaRetainedColor: { value: null as THREE.Texture | null },
    carmaRetainedDepth: { value: null as THREE.Texture | null },
    carmaRetainedMatrix: { value: new THREE.Matrix4() },
    carmaRetainedCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
    carmaRetainedSize: { value: new THREE.Vector2(1, 1) },
    carmaRetainedCount: { value: 0 },
    carmaRetainedBounds: {
      value: Array.from({ length: MAX_PAGES }, () => new THREE.Vector4()),
    },
  };

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.copyQuad.frustumCulled = false;
    this.copyScene.add(this.copyQuad);
  }

  get memoryBytes() {
    return [...this.captures.values()].reduce(
      (bytes, { target }) =>
        bytes + target.width * target.height * CAPTURE_BYTES_PER_PIXEL,
      0
    );
  }

  get stats() {
    return {
      pages: this.captures.size,
      samples: this.samples,
      matchingPages: this.matchingPages,
      replays: this.replayCount,
      bytes: this.memoryBytes,
    };
  }

  beginFrame(pages: readonly ShadowAccumulationPage[] = []) {
    this.matchingPages = 0;
    this.visiblePageIds = new Set(pages.map((page) => page.id));
  }

  has(page: ShadowAccumulationPage, samples: number) {
    const capture = this.captures.get(page.id);
    return (
      capture?.revision === (page.contentKey ?? page.revision) &&
      capture.samples === samples
    );
  }

  publish(
    color: THREE.WebGLRenderTarget,
    reference: THREE.WebGLRenderTarget,
    camera: THREE.Camera,
    page: ShadowAccumulationPage,
    samples: number
  ): boolean {
    // R32F + depth32. Account for old and new captures during replacement.
    const b = page.screenBounds;
    const left = Math.max(0, Math.floor(b.x * color.width));
    const bottom = Math.max(0, Math.floor(b.y * color.height));
    const right = Math.min(color.width, Math.ceil((b.x + b.z) * color.width));
    const top = Math.min(color.height, Math.ceil((b.y + b.w) * color.height));
    const width = right - left;
    const height = top - bottom;
    const bytes = width * height * CAPTURE_BYTES_PER_PIXEL;
    if (
      width <= 0 ||
      height <= 0 ||
      bytes > MAX_BYTES ||
      !reference.depthTexture
    )
      return false;
    // LRU admission never destroys the page being replaced before its copy succeeds.
    for (const [id, capture] of this.captures) {
      if (
        bytes + this.memoryBytes <= MAX_BYTES &&
        this.captures.size < MAX_PAGES
      )
        break;
      if (id === page.id || this.visiblePageIds.has(id)) continue;
      capture.target.depthTexture?.dispose();
      capture.target.dispose();
      this.captures.delete(id);
    }
    if (bytes + this.memoryBytes > MAX_BYTES) return false;
    const renderer = this.renderer;
    const previous = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const autoClear = renderer.autoClear;
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.FloatType,
      format: THREE.RedFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(
        width,
        height,
        THREE.UnsignedIntType
      ),
      samples: 0,
    });
    try {
      renderer.initRenderTarget(target);
      const region = new THREE.Box2(
        new THREE.Vector2(left, bottom),
        new THREE.Vector2(right, top)
      );
      // WebGL copyTexture cannot convert RGBA32F to R32F. An explicit scalar
      // draw preserves HDR visibility precision and keeps labels out of cache.
      this.copyMaterial.uniforms.source.value = color.texture;
      this.copyMaterial.uniforms.crop.value.set(
        left / color.width,
        bottom / color.height,
        width / color.width,
        height / color.height
      );
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setViewport(new THREE.Vector4(0, 0, width, height));
      renderer.setScissorTest(false);
      renderer.render(this.copyScene, this.copyCamera);
      renderer.copyTextureToTexture(
        reference.depthTexture,
        target.depthTexture!,
        region
      );
    } catch (error) {
      target.depthTexture?.dispose();
      target.dispose();
      throw error;
    } finally {
      renderer.setRenderTarget(previous, face, mip);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.autoClear = autoClear;
    }
    const previousCapture = this.captures.get(page.id);
    previousCapture?.target.depthTexture?.dispose();
    previousCapture?.target.dispose();
    this.samples = samples;
    this.captures.delete(page.id);
    this.captures.set(page.id, {
      target,
      revision: page.contentKey ?? page.revision,
      samples,
      presentationKey: page.presentationKey ?? page.contentKey ?? page.revision,
      matrix: new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      ),
      crop: new THREE.Vector4(
        left / color.width,
        bottom / color.height,
        width / color.width,
        height / color.height
      ),
    });
    return true;
  }

  render<T>(
    scene: THREE.Scene,
    page: ShadowAccumulationPage,
    _samples: number,
    draw: () => T
  ): T {
    const capture = this.captures.get(page.id);
    // Recompute validity is deliberately stricter than display continuity.
    // A drag-end LOD/sample change must not hide a finished corridor while its
    // replacement is integrating. Depth reprojection still rejects disoccluded
    // or changed receiver surfaces; a different sun must never reuse this mask.
    // Decision: three/TILED_SHADOW_PAGES.md, RETAINED-VISIBILITY-20260907.
    if (
      !capture ||
      capture.presentationKey !==
        (page.presentationKey ?? page.contentKey ?? page.revision)
    )
      return draw();
    this.captures.delete(page.id);
    this.captures.set(page.id, capture);
    this.uniforms.carmaRetainedMatrix.value.copy(capture.matrix);
    this.uniforms.carmaRetainedCrop.value.copy(capture.crop);
    this.uniforms.carmaRetainedColor.value = capture.target.texture;
    this.uniforms.carmaRetainedDepth.value = capture.target.depthTexture;
    this.uniforms.carmaRetainedSize.value.set(
      capture.target.width,
      capture.target.height
    );
    this.matchingPages += 1;
    this.replayCount += 1;
    this.uniforms.carmaRetainedCount.value = 1;
    const b = page.receiverBounds;
    this.uniforms.carmaRetainedBounds.value[0].set(
      b.min.x,
      b.min.z,
      b.max.x,
      b.max.z
    );
    this.configureScene(scene);
    this.uniforms.carmaRetainedEnabled.value = true;
    try {
      return draw();
    } finally {
      this.uniforms.carmaRetainedEnabled.value = false;
    }
  }

  capture<T>(scene: THREE.Scene, draw: () => T): T {
    this.configureScene(scene);
    this.uniforms.carmaCaptureVisibility.value = true;
    try {
      return draw();
    } finally {
      this.uniforms.carmaCaptureVisibility.value = false;
    }
  }

  private configureScene(scene: THREE.Scene) {
    scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      // Their vertex transforms need a separate verified world-position path.
      if (
        !mesh.isMesh ||
        (mesh as THREE.InstancedMesh).isInstancedMesh ||
        (mesh as THREE.SkinnedMesh).isSkinnedMesh
      )
        return;
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        const lit =
          (material as THREE.MeshStandardMaterial).isMeshStandardMaterial ||
          (material as THREE.MeshLambertMaterial).isMeshLambertMaterial ||
          (material as THREE.MeshPhongMaterial).isMeshPhongMaterial;
        if (!lit || material.transparent || this.materials.has(material))
          continue;
        this.configure(material);
      }
    });
  }

  private configure(material: THREE.Material) {
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey;
    const uniforms = this.uniforms;
    const retainedCompile: typeof compile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
uniform mat4 carmaRetainedMatrix;
varying vec4 vCarmaRetainedClip;
varying vec2 vCarmaRetainedWorld;
`
        )
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
vec4 retainedWorld = modelMatrix * vec4(transformed, 1.0);
vCarmaRetainedClip = carmaRetainedMatrix * retainedWorld;
vCarmaRetainedWorld = retainedWorld.xz;
`
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
uniform bool carmaRetainedEnabled;
uniform bool carmaCaptureVisibility;
uniform sampler2D carmaRetainedColor;
uniform sampler2D carmaRetainedDepth;
uniform vec4 carmaRetainedCrop;
uniform vec2 carmaRetainedSize;
uniform int carmaRetainedCount;
uniform vec4 carmaRetainedBounds[${MAX_PAGES}];
varying vec4 vCarmaRetainedClip;
varying vec2 vCarmaRetainedWorld;
float carmaRetainedCoverage(float fallbackCoverage) {
  vec3 ndc = vCarmaRetainedClip.xyz / vCarmaRetainedClip.w;
  vec2 uv = ndc.xy * 0.5 + 0.5;
  uv = (uv - carmaRetainedCrop.xy) / carmaRetainedCrop.zw;
  vec3 q = vec3(uv, ndc.z * 0.5 + 0.5);
  vec3 dx = dFdx(q), dy = dFdy(q);
  if (!carmaRetainedEnabled || carmaCaptureVisibility || vCarmaRetainedClip.w <= 0.0) return fallbackCoverage;
  bool owned = false;
  for (int i = 0; i < ${MAX_PAGES}; i++) {
    if (i >= carmaRetainedCount) break;
    vec4 b = carmaRetainedBounds[i];
    if (vCarmaRetainedWorld.x >= b.x && vCarmaRetainedWorld.y >= b.y &&
        vCarmaRetainedWorld.x < b.z && vCarmaRetainedWorld.y < b.w) owned = true;
  }
  if (owned && all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) {
    float depth = texture2D(carmaRetainedDepth, uv).r;
    // Compare at the sampled texel centre, not at a different point on a slope.
    // This is receiver-plane depth reprojection, not a widened disocclusion bias.
    float det = dx.x * dy.y - dx.y * dy.x;
    vec2 dz = abs(det) > 1e-20 ? vec2(dx.z * dy.y - dy.z * dx.y, dx.x * dy.z - dy.x * dx.z) / det : vec2(0.0);
    vec2 centre = (floor(uv * carmaRetainedSize) + 0.5) / carmaRetainedSize;
    float expectedDepth = q.z + dot(dz, centre - uv);
    if (depth < 1.0 && abs(depth - expectedDepth) <= 0.000001) {
      return texture2D(carmaRetainedColor, uv).r;
    }
  }
  return fallbackCoverage;
}
`
      );
      const lighting = THREE.ShaderChunk.lights_fragment_begin.replace(
        /getShadow\( directionalShadowMap\[ i \][^;]+?\)/,
        (match) =>
          `(carmaCapturedCoverage = ${match}, carmaRetainedCoverage(carmaCapturedCoverage))`
      );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <lights_fragment_begin>",
          `float carmaCapturedCoverage = 1.0;\n${lighting}`
        )
        .replace(
          "#include <opaque_fragment>",
          "if (carmaCaptureVisibility) outgoingLight = vec3(carmaCapturedCoverage);\n#include <opaque_fragment>"
        );
    };
    const retainedKey = () =>
      `${key.call(material)}|retained-corridor-visibility-v2`;
    material.onBeforeCompile = retainedCompile;
    material.customProgramCacheKey = retainedKey;
    material.needsUpdate = true;
    const restore = () => {
      if (material.onBeforeCompile === retainedCompile)
        material.onBeforeCompile = compile;
      if (material.customProgramCacheKey === retainedKey)
        material.customProgramCacheKey = key;
      material.removeEventListener("dispose", release);
      material.needsUpdate = true;
    };
    const release = () => {
      restore();
      this.materials.delete(material);
    };
    material.addEventListener("dispose", release);
    this.materials.set(material, restore);
  }

  dispose() {
    for (const { target } of this.captures.values()) {
      target.depthTexture?.dispose();
      target.dispose();
    }
    this.captures.clear();
    this.uniforms.carmaRetainedEnabled.value = false;
    this.uniforms.carmaRetainedColor.value = null;
    this.uniforms.carmaRetainedDepth.value = null;
    this.copyQuad.geometry.dispose();
    this.copyMaterial.dispose();
    for (const restore of this.materials.values()) restore();
    this.materials.clear();
  }
}
