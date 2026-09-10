import * as THREE from "three";

import {
  shadowCorridorCacheKey,
  type ShadowCorridorCacheIdentity,
} from "../core/shadow-corridor-cache-record";
import type { ShadowCorridorCache } from "./shadow-corridor-cache-client";
import type { ShadowAccumulationPage } from "./tiled-shadow-renderer";

const MAX_PAGES = 64;
export const SHADOW_CORRIDOR_RETAINED_BUDGET_BYTES = 256 * 1024 ** 2;
const MAX_BYTES = SHADOW_CORRIDOR_RETAINED_BUDGET_BYTES;
const MAX_REPLACEMENT_BYTES = 128 * 1024 ** 2;
const CAPTURE_BYTES_PER_PIXEL = 8; // R32F visibility + depth32, no baked basemap.
const MAX_READBACK_BYTES = 32 * 1024 ** 2;
const MAX_PENDING_WRITES = 4;

type CorridorCapture = Readonly<{
  target: THREE.WebGLRenderTarget | null;
  visibility: THREE.Texture;
  depth: THREE.Texture;
  width: number;
  height: number;
  bytes: number;
  restored: boolean;
  persistentKey?: string;
  persistentIdentity?: ShadowCorridorCacheIdentity;
  revision: string;
  casterRevision?: string | null;
  presentationKey: string;
  samples: number;
  matrix: THREE.Matrix4;
  crop: THREE.Vector4;
}>;

export type ShadowCorridorPersistenceContext = Readonly<{
  cache: ShadowCorridorCache;
  /** Return null until the exact corridor geometry is loaded and fingerprinted. */
  identity: (
    page: ShadowAccumulationPage,
    samples: number
  ) => ShadowCorridorCacheIdentity | null;
  worldBasis: () => THREE.Matrix4;
  runIdleRender?: (draw: () => void) => boolean;
  requestRepaint?: () => void;
}>;

type PendingCaptureWrite = Readonly<{
  page: ShadowAccumulationPage;
  capture: CorridorCapture;
  identity: ShadowCorridorCacheIdentity;
  key: string;
  worldBasis: number[];
}>;

const disposeCapture = (capture: CorridorCapture) => {
  if (capture.target) {
    capture.target.depthTexture?.dispose();
    capture.target.dispose();
  } else {
    capture.visibility.dispose();
    capture.depth.dispose();
  }
};

