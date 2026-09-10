import * as THREE from "three";

import type { SharedThreeSceneFrame } from "@carma-mapping/engines/maplibre";
import { SceneFrameCache } from "@carma-mapping/engines/three/primitives/rendering";

import type { ShadowReceiverCell } from "../core/shadow-page-plan";
import type {
  TiledShadowLighting,
  ShadowPrewarmPage,
  TiledShadowStats,
  ShadowPrewarmResult,
  ShadowAccumulationPage,
} from "./tiled-shadow-renderer";
import { TiledShadowRenderer } from "./tiled-shadow-renderer";
import {
  prewarmShadowPages,
  type ShadowCasterLease,
  type ShadowIdlePageStats,
} from "./shadow-idle-pages";
import { yieldShadowIdleTask } from "./shadow-idle-prefetch";
import type { ShadowCorridorFrame } from "./shadow-corridor-accumulator";
import { ShadowReceiverAccumulator } from "./shadow-receiver-accumulator";
import { createShadowCorridorCache } from "./shadow-corridor-cache-client";
import type { auditShadowCorridor } from "../core/shadow-corridor-audit";

/** Map-host adapter: same page engine as the standalone story, but sky and
 * debug overlays belong to the host and must not paint over earlier pages.
 */
export class ShadowTiledScene {
  private readonly pages: TiledShadowRenderer;
  private viewKey = "";
  private idleStats: ShadowIdlePageStats | null = null;
  private readonly accumulation: ShadowReceiverAccumulator;
  private readonly persistentCache = createShadowCorridorCache(import.meta.url);
  private accumulationSettled = false;
  private viewport = new THREE.Vector2(1, 1);
  private lastFrame: ShadowCorridorFrame | null = null;
  private readonly frameCache: SceneFrameCache;
  private presentedPageIds = new Set<string>();
  private casterRevisionsDirty = true;
  private casterRevisionCursor = 0;
  private hardRetryTimer: ReturnType<typeof globalThis.setTimeout> | null =
    null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly host: Readonly<{
      light: THREE.DirectionalLight;
      sky: THREE.Object3D;
      overlay: THREE.Object3D;
      maximumMapSize: number;
      isCorridorReady?: (
        bounds: THREE.Box3,
        errorPixels?: number,
        receiverBounds?: THREE.Box3
      ) => boolean;
      receiverStageError?: (bounds: THREE.Box3) => number;
      receiverBiasLimit?: (
        bounds: THREE.Box3,
        groundTexelTargetMeters: number
      ) => number;
      corridorRevision?: (
        bounds: THREE.Box3,
        errorPixels?: number,
        receiverBounds?: THREE.Box3
      ) => string | null;
      dateTimeKey?: () => string | null;
      worldBasis?: () => THREE.Matrix4;
      requestRepaint?: () => void;
      visualEpoch?: () => number;
      onPresentedPages?: (
        presentedPages: readonly ShadowAccumulationPage[],
        visiblePages: readonly ShadowAccumulationPage[]
      ) => void;
      auditCorridors?: (
        pages: readonly {
          id: string;
          casterBounds: THREE.Box3;
          receiverBounds: THREE.Box3;
        }[]
      ) => readonly ReturnType<typeof auditShadowCorridor>[];
      runIdleRender?: (render: () => void) => boolean;
    }>
  ) {
    this.frameCache = new SceneFrameCache(renderer);
    // Reserve one maximum-size streamed RGBA8+depth32 target AND one retained
    // target. A one-target budget is consumed entirely by the scratch reserve
    // and otherwise forces every unchanged hard-presentation pass to rebuild
    // its depth. This fixed two-target cap never scales with disc sample count.
    this.pages = new TiledShadowRenderer(
      scene,
      renderer,
      host.maximumMapSize ** 2 * 8 * 2,
      host.maximumMapSize
    );
    this.accumulation = new ShadowReceiverAccumulator(renderer);
    if (host.worldBasis && host.corridorRevision && host.dateTimeKey) {
      this.accumulation.presentation.setPersistence({
        cache: this.persistentCache,
        identity: (page, samples) => {
          const geometry = this.pages.getPageGeometry(page.id);
          const dateTime = host.dateTimeKey?.();
          if (!geometry || !dateTime || !page.captureKey) return null;
          const error =
            samples === 1
              ? host.receiverStageError?.(page.receiverBounds)
              : undefined;
          const fingerprint = host.corridorRevision?.(
            geometry.casterBounds,
            error,
            page.receiverBounds
          );
          if (!fingerprint) return null;
          return {
            // v2 separates geometry-owned native captures from old AABB masks.
            source: "shared-scene-corridor-v2",
            dateTime,
            corridor: page.id,
            resolution: JSON.stringify([
              geometry.width,
              geometry.height,
              page.captureKey,
            ]),
            geometryFingerprint: fingerprint,
            samples,
          };
        },
        worldBasis: host.worldBasis,
        runIdleRender: host.runIdleRender,
        requestRepaint: host.requestRepaint,
      });
    }
  }

  update(
    cells: readonly ShadowReceiverCell[],
    frame: SharedThreeSceneFrame,
    lighting: TiledShadowLighting,
    targetPixels: number
  ) {
    this.viewport.copy(frame.viewport);
    const key = JSON.stringify([
      cells.map(({ id, bounds, receiverObjectId }) => [
        id,
        bounds.min,
        bounds.max,
        receiverObjectId,
      ]),
      frame.renderCamera.projectionMatrix.elements,
      frame.renderCamera.matrixWorldInverse.elements,
      frame.viewport,
      lighting,
      targetPixels,
    ]);
    if (key === this.viewKey) return;
    this.pages.setView(
      cells,
      frame.renderCamera,
      frame.viewport,
      targetPixels,
      lighting,
      this.host.receiverBiasLimit
    );
    this.viewKey = key;
    this.casterRevisionsDirty = true;
    this.casterRevisionCursor = 0;
  }

  /** Keep completed corridor textures attached to their receiver tiles while
   * the observer camera moves; capture dimensions are reconsidered on moveend. */
  updatePresentation(frame: SharedThreeSceneFrame) {
    this.viewport.copy(frame.viewport);
    this.pages.updatePresentation(frame.renderCamera);
  }

  /** Unknown external scene changes still require a full invalidation. Raster
   * publications provide old-union-new geometry bounds, including removed tiles.
   */
  invalidateContent(changedBounds?: readonly THREE.Box3[]) {
    if (changedBounds?.length === 0) return;
    this.casterRevisionsDirty = true;
    this.casterRevisionCursor = 0;
    this.frameCache.invalidate();
    if (!changedBounds) this.pages.clearCache();
    else if (changedBounds.length > 0)
      this.pages.invalidateCasters(changedBounds);
  }

  async prewarm({
    cells,
    frame,
    lighting,
    targetPixels,
    samples,
    prepare,
    signal,
    yieldToInput = yieldShadowIdleTask,
  }: {
    cells: readonly ShadowReceiverCell[];
    frame: SharedThreeSceneFrame;
    lighting: TiledShadowLighting;
    targetPixels: number;
    samples: number;
    prepare: (
      page: ShadowPrewarmPage,
      signal: AbortSignal
    ) => Promise<ShadowCasterLease>;
    signal: AbortSignal;
    yieldToInput?: (signal: AbortSignal) => Promise<void>;
  }) {
    if (signal.aborted) return null;
    this.idleStats = null;
    this.pages.setPrewarmView(
      cells,
      frame.renderCamera,
      frame.viewport,
      targetPixels,
      lighting,
      samples
    );
    try {
      this.idleStats = await prewarmShadowPages({
        pages: this.pages.prewarmPages,
        signal,
        prepare,
        yieldToInput,
        render: (pageId, group, passSignal) => {
          if (group?.parent)
            throw new Error("Idle caster lease must own an unmounted group");
          const lightVisible = this.host.light.visible;
          this.host.light.visible = false;
          if (group) this.scene.add(group);
          try {
            // The lease is mounted for one synchronous depth-only pass, never
            // across an await where MapLibre could paint it in the foreground.
            let result: ShadowPrewarmResult | null = null;
            const render = () => {
              result = this.pages.prewarmNext(frame.renderCamera, pageId, {
                signal: passSignal,
              });
            };
            if (this.host.runIdleRender) this.host.runIdleRender(render);
            else render(); // Standalone Three hosts have no MapLibre state cache.
            return (
              result ?? {
                pageId,
                rendered: 0,
                cachedSamples: 0,
                totalSamples: samples,
                complete: false,
                budgetLimited: false,
                aborted: true,
              }
            );
          } finally {
            if (group) this.scene.remove(group);
            this.host.light.visible = lightVisible;
          }
        },
      });
      return this.idleStats;
    } finally {
      this.pages.clearPrewarmView();
    }
  }

  renderProgressive(camera: THREE.Camera, frame: ShadowCorridorFrame) {
    this.lastFrame = frame;
    // Camera motion changes presentation only. Keep the world-anchored hard and
    // finite-sun page textures untouched until moveend; the lightweight draw
    // path below can reuse them against the current camera.
    if (!frame.active) {
      this.pausePending();
      return null;
    }
    // A tiled view can be enabled before the first committed receiver cut is
    // available. Treat that as "not handled" so the shared scene renders its
    // already loaded meshes directly instead of publishing a sky-only frame.
    // Receiver publication will request the next paint and activate pages.
    // Page descriptors precede captures: captureHard initializes the receiver
    // accumulator below. Testing capturePages here deadlocked the first draw.
    if (this.pages.accumulationPages.length === 0) {
      this.accumulationSettled = false;
      return null;
    }
    const result = this.renderWithHost(camera, () => {
      const hard = this.captureHard(camera);
      if (this.casterRevisionsDirty && this.host.corridorRevision) return null;
      // Hard coverage gets the first submission, not exclusive ownership of
      // every frame until unrelated corridors or viewport tiles become ready.
      const progress = this.accumulation.presentation.capture(this.scene, () =>
        this.accumulation.render(camera, this.pages, {
          ...frame,
          visibilityOnly: true,
          // Bounded submissions, then yield to the browser. Do not insert a
          // fixed sleep between samples or an additional four-submit ceiling.
          // A single draw cannot be preempted by this CPU submission budget.
          maxPagesPerFrame: Math.min(frame.samples, 64),
          maxFrameCpuMilliseconds: frame.maxFrameCpuMilliseconds ?? 2,
          isPageReady: (id) => this.isPageReady(id, false),
        })
      );
      // Completed corridors are independent publications. An unfinished sibling
      // must not expose its running mean or replace an already published shadow.
      if (progress) this.renderContent(camera, null, frame.samples);
      // After base coverage exists, a refining sibling must not starve an
      // already-ready corridor. Hard publication still runs first each frame.
      return (
        progress && {
          ...progress,
          settled: progress.settled && !hard.needsRepaint,
          needsRepaint: progress.needsRepaint || hard.needsRepaint,
        }
      );
    });
    if (!result) {
      this.accumulationSettled = false;
      return null;
    }
    // A failed/budget-delayed soft publication can be the last outstanding
    // work. Its retry must wake the scene even with idle geometry and camera.
    // Previously only the hard pass armed this timer, stranding soft pages.
    const retryAfterMs =
      "retryAfterMs" in result ? result.retryAfterMs : undefined;
    if (retryAfterMs !== undefined && this.hardRetryTimer === null) {
      this.hardRetryTimer = globalThis.setTimeout(() => {
        this.hardRetryTimer = null;
        this.host.requestRepaint?.();
      }, Math.max(1, retryAfterMs));
    }
    const becameSettled = result.settled && !this.accumulationSettled;
    this.accumulationSettled = result.settled;
    // The host schedules idle work on transitions, not every settled blit.
    return {
      ...result,
      settled: becameSettled,
    };
  }

  render(
    camera: THREE.Camera,
    round: number | null,
    samples: number,
    refreshHard = true
  ) {
    if (this.pages.accumulationPages.length === 0) return false;
    this.renderWithHost(camera, () => {
      if (refreshHard) this.captureHard(camera);
      this.renderContent(camera, round, samples, !refreshHard);
    });
    return true;
  }

  cancelPending(solarChanged = false) {
    this.accumulation.cancelPending();
    if (solarChanged) this.accumulation.presentation.beginSolarTransition();
    this.pausePending();
  }

  /** Suspend scheduling, retaining the current corridor's accumulated samples. */
  pausePending() {
    this.accumulation.pausePending();
    if (this.hardRetryTimer !== null) {
      globalThis.clearTimeout(this.hardRetryTimer);
      this.hardRetryTimer = null;
    }
    this.accumulationSettled = false;
  }

  private isPageReady(id: string, hard: boolean) {
    const geometry = this.pages.getPageGeometry(id);
    if (!geometry) return false;
    // New receivers need their sunward casters at the current LOD before their
    // first hard draw, including after motion. Only the soft pass waits for
    // final error. Existing captures remain replayable while a new stage loads.
    return (
      !this.host.isCorridorReady ||
      this.host.isCorridorReady(
        geometry.casterBounds,
        hard
          ? this.host.receiverStageError?.(geometry.receiverBounds)
          : undefined,
        geometry.receiverBounds
      )
    );
  }

  private captureHard(camera: THREE.Camera) {
    if (this.casterRevisionsDirty && this.host.corridorRevision) {
      const pages = this.pages.accumulationPages;
      const started = performance.now();
      let processed = 0;
      // Bound publication audits per frame; retain the common early hard draw
      // while the remaining corridor proofs are checked on subsequent frames.
      while (this.casterRevisionCursor < pages.length) {
        if (
          processed >= 4 ||
          (processed > 0 && performance.now() - started >= 4)
        ) {
          this.host.requestRepaint?.();
          return { published: 0, needsRepaint: true };
        }
        const page = pages[this.casterRevisionCursor++];
        processed += 1;
        const geometry = this.pages.getPageGeometry(page.id);
        if (!geometry) continue;
        const revision = this.host.corridorRevision(
          geometry.casterBounds,
          // Hard readiness and provenance must describe the same committed
          // receiver stage, including its offscreen caster replacements.
          this.host.receiverStageError?.(geometry.receiverBounds),
          geometry.receiverBounds
        );
        if (this.pages.setCasterRevision(page.id, revision))
          this.frameCache.invalidate();
      }
      // Publication deltas and changed receiver/sun plans are the inputs to
      // caster provenance. Advancing another solar sample changes neither.
      // Readiness still runs independently, including pending metadata loads.
      this.casterRevisionsDirty = false;
      this.casterRevisionCursor = 0;
    }
    const result = this.accumulation.presentation.capture(this.scene, () =>
      this.accumulation.renderHard(camera, this.pages, {
        ...this.lastFrame,
        width: this.viewport.x,
        height: this.viewport.y,
        viewKey: this.viewKey,
        styleEpoch: this.lastFrame?.styleEpoch ?? 0,
        samples: 1,
        active: true,
        isPageReady: (id) => this.isPageReady(id, true),
      })
    );
    if (result.needsRepaint) this.host.requestRepaint?.();
    if (result.retryAfterMs !== undefined && this.hardRetryTimer === null) {
      this.hardRetryTimer = globalThis.setTimeout(() => {
        this.hardRetryTimer = null;
        this.host.requestRepaint?.();
      }, result.retryAfterMs);
    }
    return result;
  }

  private renderContent(
    camera: THREE.Camera,
    round: number | null,
    samples: number,
    replayOnly = false
  ) {
    const pages = this.accumulation.capturePages;
    this.accumulation.presentation.beginFrame(pages);
    const states = pages.map((page) => {
      // Readiness gates a NEW publication, not the already committed surface.
      // Keep a compatible completed capture while its replacement loads. An
      // unknown receiver without that capture must still wait for its casters.
      const replay = this.accumulation.presentation.canPresent(page);
      return {
        page,
        replay,
        ready:
          replay ||
          ((!this.host.corridorRevision || !this.casterRevisionsDirty) &&
            this.isPageReady(page.id, true)),
      };
    });
    let incomplete = false;
    const draw = () => {
      this.presentedPageIds.clear();
      // One common hard pass supplies all uncovered/disoccluded receiver pixels.
      // Replaying a finite-disc mask below is colour-only: no page depth rebuild,
      // no sample-variant change, and no loss of the retained soft result on drag.
      const lightVisible = this.host.light.visible;
      const replayCaptured =
        round === null && states.some(({ replay }) => replay);
      this.host.light.visible = true;
      try {
        // Mesh residency is independent of shadow publication readiness. During
        // a solar transition a new page may have no retained capture yet: still
        // draw the loaded scene with the common hard-shadow light, then overlay
        // retained/completed corridor masks. Never publish a sky-only hole.
        let batched: ReadonlySet<string> = new Set();
        if (round === null) {
          batched = this.accumulation.presentation.renderNative(
            this.scene,
            states.filter((state) => state.replay).map((state) => state.page),
            () => this.renderer.render(this.scene, camera)
          );
        } else {
          this.renderer.render(this.scene, camera);
        }
        for (const { page, replay, ready } of states) {
          if (!ready) continue;
          if (batched.has(page.id)) {
            this.presentedPageIds.add(page.id);
            continue;
          }
          if (round === null && !replay) {
            // The common hard draw above already covers this surface. Building
            // its uncached page depth AGAIN here, on every presentation, races
            // the bounded renderHard queue and starves finite-disc integration.
            // Only captureHard publishes reusable hard pages; replay them when
            // available. Explicit diagnostic sample rounds remain unchanged.
            this.presentedPageIds.add(page.id);
            continue;
          }
          if (replayOnly && !replay) {
            this.presentedPageIds.add(page.id);
            continue;
          }
          // Retained hard/soft masks need live colour lighting, not another
          // per-corridor depth render. Establish the common light above also
          // while stationary; leave it off for pages that still need sampling.
          const colorOnly = replayOnly || (replayCaptured && replay);
          this.host.light.visible = colorOnly;
          const rendered = this.accumulation.presentation.render(
            this.scene,
            page,
            samples,
            () =>
              colorOnly
                ? this.pages.renderPageColor(camera, page.id)
                : this.pages.renderPageSample(
                    camera,
                    page.id,
                    round ?? 0,
                    round === null ? 1 : samples
                  )
          );
          if (rendered) this.presentedPageIds.add(page.id);
          else incomplete = true;
        }
      } finally {
        this.host.light.visible = lightVisible;
      }
    };
    // Only idle, exact-view presentation is memoized. Solar-disc integration
    // above still advances per corridor, independent of this volatile image.
    // Sky/debug overlays remain live outside this cache. Non-progressive/moving
    // draws retain the original path and never reuse a stale camera snapshot.
    if (
      this.lastFrame?.active &&
      round === null &&
      this.accumulation.presentation.supportsCapture
    ) {
      const key = JSON.stringify([
        this.viewKey,
        camera.projectionMatrix.elements,
        camera.matrixWorldInverse.elements,
        camera.layers.mask,
        this.lastFrame.styleEpoch,
        this.host.visualEpoch?.() ?? 0,
        this.accumulation.presentation.revision,
        states.map(({ page, replay, ready }) => [
          page.id,
          page.contentKey ?? page.revision,
          replay,
          ready,
        ]),
      ]);
      this.frameCache.render(
        key,
        this.lastFrame.width,
        this.lastFrame.height,
        draw
      );
      if (incomplete) this.frameCache.invalidate();
    } else {
      this.frameCache.invalidate();
      draw();
    }
    const presented = states
      .filter(
        ({ page, replay }) =>
          this.presentedPageIds.has(page.id) &&
          (this.accumulation.presentation.hasAtLeast(page, 1) ||
            (!replay && (round === null || samples === 1)))
      )
      .map(({ page }) => page);
    // A compatible OLD capture preserves display continuity, but cannot release
    // a newly committed geometry stage. Acknowledge only its current shadow or
    // a successful direct hard draw, after the complete presentation succeeded.
    if (presented.length > 0) this.host.onPresentedPages?.(presented, pages);
  }

  private renderWithHost<T>(camera: THREE.Camera, renderContent: () => T): T {
    const { renderer, host } = this;
    const lightVisible = host.light.visible;
    const skyVisible = host.sky.visible;
    const overlayVisible = host.overlay.visible;
    const autoClear = renderer.autoClear;
    host.light.visible = false;
    renderer.autoClear = false;
    try {
      // The map host or accumulator owns clearing and the depth range.
      if (skyVisible) this.renderHostObject(host.sky, camera);
      host.sky.visible = false;
      host.overlay.visible = false;
      const result = renderContent();
      // Null is the progressive fallback: the caller still has to draw content.
      if (result !== null && overlayVisible) {
        host.overlay.visible = true;
        this.renderHostObject(host.overlay, camera);
      }
      return result;
    } finally {
      renderer.autoClear = autoClear;
      host.light.visible = lightVisible;
      host.sky.visible = skyVisible;
      host.overlay.visible = overlayVisible;
    }
  }

  private renderHostObject(object: THREE.Object3D, camera: THREE.Camera) {
    const hidden = this.scene.children.filter(
      (child) => child !== object && child.visible
    );
    for (const child of hidden) child.visible = false;
    try {
      this.renderer.render(this.scene, camera);
    } finally {
      for (const child of hidden) child.visible = true;
    }
  }

  get stats(): TiledShadowStats & {
    framePresentation: SceneFrameCache["stats"];
    idlePrewarm?: ShadowIdlePageStats;
    corridorAudit?: readonly ReturnType<typeof auditShadowCorridor>[];
  } {
    return {
      ...this.pages.stats,
      framePresentation: this.frameCache.stats,
      corridorAccumulation: {
        retained: this.accumulation.presentation.stats,
        pageSamples: this.accumulation.pageProgress,
        memoryBytes: this.accumulation.memoryBytes,
        fallbackReason: this.accumulation.fallbackReason,
      },
      ...(this.idleStats ? { idlePrewarm: this.idleStats } : {}),
      ...(this.host.auditCorridors
        ? {
            corridorAudit: this.host.auditCorridors(
              this.pages.accumulationPages.flatMap((page) => {
                const geometry = this.pages.getPageGeometry(page.id);
                return geometry
                  ? [
                      {
                        id: page.id,
                        casterBounds: geometry.casterBounds,
                        receiverBounds: geometry.receiverBounds,
                      },
                    ]
                  : [];
              })
            ),
          }
        : {}),
    };
  }

  dispose() {
    if (this.hardRetryTimer !== null)
      globalThis.clearTimeout(this.hardRetryTimer);
    this.hardRetryTimer = null;
    this.accumulation.dispose();
    this.frameCache.dispose();
    this.persistentCache.dispose();
    this.pages.dispose();
  }
}
