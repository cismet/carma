import * as THREE from "three";

import { resolveSceneAccumulationFormat } from "@carma-mapping/engines/three/primitives/rendering";

import {
  fitShadowReceiverCapture,
  budgetShadowReceiverCaptures,
  shadowReceiverCaptureOrientation,
  type ShadowReceiverCapturePlan,
} from "../core/shadow-receiver-capture";
import {
  ShadowCorridorAccumulator,
  SHADOW_CORRIDOR_WORKING_BUDGET_BYTES,
  type ShadowCorridorFrame,
  type ShadowCorridorProgress,
} from "./shadow-corridor-accumulator";
import {
  ShadowCorridorPresentation,
  SHADOW_CORRIDOR_RETAINED_BUDGET_BYTES,
} from "./shadow-corridor-presentation";
import type {
  ShadowAccumulationPage,
  TiledShadowRenderer,
} from "./tiled-shadow-renderer";

type PageRenderer = Pick<
  TiledShadowRenderer,
  "accumulationPages" | "supportsOpaqueAccumulation" | "renderPageSample"
>;

type ReceiverCapture = Readonly<{
  page: ShadowAccumulationPage;
  plan: ShadowReceiverCapturePlan;
  ready: boolean;
}>;

/** Full-source receiver integration replaces the observer-registered atlas.
 * Exactly one page owns working targets. Completed scalar/depth publications
 * share the bounded presentation cache; a sibling arriving does not reset the
 * current page. FIFO completion avoids keeping N unfinished HDR targets alive.
 * Source/caster, direction and actual allocation changes remain dependencies.
 */