const matrixMatches = (left: THREE.Matrix4, right: THREE.Matrix4) =>
  left.elements.every(
    (value, index) =>
      Number.isFinite(value) &&
      Math.abs(value - right.elements[index]) <=
        1e-10 * Math.max(1, Math.abs(value))
  );

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
  private persistence: ShadowCorridorPersistenceContext | undefined;
  private persistenceGeneration = 0;
  private disposed = false;
  private readonly restoreAttempts = new Set<string>();
  private readonly pendingRestores = new Map<
    string,
    { key: string; samples: number }
  >();
  private readonly restoreRequests = new Map<
    string,
    {
      page: ShadowAccumulationPage;
      samples: number;
      expected?: THREE.Matrix4;
    }
  >();
  private readonly pendingWrites = new Map<string, PendingCaptureWrite>();
  private persistenceOffers = new WeakMap<
    CorridorCapture,
    PendingCaptureWrite
  >();
  private persistenceAttempted = new WeakSet<CorridorCapture>();
  private persistenceTimer: ReturnType<typeof setTimeout> | null = null;
  private readbackBusy = false;
  private readbackBytes = 0;
  private readonly packMaterial = new THREE.ShaderMaterial({
    uniforms: {
      visibility: { value: null as THREE.Texture | null },
      depth: { value: null as THREE.Texture | null },
    },
    vertexShader:
      "varying vec2 uvCopy; void main() { uvCopy = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader:
      "uniform sampler2D visibility; uniform sampler2D depth; varying vec2 uvCopy; void main() { gl_FragColor = vec4(texture2D(visibility, uvCopy).r, texture2D(depth, uvCopy).r, 0.0, 1.0); }",
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  private readonly materials = new Map<THREE.Material, () => void>();
  private readonly unsupportedMaterials = new WeakSet<THREE.Material>();
  private captureSupported = true;
  private contentRevision = 0;

  /** Changes only when retained image content changes, never on LRU touches. */
  get revision() {
    return this.contentRevision;
  }

  get supportsCapture() {
    return this.captureSupported;
  }
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
  private readonly downsampleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      source: { value: null as THREE.Texture | null },
      depth: { value: null as THREE.Texture | null },
      texel: { value: new THREE.Vector2() },
    },
    vertexShader:
      "varying vec2 uvCopy; void main() { uvCopy = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `uniform sampler2D source; uniform sampler2D depth;
      uniform vec2 texel; varying vec2 uvCopy;
      void main() {
        vec2 d = texel * 0.25;
        float visibility = (texture2D(source, uvCopy + d).r
          + texture2D(source, uvCopy - d).r
          + texture2D(source, uvCopy + vec2(d.x, -d.y)).r
          + texture2D(source, uvCopy + vec2(-d.x, d.y)).r) * 0.25;
        gl_FragColor = vec4(visibility, 0.0, 0.0, 1.0);
        gl_FragDepth = texture2D(depth, uvCopy).r;
      }`,
    depthTest: true,
    depthFunc: THREE.AlwaysDepth,
    depthWrite: true,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  private readonly uniforms = {
    carmaCaptureVisibility: { value: false },
    carmaRetainedEnabled: { value: false },
    carmaRetainedColor: { value: null as THREE.Texture | null },
    carmaRetainedDepth: { value: null as THREE.Texture | null },
    carmaRetainedMatrix: { value: new THREE.Matrix4() },
    carmaRetainedCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
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
      (bytes, capture) => bytes + capture.bytes,
      this.readbackBytes
    );
  }

  getCapturedSize(
    pageId: string
  ): Readonly<{ width: number; height: number; samples: number }> | null {
    const capture = this.captures.get(pageId);
    return capture
      ? {
          width: capture.width,
          height: capture.height,
          samples: capture.samples,
        }
      : null;
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
    this.schedulePersistence();
  }

  has(page: ShadowAccumulationPage, samples: number) {
    const capture = this.captures.get(page.id);
    if (!this.canReplay(page)) return false;
    // Decision: LINKED-RECEIVER-CASTER-LOD-20260910 in engines/maplibre/README.md.
    // Keep old visibility for continuity, but a newly committed geometry cut
    // requires a fresh hard/soft capture even at unchanged sun and resolution.
    if (capture?.casterRevision !== page.casterRevision) return false;
    // Completed finite-disc masks are baked to a stable receiver/sun identity.
    // Observer changes and smaller buffer demand do not invalidate them. A
    // larger demand keeps replaying this mask but schedules a finer replacement.
    // Hard captures still use exact revisions while their caster stack improves.
    if (
      capture &&
      capture.samples > 1 &&
      capture.samples >= samples &&
      page.captureSize &&
      page.presentationKey &&
      capture.crop.x === 0 &&
      capture.crop.y === 0 &&
      capture.crop.z === 1 &&
      capture.crop.w === 1
    ) {
      return (
        capture.width >= page.captureSize.width &&
        capture.height >= page.captureSize.height
      );
    }
    if (capture?.restored) {
      const request = this.restoreRequests.get(page.id);
      const identity = this.persistence?.identity(page, samples);
      if (
        page.ready === false ||
        !request?.expected ||
        !identity ||
        shadowCorridorCacheKey(identity) !== capture.persistentKey ||
        !matrixMatches(capture.matrix, request.expected)
      )
        return false;
      const b = page.screenBounds;
      const crop = capture.crop;
      if (
        crop.x > b.x + 1e-6 ||
        crop.y > b.y + 1e-6 ||
        crop.x + crop.z < b.x + b.z - 1e-6 ||
        crop.y + crop.w < b.y + b.w - 1e-6
      )
        return false;
    }
    return (
      capture?.revision === (page.contentKey ?? page.revision) &&
      capture.samples === samples
    );
  }

  hasAtLeast(page: ShadowAccumulationPage, samples: number) {
    const capture = this.captures.get(page.id);
    return Boolean(
      capture && capture.samples >= samples && this.has(page, capture.samples)
    );
  }

  /** Reclaim retained bytes without throwing away a completed sun-disc integral.
   * One dyadic step per call is an exact 2x2 (or 2x1) visibility average. Keep
   * the original world projection, crop and sample count; never render geometry.
   */
  downsample(
    page: ShadowAccumulationPage,
    width: number,
    height: number
  ): boolean {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1
    )
      return false;
    const capture = this.captures.get(page.id);
    if (!capture || !this.canReplay(page)) return false;
    const nextWidth = Math.max(width, Math.ceil(capture.width / 2));
    const nextHeight = Math.max(height, Math.ceil(capture.height / 2));
    if (
      nextWidth > capture.width ||
      nextHeight > capture.height ||
      nextWidth * nextHeight >= capture.width * capture.height
    )
      return false;
    const target = new THREE.WebGLRenderTarget(nextWidth, nextHeight, {
      type: THREE.FloatType,
      format: THREE.RedFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(
        nextWidth,
        nextHeight,
        THREE.UnsignedIntType
      ),
      samples: 0,
    });
    const renderer = this.renderer;
    const previous = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const autoClear = renderer.autoClear;
    try {
      renderer.initRenderTarget(target);
      this.downsampleMaterial.uniforms.source.value = capture.visibility;
      this.downsampleMaterial.uniforms.depth.value = capture.depth;
      this.downsampleMaterial.uniforms.texel.value.set(
        1 / nextWidth,
        1 / nextHeight
      );
      this.copyQuad.material = this.downsampleMaterial;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setViewport(new THREE.Vector4(0, 0, nextWidth, nextHeight));
      renderer.setScissorTest(false);
      renderer.render(this.copyScene, this.copyCamera);
    } catch (error) {
      target.depthTexture?.dispose();
      target.dispose();
      throw error;
    } finally {
      this.copyQuad.material = this.copyMaterial;
      renderer.setRenderTarget(previous, face, mip);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.autoClear = autoClear;
    }
    this.captures.set(page.id, {
      ...capture,
      target,
      visibility: target.texture,
      depth: target.depthTexture!,
      width: nextWidth,
      height: nextHeight,
      bytes: nextWidth * nextHeight * 8,
    });
    this.pendingWrites.delete(page.id);
    disposeCapture(capture);
    this.contentRevision += 1;
    return true;
  }

  isRestorePending(page: ShadowAccumulationPage, samples: number) {
    const pending = this.pendingRestores.get(page.id);
    if (!pending || pending.samples !== samples) return false;
    const identity = this.persistence?.identity(page, samples);
    return Boolean(
      identity && shadowCorridorCacheKey(identity) === pending.key
    );
  }

  setPersistence(context?: ShadowCorridorPersistenceContext) {
    if (this.persistence === context) return;
    this.cancelPendingPersistence();
    this.persistence = context;
  }

  private cancelPendingPersistence() {
    this.persistence?.cache.cancelPending();
    this.persistenceGeneration += 1;
    this.restoreAttempts.clear();
    this.pendingRestores.clear();
    this.restoreRequests.clear();
    this.pendingWrites.clear();
    this.persistenceOffers = new WeakMap();
    this.persistenceAttempted = new WeakSet();
    if (this.persistenceTimer !== null) clearTimeout(this.persistenceTimer);
    this.persistenceTimer = null;
  }

  /** Cancel old-time I/O, not resident geometry. A different centre-sun vector
   * must use current hard shadows until its own finite-disc result is ready. */
  beginSolarTransition() {
    this.cancelPendingPersistence();
  }

  canPresent(page: ShadowAccumulationPage): boolean {
    return this.canReplay(page);
  }

  prepareRestore(
    page: ShadowAccumulationPage,
    samples: number,
    expectedCaptureMatrix?: THREE.Matrix4
  ): void {
    if (this.disposed) return;
    this.restoreRequests.set(page.id, {
      page,
      samples,
      expected: expectedCaptureMatrix?.clone(),
    });
    // Keep only a bounded set of current/last visible projections.
    if (this.restoreRequests.size > MAX_PAGES * 2) {
      for (const id of this.restoreRequests.keys()) {
        if (id !== page.id && !this.visiblePageIds.has(id)) {
          this.restoreRequests.delete(id);
          break;
        }
      }
    }
    const context = this.persistence;
    if (
      !context?.cache.enabled ||
      context.cache.busy ||
      page.ready === false ||
      this.hasAtLeast(page, samples)
    )
      return;
    const identity = context.identity(page, samples);
    const key = identity && shadowCorridorCacheKey(identity);
    if (!identity || !key || this.restoreAttempts.has(key)) return;
    this.restoreAttempts.add(key);
    if (this.restoreAttempts.size > MAX_PAGES * 4)
      this.restoreAttempts.delete(this.restoreAttempts.values().next().value!);
    const generation = this.persistenceGeneration;
    const before = this.captures.get(page.id);
    this.pendingRestores.set(page.id, { key, samples });
    void context.cache
      .read(identity)
      .then((record) => {
        const current = this.restoreRequests.get(page.id);
        const currentIdentity =
          current && context.identity(current.page, samples);
        if (
          !record ||
          this.disposed ||
          this.persistenceGeneration !== generation ||
          this.persistence !== context ||
          !current ||
          current.page.ready === false ||
          !currentIdentity ||
          shadowCorridorCacheKey(currentIdentity) !== key ||
          this.captures.get(page.id) !== before
        )
          return;
        const storedBasis = new THREE.Matrix4().fromArray(record.worldBasis);
        const currentBasis = context.worldBasis();
        if (
          !storedBasis.elements.every(Number.isFinite) ||
          storedBasis.determinant() === 0 ||
          !currentBasis.elements.every(Number.isFinite) ||
          currentBasis.determinant() === 0
        )
          return;
        const matrix = new THREE.Matrix4()
          .fromArray(record.captureMatrix)
          .multiply(storedBasis.invert())
          .multiply(currentBasis);
        const cpuBytes = [
          ...new Set([record.visibility.buffer, record.depth.buffer]),
        ].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
        const bytes =
          record.width * record.height * CAPTURE_BYTES_PER_PIXEL + cpuBytes;
        if (!this.admit(page.id, bytes)) return;
        const visibility = new THREE.DataTexture(
          record.visibility,
          record.width,
          record.height,
          THREE.RedFormat,
          THREE.FloatType
        );
        const depth = new THREE.DataTexture(
          record.depth,
          record.width,
          record.height,
          THREE.RedFormat,
          THREE.FloatType
        );
        for (const texture of [visibility, depth]) {
          texture.minFilter = THREE.NearestFilter;
          texture.magFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
        }
        if (before) disposeCapture(before);
        this.captures.delete(page.id);
        this.captures.set(page.id, {
          target: null,
          visibility,
          depth,
          width: record.width,
          height: record.height,
          bytes,
          restored: true,
          persistentKey: key,
          persistentIdentity: record.identity,
          revision: current.page.contentKey ?? current.page.revision,
          casterRevision: current.page.casterRevision,
          presentationKey:
            current.page.presentationKey ??
            current.page.contentKey ??
            current.page.revision,
          samples: record.identity.samples,
          matrix,
          crop: new THREE.Vector4().fromArray(record.crop),
        });
        this.samples = record.identity.samples;
        this.contentRevision += 1;
      })
      .catch(() => undefined)
      .finally(() => {
        if (!this.disposed && generation === this.persistenceGeneration) {
          if (this.pendingRestores.get(page.id)?.key === key)
            this.pendingRestores.delete(page.id);
          context.requestRepaint?.();
          this.schedulePersistence();
        }
      });
  }

  private admit(pageId: string, bytes: number, replacing = false) {
    // Only synchronous GPU replacement may borrow this bounded reserve. The
    // old capture stays intact until both copies succeed; afterwards its bytes
    // are released and retained storage is back within MAX_BYTES. New pages
    // and asynchronous restores never receive replacement credit.
    const replacementCredit = replacing
      ? Math.min(this.captures.get(pageId)?.bytes ?? 0, MAX_REPLACEMENT_BYTES)
      : 0;
    const limit = MAX_BYTES + replacementCredit;
    for (const [id, capture] of this.captures) {
      if (bytes + this.memoryBytes <= limit) break;
      if (id === pageId || this.visiblePageIds.has(id)) continue;
      disposeCapture(capture);
      this.captures.delete(id);
      this.contentRevision += 1;
      this.pendingWrites.delete(id);
    }
    return bytes + this.memoryBytes <= limit;
  }

  publish(
    color: THREE.WebGLRenderTarget,
    reference: THREE.WebGLRenderTarget,
    camera: THREE.Camera,
    page: ShadowAccumulationPage,
    samples: number
  ): boolean {
    if (!this.captureSupported) return false;
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
    // Admission preserves the previous publication until copying succeeds.
    if (!this.admit(page.id, bytes, true)) return false;
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
    if (previousCapture) disposeCapture(previousCapture);
    this.samples = samples;
    this.captures.delete(page.id);
    const capture: CorridorCapture = {
      target,
      visibility: target.texture,
      depth: target.depthTexture!,
      width,
      height,
      bytes,
      restored: false,
      revision: page.contentKey ?? page.revision,
      casterRevision: page.casterRevision,
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
    };
    this.captures.set(page.id, capture);
    this.contentRevision += 1;
    this.queuePersistence(page, capture);
    return true;
  }

  private queuePersistence(
    page: ShadowAccumulationPage,
    capture: CorridorCapture
  ) {
    const context = this.persistence;
    if (!context?.cache.enabled || page.ready === false || this.disposed)
      return;
    const identity = context.identity(page, capture.samples);
    const key = identity && shadowCorridorCacheKey(identity);
    const worldBasis = context.worldBasis();
    if (
      !identity ||
      identity.samples !== capture.samples ||
      !key ||
      !worldBasis.elements.every(Number.isFinite) ||
      worldBasis.determinant() === 0 ||
      capture.width * capture.height * 16 > MAX_READBACK_BYTES
    )
      return;
    this.pendingWrites.delete(page.id);
    // Metadata follows the retained capture without owning another GPU copy.
    // A four-job queue can therefore drain all retained native cells over time.
    this.persistenceOffers.set(capture, {
      page,
      capture,
      identity,
      key,
      worldBasis: [...worldBasis.elements],
    });
    this.schedulePersistence();
  }

  private schedulePersistence() {
    if (
      this.disposed ||
      this.persistenceTimer !== null ||
      this.readbackBusy ||
      !this.persistence?.cache.enabled ||
      this.persistence.cache.busy
    )
      return;
    for (const [id, job] of this.pendingWrites) {
      if (this.captures.get(id) !== job.capture) this.pendingWrites.delete(id);
    }
    for (const visible of [true, false]) {
      for (const [id, capture] of this.captures) {
        if (this.pendingWrites.size >= MAX_PENDING_WRITES) break;
        const offer = this.persistenceOffers.get(capture);
        if (
          this.visiblePageIds.has(id) === visible &&
          offer &&
          !this.persistenceAttempted.has(capture) &&
          !this.pendingWrites.has(id)
        )
          this.pendingWrites.set(id, offer);
      }
    }
    if (this.pendingWrites.size === 0) return;
    this.persistenceTimer = setTimeout(() => {
      this.persistenceTimer = null;
      this.persistNextCapture();
    }, 0);
  }

  private persistNextCapture() {
    const context = this.persistence;
    if (
      this.disposed ||
      this.readbackBusy ||
      !context?.cache.enabled ||
      context.cache.busy ||
      typeof this.renderer.readRenderTargetPixelsAsync !== "function"
    )
      return;
    const entry = [...this.pendingWrites.entries()].find(
      ([id, job]) => this.captures.get(id) === job.capture
    );
    if (!entry) {
      this.pendingWrites.clear();
      return;
    }
    const [id, job] = entry;
    const current = this.restoreRequests.get(id)?.page ?? job.page;
    const identity = context.identity(current, job.capture.samples);
    if (
      current.ready === false ||
      !identity ||
      shadowCorridorCacheKey(identity) !== job.key
    ) {
      this.pendingWrites.delete(id);
      this.persistenceAttempted.add(job.capture);
      this.schedulePersistence();
      return;
    }
    const { capture } = job;
    const bytes = capture.width * capture.height * 16;
    // GPU packing target and CPU readback are transient and budgeted together.
    if (
      bytes > MAX_READBACK_BYTES ||
      this.memoryBytes + bytes * 2 > MAX_BYTES
    ) {
      this.pendingWrites.delete(id);
      this.persistenceAttempted.add(capture);
      this.schedulePersistence();
      return;
    }
    const generation = this.persistenceGeneration;
    const transfer = {
      target: null as THREE.WebGLRenderTarget | null,
      pixels: null as Float32Array | null,
      reading: null as Promise<unknown> | null,
    };
    const draw = () => {
      const renderer = this.renderer;
      const previous = renderer.getRenderTarget();
      const face = renderer.getActiveCubeFace();
      const mip = renderer.getActiveMipmapLevel();
      const viewport = renderer.getViewport(new THREE.Vector4());
      const scissor = renderer.getScissor(new THREE.Vector4());
      const scissorTest = renderer.getScissorTest();
      const autoClear = renderer.autoClear;
      const material = this.copyQuad.material;
      try {
        transfer.target = new THREE.WebGLRenderTarget(
          capture.width,
          capture.height,
          {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
          }
        );
        renderer.initRenderTarget(transfer.target);
        transfer.pixels = new Float32Array(capture.width * capture.height * 4);
        this.packMaterial.uniforms.visibility.value = capture.visibility;
        this.packMaterial.uniforms.depth.value = capture.depth;
        this.copyQuad.material = this.packMaterial;
        renderer.autoClear = false;
        renderer.setRenderTarget(transfer.target);
        renderer.setViewport(
          new THREE.Vector4(0, 0, capture.width, capture.height)
        );
        renderer.setScissorTest(false);
        renderer.render(this.copyScene, this.copyCamera);
        transfer.reading = renderer.readRenderTargetPixelsAsync(
          transfer.target,
          0,
          0,
          capture.width,
          capture.height,
          transfer.pixels
        );
      } finally {
        this.copyQuad.material = material;
        renderer.setRenderTarget(previous, face, mip);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        renderer.autoClear = autoClear;
      }
    };
    try {
      if (context.runIdleRender) {
        if (!context.runIdleRender(draw) && !transfer.target) return;
      } else draw();
    } catch {
      transfer.target?.dispose();
      this.pendingWrites.delete(id);
      this.persistenceAttempted.add(capture);
      this.schedulePersistence();
      return;
    }
    if (!transfer.reading || !transfer.target || !transfer.pixels) {
      transfer.target?.dispose();
      return;
    }
    const packedTarget = transfer.target;
    const rgba = transfer.pixels;
    this.pendingWrites.delete(id);
    this.persistenceAttempted.add(capture);
    this.readbackBusy = true;
    this.readbackBytes = bytes * 2;
    void transfer.reading
      .then(async () => {
        const latest = this.restoreRequests.get(id)?.page ?? job.page;
        const latestIdentity = context.identity(latest, capture.samples);
        if (
          this.disposed ||
          generation !== this.persistenceGeneration ||
          this.persistence !== context ||
          latest.ready === false ||
          !latestIdentity ||
          shadowCorridorCacheKey(latestIdentity) !== job.key
        )
          return;
        await context.cache.writePacked(job.identity, {
          width: capture.width,
          height: capture.height,
          rgba,
          captureMatrix: [...capture.matrix.elements],
          crop: capture.crop.toArray(),
          worldBasis: job.worldBasis,
        });
      })
      .catch(() => undefined)
      .finally(() => {
        packedTarget.dispose();
        this.readbackBusy = false;
        this.readbackBytes = 0;
        if (!this.disposed) {
          context.requestRepaint?.();
          this.schedulePersistence();
        }
      });
  }

  canReplay(page: ShadowAccumulationPage): boolean {
    const capture = this.captures.get(page.id);
    // Recompute validity is deliberately stricter than display continuity.
    // A drag-end LOD/sample change must not hide a finished corridor while its
    // replacement is integrating. Reuse the baked world-projected visibility
    // without observer-depth rejection. A different sun is never a cache hit;
    // The common current-sun hard pass keeps geometry visible during handover.
    // Decision: three/TILED_SHADOW_PAGES.md, RETAINED-VISIBILITY-20260907.
    if (
      !capture ||
      capture.presentationKey !==
        (page.presentationKey ?? page.contentKey ?? page.revision)
    )
      return false;
    if (capture.restored) {
      const identity = this.persistence?.identity(page, capture.samples);
      const stored = capture.persistentIdentity;
      if (page.captureSize && stored) {
        // Resolution is demand, not physical content. A restored finer mask
        // remains valid after zoom-out; all persisted content identities remain
        // checked before accepting it for the current source and solar state.
        return Boolean(
          identity &&
            identity.source === stored.source &&
            identity.dateTime === stored.dateTime &&
            identity.corridor === stored.corridor &&
            identity.geometryFingerprint === stored.geometryFingerprint &&
            identity.samples === stored.samples
        );
      }
      if (
        !identity ||
        shadowCorridorCacheKey(identity) !== capture.persistentKey
      )
        return false;
    }
    return true;
  }

  private activate(page: ShadowAccumulationPage) {
    const capture = this.captures.get(page.id)!;
    this.captures.delete(page.id);
    this.captures.set(page.id, capture);
    this.uniforms.carmaRetainedMatrix.value.copy(capture.matrix);
    this.uniforms.carmaRetainedCrop.value.copy(capture.crop);
    this.uniforms.carmaRetainedColor.value = capture.visibility;
    this.uniforms.carmaRetainedDepth.value = capture.depth;
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
    this.uniforms.carmaRetainedEnabled.value = true;
  }

  /** One colour pass for native receivers with unambiguous material ownership.
   * Shared materials spanning different receivers stay in separate replay draws:
   * Three uploads stock material uniforms only on a material/program change.
   * No geometry/material copies and no private renderer uniform API are needed.
   */
  renderNative(
    scene: THREE.Scene,
    pages: readonly ShadowAccumulationPage[],
    draw: () => void
  ): ReadonlySet<string> {
    if (pages.length === 0) {
      draw();
      return new Set();
    }
    this.configureScene(scene);
    const roots = new Map(
      pages
        .filter(
          (page) => page.receiverObjectId !== undefined && this.canPresent(page)
        )
        .map((page) => [page.receiverObjectId!, page])
    );
    const entries: {
      mesh: THREE.Mesh;
      page: ShadowAccumulationPage | undefined;
    }[] = [];
    const owners = new Map<THREE.Material, Set<string | undefined>>();
    scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      let page: ShadowAccumulationPage | undefined;
      for (
        let parent: THREE.Object3D | null = mesh;
        parent;
        parent = parent.parent
      ) {
        page = roots.get(parent.id);
        if (page) break;
      }
      entries.push({ mesh, page });
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        let assigned = owners.get(material);
        if (!assigned) owners.set(material, (assigned = new Set()));
        assigned.add(page?.id);
      }
    });
    const excluded = new Set<string>();
    for (const assigned of owners.values()) {
      if (assigned.size < 2) continue;
      for (const id of assigned) if (id !== undefined) excluded.add(id);
    }
    const handled = new Set<string>();
    const restore: (() => void)[] = [];
    for (const { mesh, page } of entries) {
      const before = mesh.onBeforeRender;
      const included = page !== undefined && !excluded.has(page.id);
      mesh.onBeforeRender = (...args) => {
        before.call(mesh, ...args);
        this.uniforms.carmaRetainedEnabled.value = false;
        if (included) this.activate(page);
      };
      if (included) handled.add(page.id);
      restore.push(() => {
        mesh.onBeforeRender = before;
      });
    }
    this.uniforms.carmaRetainedEnabled.value = false;
    try {
      draw();
      return handled;
    } finally {
      this.uniforms.carmaRetainedEnabled.value = false;
      for (const reset of restore) reset();
    }
  }

  render<T>(
    scene: THREE.Scene,
    page: ShadowAccumulationPage,
    _samples: number,
    draw: () => T
  ): T {
    if (!this.canPresent(page)) return draw();
    this.configureScene(scene);
    this.activate(page);
    try {
      return draw();
    } finally {
      this.uniforms.carmaRetainedEnabled.value = false;
    }
  }

  capture<T>(scene: THREE.Scene, draw: () => T): T {
    this.captureSupported = true;
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
      if (!mesh.isMesh || !mesh.receiveShadow) return;
      if (
        (mesh as THREE.InstancedMesh).isInstancedMesh ||
        (mesh as THREE.SkinnedMesh).isSkinnedMesh
      ) {
        this.captureSupported = false;
        return;
      }
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        if (this.unsupportedMaterials.has(material))
          this.captureSupported = false;
        const lit =
          (material as THREE.MeshStandardMaterial).isMeshStandardMaterial ||
          (material as THREE.MeshLambertMaterial).isMeshLambertMaterial ||
          (material as THREE.MeshPhongMaterial).isMeshPhongMaterial;
        if (!lit || material.transparent) {
          this.captureSupported = false;
          continue;
        }
        if (this.materials.has(material)) continue;
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
      const directionalShadow =
        /getShadow\( directionalShadowMap\[ i \][^;]+?\)/;
      // Custom compile hooks may remove our anchors. Preserve their live shader,
      // but never publish its shaded colour as numeric visibility.
      if (
        !shader.vertexShader.includes("#include <common>") ||
        !shader.vertexShader.includes("#include <project_vertex>") ||
        !shader.fragmentShader.includes("#include <common>") ||
        !shader.fragmentShader.includes("#include <lights_fragment_begin>") ||
        !shader.fragmentShader.includes("#include <dithering_fragment>") ||
        !directionalShadow.test(THREE.ShaderChunk.lights_fragment_begin)
      ) {
        this.unsupportedMaterials.add(material);
        this.captureSupported = false;
        return;
      }
      this.unsupportedMaterials.delete(material);
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
uniform int carmaRetainedCount;
uniform vec4 carmaRetainedBounds[${MAX_PAGES}];
varying vec4 vCarmaRetainedClip;
varying vec2 vCarmaRetainedWorld;
float carmaRetainedCoverage(float fallbackCoverage) {
  vec3 ndc = vCarmaRetainedClip.xyz / vCarmaRetainedClip.w;
  vec2 uv = ndc.xy * 0.5 + 0.5;
  uv = (uv - carmaRetainedCrop.xy) / carmaRetainedCrop.zw;
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
    // Depth is only a capture-coverage marker. Per-fragment depth matching
    // rejected valid triangle-edge samples and exposed hard-shadow patches.
    // Baked visibility intentionally survives observer motion; see
    // BAKED-VISIBILITY-20260909 in three/TILED_SHADOW_PAGES.md.
    if (depth < 1.0) {
      return texture2D(carmaRetainedColor, uv).r;
    }
  }
  return fallbackCoverage;
}
`
      );
      const lighting = THREE.ShaderChunk.lights_fragment_begin.replace(
        directionalShadow,
        (match) =>
          `(carmaCapturedCoverage = ${match}, carmaRetainedCoverage(carmaCapturedCoverage))`
      );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <lights_fragment_begin>",
          `float carmaCapturedCoverage = 1.0;\n${lighting}`
        )
        .replace(
          "#include <dithering_fragment>",
          // Capture a scalar, not display colour. Keep all prior alpha/discard
          // logic, then bypass tone mapping, colour space, fog and dithering.
          "#include <dithering_fragment>\nif (carmaCaptureVisibility) gl_FragColor.rgb = vec3(carmaCapturedCoverage);"
        );
    };
    const retainedKey = () =>
      `${key.call(material)}|retained-corridor-visibility-v4`;
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
    this.disposed = true;
    this.setPersistence(undefined);
    for (const capture of this.captures.values()) disposeCapture(capture);
    this.captures.clear();
    this.uniforms.carmaRetainedEnabled.value = false;
    this.uniforms.carmaRetainedColor.value = null;
    this.uniforms.carmaRetainedDepth.value = null;
    this.copyQuad.geometry.dispose();
    this.copyMaterial.dispose();
    this.downsampleMaterial.dispose();
    this.packMaterial.dispose();
    for (const restore of this.materials.values()) restore();
    this.materials.clear();
  }
}
