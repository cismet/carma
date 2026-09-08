import * as THREE from "three";

import type { SharedThreeSceneFrame } from "@carma-mapping/engines/maplibre";

import type { ShadowReceiverCell } from "../core/shadow-page-plan";
import type {
  TiledShadowLighting,
  ShadowPrewarmPage,
  TiledShadowStats,
  ShadowPrewarmResult,
} from "./tiled-shadow-renderer";
import { TiledShadowRenderer } from "./tiled-shadow-renderer";
import {
  prewarmShadowPages,
  type ShadowCasterLease,
  type ShadowIdlePageStats,
} from "./shadow-idle-pages";
import { yieldShadowIdleTask } from "./shadow-idle-prefetch";
import { ShadowCorridorAccumulator } from "./shadow-corridor-accumulator";

/** Map-host adapter: same page engine as the standalone story, but sky and
 * debug overlays belong to the host and must not paint over earlier pages.
 */
export class ShadowTiledScene {
  private readonly pages: TiledShadowRenderer;
  private viewKey = "";
  private idleStats: ShadowIdlePageStats | null = null;
  private readonly accumulation: ShadowCorridorAccumulator;
  private accumulationSettled = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly host: Readonly<{
      light: THREE.DirectionalLight;
      sky: THREE.Object3D;
      overlay: THREE.Object3D;
      maximumMapSize: number;
      isCorridorReady?: (bounds: THREE.Box3) => boolean;
      runIdleRender?: (render: () => void) => boolean;
    }>
  ) {
    // Same ceiling as one maximum-size RGBA8+depth32 mono map. No unbounded
    // sample-count multiplier; cached and streamed attachments share this cap.
    this.pages = new TiledShadowRenderer(
      scene,
      renderer,
      host.maximumMapSize ** 2 * 8,
      host.maximumMapSize
    );
    this.accumulation = new ShadowCorridorAccumulator(renderer);
  }

  update(
    cells: readonly ShadowReceiverCell[],
    frame: SharedThreeSceneFrame,
    lighting: TiledShadowLighting,
    targetPixels: number
  ) {
    const key = JSON.stringify([
      cells.map(({ id, bounds }) => [id, bounds.min, bounds.max]),
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
      lighting
    );
    this.viewKey = key;
  }

  /** Unknown external scene changes still require a full invalidation. Raster
   * publications provide old-union-new geometry bounds, including removed tiles.
   */
  invalidateContent(changedBounds?: readonly THREE.Box3[]) {
    if (!changedBounds) this.pages.clearCache();
    else
      for (const bounds of changedBounds) this.pages.invalidateCasters(bounds);
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

  renderProgressive(
    camera: THREE.Camera,
    frame: Parameters<ShadowCorridorAccumulator["render"]>[2]
  ) {
    const result = this.renderWithHost(camera, () => {
      this.accumulation.presentation.beginFrame(this.pages.accumulationPages);
      const isPageReady = (id: string) =>
        !this.host.isCorridorReady ||
        this.pages.areCastersReady(id, this.host.isCorridorReady);
      const progress = this.accumulation.presentation.capture(this.scene, () =>
        this.accumulation.render(camera, this.pages, {
          ...frame,
          visibilityOnly: true,
          isPageReady,
        })
      );
      // Completed corridors are independent publications. An unfinished sibling
      // must not expose its running mean or replace an already published shadow.
      if (progress) this.renderContent(camera, null, frame.samples);
      return progress;
    });
    if (!result) {
      this.accumulationSettled = false;
      return null;
    }
    const becameSettled = result.settled && !this.accumulationSettled;
    this.accumulationSettled = result.settled;
    // The host schedules idle work on transitions, not every settled blit.
    return { ...result, settled: becameSettled };
  }

  render(camera: THREE.Camera, round: number | null, samples: number) {
    this.renderWithHost(camera, () =>
      this.renderContent(camera, round, samples)
    );
  }

  private renderContent(
    camera: THREE.Camera,
    round: number | null,
    samples: number
  ) {
    const pages = this.pages.accumulationPages;
    this.accumulation.presentation.beginFrame(pages);
    for (const page of pages) {
      this.accumulation.presentation.render(this.scene, page, samples, () =>
        this.pages.renderPageSample(
          camera,
          page.id,
          round ?? 0,
          round === null ? 1 : samples
        )
      );
    }
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

  get stats(): TiledShadowStats & { idlePrewarm?: ShadowIdlePageStats } {
    return {
      ...this.pages.stats,
      corridorAccumulation: {
        retained: this.accumulation.presentation.stats,
        pageSamples: this.accumulation.pageProgress,
        memoryBytes: this.accumulation.memoryBytes,
        fallbackReason: this.accumulation.fallbackReason,
      },
      ...(this.idleStats ? { idlePrewarm: this.idleStats } : {}),
    };
  }

  dispose() {
    this.accumulation.dispose();
    this.pages.dispose();
  }
}