export class ShadowReceiverAccumulator {
  readonly presentation: ShadowCorridorPresentation;
  private readonly scratch: ShadowCorridorAccumulator;
  private captures: readonly ReceiverCapture[] = [];
  private activeId: string | null = null;
  private cursor = 0;
  private samples = 1;
  private disposed = false;
  private readonly publicationRetries = new Map<
    string,
    Readonly<{
      contentKey: string;
      attempts: number;
      retryAt: number;
    }>
  >();
  private readonly restoreOpportunities = new Map<string, string>();
  private readonly plans = new Map<
    string,
    Readonly<{
      inputs: string;
      plan: ShadowReceiverCapturePlan;
    }>
  >();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.presentation = new ShadowCorridorPresentation(renderer);
    this.scratch = new ShadowCorridorAccumulator(renderer, this.presentation);
  }

  get memoryBytes() {
    return this.scratch.memoryBytes;
  }
  get fallbackReason() {
    return this.presentation.supportsCapture
      ? this.scratch.fallbackReason
      : "receivers";
  }
  get capturePages() {
    return this.captures.map(({ page }) => page);
  }

  get pageProgress() {
    const running = this.scratch.pageProgress;
    return this.captures.map(({ page, plan, ready }) => {
      const published = ready && this.presentation.has(page, this.samples);
      const progress = running.find(({ id }) => id === page.id);
      return {
        id: page.id,
        samples: published ? this.samples : progress?.samples ?? 0,
        totalSamples: this.samples,
        ready,
        published,
        limited: plan.limited,
        width: plan.width,
        height: plan.height,
      };
    });
  }

  private updateCaptures(
    observer: THREE.Camera,
    renderer: PageRenderer,
    frame: ShadowCorridorFrame,
    requireDescriptorReady = true
  ) {
    const orientation = shadowReceiverCaptureOrientation(observer);
    const format = resolveSceneAccumulationFormat(frame.options?.format);
    // Reserve half for retained captures. Include the new R32F+depth32 copy
    // during publication, so admission never needs to evict the active scratch.
    const workingBytesPerPixel =
      2 * (format.bytesPerPixel / 4 + 4) +
      (2 * format.accumulationBytesPerPixel) / 4 +
      8;
    const maximumPixels = Math.max(
      1,
      Math.floor(
        Math.min(
          frame.maxRenderTargetPixels ?? frame.width * frame.height,
          SHADOW_CORRIDOR_WORKING_BUDGET_BYTES / 2 / workingBytesPerPixel
        )
      )
    );
    const desired = renderer.accumulationPages.map((page) => {
      // The baked projection belongs to this receiver, not to a later camera
      // rotation. Keep its orientation even when a larger allocation is needed.
      const previous = this.plans.get(page.id);
      const captureOrientation = previous?.plan.camera.quaternion ?? orientation;
      const options = {
        groundTexelTargetMeters: page.groundTexelTargetMeters ?? 1,
        maximumDimension: this.renderer.capabilities.maxTextureSize,
        maximumPixels,
      };
      const inputs = JSON.stringify([
        page.receiverBounds.min,
        page.receiverBounds.max,
        captureOrientation.toArray(),
        options,
      ]);
      const plan =
        previous?.inputs === inputs
          ? previous.plan
          : fitShadowReceiverCapture(
              page.receiverBounds,
              captureOrientation,
              options
            );
      this.plans.set(page.id, { inputs, plan });
      plan.camera.layers.mask = observer.layers.mask;
      return { page, plan };
    });
    const allocated = budgetShadowReceiverCaptures(
      desired.map(({ page, plan }) => ({
        id: page.id,
        plan,
        screenArea: page.screenBounds.z * page.screenBounds.w,
      })),
      SHADOW_CORRIDOR_RETAINED_BUDGET_BYTES
    );
    this.captures = desired.map(({ page, plan: desiredPlan }) => {
      const plan = allocated.get(page.id) ?? desiredPlan;
      const contentKey = JSON.stringify([
        page.contentKey ?? page.revision,
        plan.key,
      ]);
      const ready =
        (!requireDescriptorReady || page.ready !== false) &&
        (frame.isPageReady?.(page.id) ?? true);
      return {
        page: {
          ...page,
          ready,
          captureKey: JSON.stringify([
            plan.camera.quaternion.toArray(),
            plan.width,
            plan.height,
          ]),
          captureSize: { width: plan.width, height: plan.height },
          contentKey,
          revision: contentKey,
          screenBounds: new THREE.Vector4(0, 0, 1, 1),
        },
        plan,
        ready,
      };
    });
    const activeIds = new Set(this.captures.map(({ page }) => page.id));
    for (const id of this.plans.keys()) {
      if (!activeIds.has(id)) this.plans.delete(id);
    }
    for (const [id, retry] of this.publicationRetries) {
      const current = this.captures.find(({ page }) => page.id === id);
      if (!current || current.page.contentKey !== retry.contentKey)
        this.publicationRetries.delete(id);
    }
    this.presentation.beginFrame(this.capturePages);
    for (const { page, plan } of this.captures) {
      this.presentation.prepareRestore(
        page,
        frame.samples,
        new THREE.Matrix4().multiplyMatrices(
          plan.camera.projectionMatrix,
          plan.camera.matrixWorldInverse
        )
      );
    }
  }

  private yieldForRestore(
    page: ShadowAccumulationPage,
    samples: number
  ): boolean {
    if (!this.presentation.isRestorePending(page, samples)) return false;
    const key = JSON.stringify([page.id, samples]);
    const content = page.contentKey ?? page.revision;
    if (this.restoreOpportunities.get(key) === content) return false;
    this.restoreOpportunities.set(key, content);
    // One scheduling opportunity, never the full storage timeout on the input path.
    if (this.restoreOpportunities.size > 1024) {
      const oldest = this.restoreOpportunities.keys().next().value;
      if (oldest !== undefined) this.restoreOpportunities.delete(oldest);
    }
    return true;
  }

  render(
    observer: THREE.Camera,
    renderer: PageRenderer,
    frame: ShadowCorridorFrame
  ): ShadowCorridorProgress | null {
    if (this.disposed) return null;
    this.samples = frame.samples;
    this.updateCaptures(observer, renderer, frame);
    if (!frame.active) return null;
    // A rejected numeric-capture shader must return to correct direct lighting
    // immediately, not spend another complete disc on unpublishable albedo.
    if (!this.presentation.supportsCapture) {
      this.scratch.releaseScratch();
      this.activeId = null;
      return null;
    }

    const now = performance.now();
    let retryAfterMs: number | undefined;
    let active = this.captures.find(({ page }) => page.id === this.activeId);
    if (!active?.ready || this.presentation.has(active.page, frame.samples)) {
      this.scratch.releaseScratch();
      this.activeId = null;
      active = undefined;
    }
    if (active) {
      const retry = this.publicationRetries.get(active.page.id);
      if (retry && retry.retryAt > now)
        retryAfterMs = Math.ceil(retry.retryAt - now);
    }
    if (!active && this.captures.length > 0) {
      for (let offset = 0; offset < this.captures.length; offset += 1) {
        const index = (this.cursor + offset) % this.captures.length;
        const candidate = this.captures[index];
        if (
          !candidate.ready ||
          this.presentation.has(candidate.page, frame.samples) ||
          this.yieldForRestore(candidate.page, frame.samples)
        )
          continue;
        const retry = this.publicationRetries.get(candidate.page.id);
        if (retry && retry.retryAt > now) {
          retryAfterMs = Math.min(
            retryAfterMs ?? Infinity,
            Math.ceil(retry.retryAt - now)
          );
          continue;
        }
        active = candidate;
        retryAfterMs = undefined;
        this.activeId = candidate.page.id;
        this.cursor = (index + 1) % this.captures.length;
        break;
      }
    }
    let update: ShadowCorridorProgress | null = null;
    if (active && retryAfterMs === undefined) {
      const { page, plan } = active;
      // Every pass is this full source page, including its first disc sample.
      // The original observer scissor must never crop a capture-camera render.
      const draw = (camera: THREE.Camera, sample: number, count: number) =>
        renderer.renderPageSample(
          camera,
          page.id,
          sample,
          count,
          page.screenBounds
        );
      update = this.scratch.render(
        plan.camera,
        {
          accumulationPages: [page],
          supportsOpaqueAccumulation: renderer.supportsOpaqueAccumulation,
          renderSample: draw,
          renderPageSample: (camera, _id, sample, count) =>
            draw(camera, sample, count),
        },
        {
          ...frame,
          width: plan.width,
          height: plan.height,
          viewKey: plan.key,
          visibilityOnly: true,
          isPageReady: undefined,
          maxPagesPerFrame: frame.maxPagesPerFrame ?? 4,
        }
      );
      if (update?.settled) {
        this.publicationRetries.delete(page.id);
        this.scratch.releaseScratch();
        this.activeId = null;
      } else if (update?.retryAfterMs !== undefined) {
        const attempts =
          (this.publicationRetries.get(page.id)?.attempts ?? 0) + 1;
        retryAfterMs = Math.max(250, update.retryAfterMs);
        // Preserve a completed integration through transient copy failures.
        // One scratch cannot retain it AND integrate siblings indefinitely:
        // after three failed publications yield, preserving the old displayed
        // capture. A blocked page then retries only after the existing backoff.
        const yieldPage = attempts >= 3;
        if (yieldPage) retryAfterMs = Math.max(1000, retryAfterMs);
        this.publicationRetries.set(page.id, {
          contentKey: page.contentKey!,
          attempts: yieldPage ? 0 : attempts,
          retryAt: now + retryAfterMs,
        });
        if (yieldPage) {
          this.scratch.releaseScratch();
          this.activeId = null;
          if (
            this.captures.some(
              ({ page: other, ready }) =>
                ready &&
                other.id !== page.id &&
                !this.presentation.has(other, frame.samples) &&
                (this.publicationRetries.get(other.id)?.retryAt ?? 0) <= now
            )
          )
            retryAfterMs = undefined;
        }
      }
      if (!update) return null;
    }
    const progress = this.pageProgress;
    const completed = progress.reduce(
      (sum, page) =>
        sum +
        (page.published
          ? frame.samples
          : Math.min(page.samples, frame.samples - 1)),
      0
    );
    const total = progress.length * frame.samples;
    return {
      progress: total > 0 ? completed / total : 1,
      settled: total === completed,
      needsRepaint:
        progress.some((page) => page.ready && !page.published) &&
        retryAfterMs === undefined,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }

  /** Publish one committed hard stage without resetting an unrelated soft page.
   * Caller supplies coarse-stage readiness and wraps this in presentation.capture.
   * A matching higher-sample publication is never replaced with a hard mask.
   */
  renderHard(
    observer: THREE.Camera,
    pageRenderer: PageRenderer,
    frame: ShadowCorridorFrame
  ): Readonly<{
    published: number;
    needsRepaint: boolean;
    retryAfterMs?: number;
  }> {
    if (this.disposed || !frame.active)
      return { published: 0, needsRepaint: false };
    this.updateCaptures(
      observer,
      pageRenderer,
      { ...frame, samples: 1 },
      frame.isPageReady === undefined
    );
    // The capture shader cannot replace arbitrary/unlit/transparent materials.
    // Their ordinary color is not scalar visibility. Keep descriptors available
    // for the host's direct hard draw, but never publish albedo as a shadow mask.
    if (
      !pageRenderer.supportsOpaqueAccumulation ||
      !this.presentation.supportsCapture ||
      !this.renderer.extensions.has("EXT_color_buffer_float")
    )
      return { published: 0, needsRepaint: false };
    const existingSizes = new Map(
      this.captures.map(
        ({ page }) =>
          [page.id, this.presentation.getCapturedSize(page.id)] as const
      )
    );
    const needsRebalance =
      this.captures.reduce((bytes, { page, plan }) => {
        const old = existingSizes.get(page.id);
        return (
          bytes +
          Math.max(plan.width * plan.height, old ? old.width * old.height : 0) *
            8
        );
      }, 0) > SHADOW_CORRIDOR_RETAINED_BUDGET_BYTES;
    const reclaimableBytes = ({ page, plan }: ReceiverCapture) => {
      const old = existingSizes.get(page.id);
      return old ? (old.width * old.height - plan.width * plan.height) * 8 : 0;
    };
    const pending = this.captures.filter(({ page, plan, ready }) => {
      if (!ready) return false;
      const old = existingSizes.get(page.id);
      if (
        this.presentation.hasAtLeast(page, 1) &&
        (!needsRebalance ||
          !old ||
          old.width * old.height <= plan.width * plan.height)
      )
        return false;
      // Keep a finer soft mask while its new layout integrates. Only actual
      // pressure justifies replacing it with a smaller hard publication.
      return !(
        old &&
        old.samples > 1 &&
        !needsRebalance &&
        (old.width !== plan.width || old.height !== plan.height) &&
        this.presentation.canReplay(page)
      );
    });
    // Same-ID downgrades free the old layout's pinned bytes before new IDs
    // arrive. The final affordable set must not wait on impossible admission.
    if (needsRebalance)
      pending.sort((a, b) => reclaimableBytes(b) - reclaimableBytes(a));
    const next = pending.find(({ page }) => !this.yieldForRestore(page, 1));
    if (!next) return { published: 0, needsRepaint: pending.length > 0 };
    const { page, plan } = next;
    // Temporary hard R32F+depth32 AND the newly copied publication coexist.
    if (
      this.memoryBytes + plan.width * plan.height * 16 >
      SHADOW_CORRIDOR_WORKING_BUDGET_BYTES
    )
      return { published: 0, needsRepaint: false, retryAfterMs: 1000 };
    const renderer = this.renderer;
    const previous = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const autoClear = renderer.autoClear;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    const target = new THREE.WebGLRenderTarget(plan.width, plan.height, {
      type: THREE.FloatType,
      format: THREE.RedFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      samples: 0,
      depthTexture: new THREE.DepthTexture(
        plan.width,
        plan.height,
        THREE.UnsignedIntType
      ),
    });
    try {
      renderer.initRenderTarget(target);
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setViewport(new THREE.Vector4(0, 0, plan.width, plan.height));
      renderer.setScissorTest(false);
      renderer.setClearColor(0, 0);
      renderer.clear(true, true, false);
      const rendered = pageRenderer.renderPageSample(
        plan.camera,
        page.id,
        0,
        1,
        page.screenBounds
      );
      const published =
        rendered &&
        this.presentation.publish(target, target, plan.camera, page, 1);
      return {
        published: published ? 1 : 0,
        needsRepaint: published && pending.length > 1,
        ...(published ? {} : { retryAfterMs: 1000 }),
      };
    } catch (error) {
      console.warn(
        "[shadow-simulation] retaining completed corridor after hard-stage capture failure",
        error
      );
      return { published: 0, needsRepaint: false, retryAfterMs: 1000 };
    } finally {
      renderer.setRenderTarget(previous, face, mip);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.autoClear = autoClear;
      target.depthTexture?.dispose();
      target.dispose();
    }
  }

  /** Cancel unpublished integration only; completed world-space masks survive
   * dragging. The next settled view rebuilds demand from visible receivers.
   */
  cancelPending() {
    if (this.activeId !== null) this.scratch.releaseScratch();
    this.activeId = null;
    this.publicationRetries.clear();
    this.restoreOpportunities.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scratch.dispose();
    this.presentation.dispose();
    this.captures = [];
    this.plans.clear();
    this.publicationRetries.clear();
    this.restoreOpportunities.clear();
  }
}
