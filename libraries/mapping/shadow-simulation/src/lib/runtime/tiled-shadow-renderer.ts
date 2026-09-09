import * as THREE from "three";

import {
  planShadowReceiverPages,
  shadowReceiverCorners,
  shadowReceiverCorridor,
  shadowReceiverPixelsPerMeter,
  shadowReceiverScreenBounds,
  type ShadowReceiverCell,
  type ShadowReceiverPage,
} from "../core/shadow-page-plan";
import {
  ShadowController,
  SUN_ANGULAR_RADIUS_RAD,
  type ShadowUpdate,
} from "./shadow-controller";
import {
  ShadowDepthPageCache,
  disposeShadowDepthPage,
  shadowDepthPageBytes,
} from "./shadow-depth-page-cache";

export type TiledShadowLighting = Pick<
  ShadowUpdate,
  | "directionToSun"
  | "color"
  | "intensity"
  | "shadowIntensity"
  | "maxReceiverBiasMeters"
>;

type Page = {
  controller: ShadowController;
  projectionKey: string;
  lightingKey: string;
  presentationKey: string;
  corridor: THREE.Box3;
  planes: THREE.Plane[];
  width: number;
  height: number;
  limited: boolean;
  screenBounds: THREE.Vector4;
  receiverBounds: THREE.Box3;
  groundTexelTargetMeters: number;
  casterBounds: THREE.Box3;
  contentRevision: number;
  casterRevision: string | null;
};

export type ShadowPrewarmPage = Readonly<{
  id: string;
  receiverBounds: THREE.Box3;
  casterBounds: THREE.Box3;
  width: number;
  height: number;
  samples: number;
  cachedSamples: number;
  /** Total resident samples reachable with this page's fair share of spare bytes. */
  sampleBudget: number;
  limited: boolean;
  /** At least one missing direction fits now, without evicting any entry. */
  canPrewarm: boolean;
}>;

export type ShadowPrewarmResult = Readonly<{
  pageId: string;
  rendered: 0 | 1;
  cachedSamples: number;
  totalSamples: number;
  complete: boolean;
  budgetLimited: boolean;
  aborted: boolean;
}>;

const MAX_PREWARM_PAGES = 16;
// Empty ArrayCamera dispatches the production shadow pass but no colour views.
// A 1×1 colour-only sink also avoids resolves/output passes on the host target.
const PREWARM_SINK_BYTES = 4;

export type TiledShadowStats = Readonly<{
  pages: number;
  /** Active and warm resident sample variants share the same GPU budget. */
  cachedSamplePages: number;
  cacheBytes: number;
  scratchBytes: number;
  hits: number;
  misses: number;
  depthRenders: number;
  colorPasses: number;
  limitedPages: number;
  dimensions: readonly string[];
  corridorAccumulation?: Readonly<{
    retained?: Readonly<{
      pages: number;
      samples: number;
      matchingPages: number;
      replays: number;
      bytes: number;
    }>;
    pageSamples: readonly Readonly<{
      id: string;
      samples: number;
      totalSamples: number;
      ready: boolean;
      published: boolean;
    }>[];
    memoryBytes: number;
    fallbackReason: string | null;
  }>;
}>;

export type ShadowPageLevel = Readonly<{
  id: string;
  /** Coarsening of the larger axis relative to the effective maximum size. */
  level: number;
  width: number;
  height: number;
}>;

export type ShadowAccumulationPage = Readonly<{
  id: string;
  revision: string;
  /** Physical dependency identity, independent of depth-buffer sizing. */
  contentKey?: string;
  /** Stable sun/receiver identity for displaying the last completed result
   * while geometry, buffer size or sample-budget replacements are pending. */
  presentationKey?: string;
  screenBounds: THREE.Vector4;
  receiverBounds: THREE.Box3;
  /** Observer demand used to allocate an independent full-tile capture. */
  groundTexelTargetMeters?: number;
  /** Source-relative capture orientation/allocation, excluding scene origin. */
  captureKey?: string;
  /** False blocks refinement only, never first-fill or retained presentation. */
  ready?: boolean;
}>;

/** Reference page renderer using the PRODUCTION ShadowController, standard
 * Three PCF shadows and the host's HDR accumulator. No independent sun shader.
 *
 * Receiver clipping partitions the colour passes; global clipping deliberately
 * does not clip the shadow pass (Three's public global-clipping contract).
 * Thus terrain AND arbitrary meshes occlude each sample before accumulation.
 * Multipass colour cost is an explicit prototype limitation to benchmark before
 * replacing the Geoportal viewport path. Materials must support global clipping;
 * receiver cells must cover all visible surfaces without overlapping interiors.
 * WebGL submissions remain serial on the renderer owner, never worker-owned.
 */
export class TiledShadowRenderer {
  // Insertion order tracks most recent visibility, including warm pages.
  private pages = new Map<string, Page>();
  private activePageIds = new Set<string>();
  private activeSamples = 1;
  private prewarmPageIds = new Set<string>();
  private prewarmSamples = 1;
  private prewarmRevision = 0;
  private prewarmSink: THREE.WebGLRenderTarget | null = null;
  private readonly prewarmCamera = new THREE.ArrayCamera([]);
  private cache = new ShadowDepthPageCache();
  private scratchBytes = 0;
  private depthRenders = 0;
  private colorPasses = 0;
  private disposed = false;
  private streamedTarget: THREE.RenderTarget | null = null;
  private readonly maxMapSize: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly memoryBudgetBytes: number,
    maximumMapSize = 4096
  ) {
    if (
      !Number.isFinite(memoryBudgetBytes) ||
      !(memoryBudgetBytes >= shadowDepthPageBytes(64, 64))
    ) {
      throw new RangeError(
        "Shadow page budget must fit at least one 64-square page"
      );
    }
    if (!Number.isFinite(maximumMapSize) || maximumMapSize < 64) {
      throw new RangeError(
        "Maximum shadow page size must be finite and at least 64"
      );
    }
    if (renderer.shadowMap.type !== THREE.PCFShadowMap) {
      throw new Error(
        "Tiled shadow reference requires the shared PCF shadow path"
      );
    }
    // Bound the transient allocation too, not only the retained cache.
    this.maxMapSize = Math.max(
      64,
      2 **
        Math.floor(
          Math.log2(
            Math.min(
              maximumMapSize,
              renderer.capabilities.maxTextureSize,
              Math.sqrt(memoryBudgetBytes / 8)
            )
          )
        )
    );
  }

  setView(
    cells: readonly ShadowReceiverCell[],
    camera: THREE.Camera,
    viewport: THREE.Vector2,
    targetPixels: number,
    lighting: TiledShadowLighting,
    receiverBiasLimit?: (
      bounds: THREE.Box3,
      groundTexelTargetMeters: number
    ) => number
  ) {
    if (this.disposed) return;
    this.clearPrewarmView();
    if (
      ![
        lighting.directionToSun.x,
        lighting.directionToSun.y,
        lighting.directionToSun.z,
      ].every(Number.isFinite) ||
      lighting.directionToSun.lengthSq() === 0 ||
      lighting.directionToSun.y <= 0
    ) {
      throw new RangeError(
        "Tiled shadow reference requires a finite sun direction above the horizon"
      );
    }
    const plans = planShadowReceiverPages(
      cells,
      camera,
      viewport,
      targetPixels
    );
    this.activePageIds = new Set(plans.map(({ id }) => id));
    for (const plan of plans)
      this.configurePage(plan, lighting, receiverBiasLimit);
    const retainedPageLimit = Math.max(32, this.activePageIds.size * 2);
    for (const [id, page] of this.pages) {
      if (this.pages.size <= retainedPageLimit) break;
      if (this.activePageIds.has(id)) continue;
      this.cache.invalidate(id);
      page.controller.dispose();
      this.pages.delete(id);
    }
    this.updateActiveVariants();
    this.scratchBytes = Math.max(
      0,
      ...Array.from(this.activePageIds, (id) => {
        const page = this.pages.get(id)!;
        return shadowDepthPageBytes(page.width, page.height);
      })
    );
    if (
      this.streamedTarget &&
      shadowDepthPageBytes(
        this.streamedTarget.width,
        this.streamedTarget.height
      ) > this.scratchBytes
    ) {
      disposeShadowDepthPage(this.streamedTarget);
      this.streamedTarget = null;
    }
    this.cache.setBudget(this.memoryBudgetBytes, this.reservedBytes);
  }

  /** Reproject retained world-space pages during observer motion without
   * changing their shadow projection, geometry revision or cached samples. */
  updatePresentation(camera: THREE.Camera) {
    if (this.disposed) return;
    camera.updateMatrixWorld(true);
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
    const active = new Set<string>();
    for (const [id, page] of this.pages) {
      if (!frustum.intersectsBox(page.receiverBounds)) continue;
      page.screenBounds.copy(
        shadowReceiverScreenBounds(page.receiverBounds, matrix)
      );
      active.add(id);
    }
    this.activePageIds = active;
    this.updateActiveVariants();
  }

  private get reservedBytes() {
    return this.scratchBytes + (this.prewarmSink ? PREWARM_SINK_BYTES : 0);
  }

  /** Plans only; the caller must acquire complete, visible-to-Three caster
   * coverage for each returned corridor before invoking prewarmNext for it.
   * Demand uses the same Jacobian as visible pages, without frustum culling,
   * at twice the ground spacing. Hardware caps can prevent a class change.
   */
  setPrewarmView(
    cells: readonly ShadowReceiverCell[],
    camera: THREE.Camera,
    viewport: THREE.Vector2,
    targetPixels: number,
    lighting: TiledShadowLighting,
    samples: number
  ) {
    this.clearPrewarmView();
    if (this.disposed) return;
    if (
      !Number.isSafeInteger(samples) ||
      samples < 1 ||
      samples > 4096 ||
      !(targetPixels > 0 && Number.isFinite(targetPixels)) ||
      ![viewport.x, viewport.y].every(
        (value) => value > 0 && Number.isFinite(value)
      ) ||
      !lighting.directionToSun.toArray().every(Number.isFinite) ||
      lighting.directionToSun.y <= 0
    )
      throw new RangeError("Invalid shadow prewarm view");
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    const ids = new Set<string>();
    for (const { id, bounds } of cells) {
      if (
        ids.has(id) ||
        bounds.isEmpty() ||
        ![...bounds.min.toArray(), ...bounds.max.toArray()].every(
          Number.isFinite
        )
      )
        throw new RangeError(
          "Prewarm cells require unique IDs and finite bounds"
        );
      ids.add(id);
    }
    this.prewarmSamples = samples;
    for (const cell of cells) {
      if (this.prewarmPageIds.size >= MAX_PREWARM_PAGES) break;
      if (this.activePageIds.has(cell.id)) continue;
      // Speculation never removes another resident controller or depth target.
      if (
        !this.pages.has(cell.id) &&
        this.pages.size >= Math.max(32, this.activePageIds.size * 2)
      )
        continue;
      this.configurePage(
        {
          ...cell,
          screenBounds: new THREE.Vector4(),
          groundTexelTargetMeters: Math.max(
            1e-9,
            (2 * targetPixels) /
              shadowReceiverPixelsPerMeter(cell.bounds, matrix, viewport)
          ),
        },
        lighting
      );
      this.prewarmPageIds.add(cell.id);
    }
  }

  clearPrewarmView() {
    this.prewarmPageIds.clear();
    this.prewarmRevision += 1;
  }

  get prewarmPages(): readonly ShadowPrewarmPage[] {
    const pages = [...this.prewarmPageIds].map((id) => {
      const page = this.pages.get(id)!;
      const cachedSamples = this.countPrewarmSamples(id, page);
      return {
        id,
        receiverBounds: page.receiverBounds.clone(),
        casterBounds: page.casterBounds.clone(),
        width: page.width,
        height: page.height,
        samples: this.prewarmSamples,
        cachedSamples,
        sampleBudget: cachedSamples,
        limited: page.limited,
        canPrewarm: false,
      };
    });
    let available =
      this.cache.availableBytes - (this.prewarmSink ? 0 : PREWARM_SINK_BYTES);
    // Water-fill by existing sample count, not page order. A tiny budget still
    // admits the first fitting page; unequal dimensions redistribute spare bytes.
    while (available > 0) {
      const eligible = pages
        .filter(
          (page) =>
            page.sampleBudget < page.samples &&
            shadowDepthPageBytes(page.width, page.height) <= available
        )
        .sort((a, b) => a.sampleBudget - b.sampleBudget);
      if (eligible.length === 0) break;
      for (const page of eligible) {
        const bytes = shadowDepthPageBytes(page.width, page.height);
        if (bytes > available) continue;
        page.sampleBudget += 1;
        available -= bytes;
      }
    }
    return pages.map((page) => ({
      ...page,
      canPrewarm: page.sampleBudget > page.cachedSamples,
    }));
  }

  canPrewarm(pageId: string) {
    return (
      !this.disposed &&
      this.prewarmPages.some((page) => page.id === pageId && page.canPrewarm)
    );
  }

  private countPrewarmSamples(id: string, page: Page) {
    const variant = JSON.stringify([
      id,
      page.projectionKey,
      this.prewarmSamples,
    ]);
    let count = 0;
    for (let sample = 0; sample < this.prewarmSamples; sample += 1)
      if (this.cache.has(JSON.stringify([variant, sample]))) count += 1;
    return count;
  }

  /** One direction of ONE explicitly coverage-gated page, never a colour pass.
   * Abort cannot preempt a synchronous GPU submission; its result is discarded
   * if cancelled during submission. A partial sequence is not a soft-shadow map.
   */
  prewarmNext(
    camera: THREE.Camera,
    pageId: string,
    options: { signal?: AbortSignal } = {}
  ): ShadowPrewarmResult {
    const page = this.pages.get(pageId);
    const configured =
      !this.disposed && this.prewarmPageIds.has(pageId) && !!page;
    const result = (
      rendered: 0 | 1,
      budgetLimited = false
    ): ShadowPrewarmResult => {
      const cachedSamples = configured
        ? this.countPrewarmSamples(pageId, page!)
        : 0;
      return {
        pageId,
        rendered,
        cachedSamples,
        totalSamples: configured ? this.prewarmSamples : 0,
        complete: configured && cachedSamples === this.prewarmSamples,
        budgetLimited,
        aborted: options.signal?.aborted === true,
      };
    };
    if (!configured || options.signal?.aborted) return result(0);
    const prewarmRevision = this.prewarmRevision;
    const contentRevision = page!.contentRevision;
    if (this.renderer.shadowMap.type !== THREE.PCFShadowMap)
      throw new Error("Shadow prewarm requires the shared PCF shadow path");
    const variant = JSON.stringify([
      pageId,
      page!.projectionKey,
      this.prewarmSamples,
    ]);
    let sample = 0;
    while (
      sample < this.prewarmSamples &&
      this.cache.has(JSON.stringify([variant, sample]))
    )
      sample += 1;
    if (sample === this.prewarmSamples) return result(0);
    if (!this.canPrewarm(pageId)) return result(0, true);
    const bytes = shadowDepthPageBytes(page!.width, page!.height);
    if (
      bytes + (this.prewarmSink ? 0 : PREWARM_SINK_BYTES) >
      this.cache.availableBytes
    )
      return result(0, true);
    if (!this.prewarmSink) {
      this.prewarmSink = new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: false,
      });
      this.cache.setBudget(this.memoryBudgetBytes, this.reservedBytes);
    }
    const light = page!.controller.lights[0];
    if (this.prewarmSamples === 1) page!.controller.restoreSunDiscCenter();
    else page!.controller.applySunDiscSample(sample, this.prewarmSamples);
    light.shadow.map = null;
    light.shadow.needsUpdate = true;
    const wasVisible = light.visible;
    light.visible = true;
    // Same caster layer filter and sun-frustum path as normal renderer.render.
    this.prewarmCamera.layers.mask = camera.layers.mask;
    this.prewarmCamera.matrixAutoUpdate = false;
    this.prewarmCamera.matrixWorldAutoUpdate = false;
    this.prewarmCamera.matrixWorld.copy(camera.matrixWorld);
    this.prewarmCamera.matrixWorldInverse.copy(camera.matrixWorldInverse);
    this.prewarmCamera.projectionMatrix.copy(camera.projectionMatrix);
    let rendered: 0 | 1 = 0;
    try {
      this.renderPrewarmDepth(light);
      const target = light.shadow.map;
      if (target) {
        rendered = 1;
        this.depthRenders += 1;
        if (
          options.signal?.aborted ||
          prewarmRevision !== this.prewarmRevision ||
          contentRevision !== page!.contentRevision ||
          !this.prewarmPageIds.has(pageId) ||
          !this.cache.admit(
            JSON.stringify([variant, sample]),
            pageId,
            target,
            variant,
            { evictInactive: false }
          )
        )
          disposeShadowDepthPage(target);
      }
    } catch (error) {
      if (light.shadow.map) disposeShadowDepthPage(light.shadow.map);
      throw error;
    } finally {
      light.visible = wasVisible;
      light.shadow.map = null;
    }
    return result(rendered);
  }

  private renderPrewarmDepth(activeLight: THREE.Light) {
    // Decision TSP-07: output/shadow-prewarm-20260907/README.md. Keep Three's
    // clipping/render-state setup; an external host must dirty its own cached
    // program/VAO/texture bindings afterward, beyond the native state saved here.
    const { renderer, scene } = this;
    // This renderer requires WebGL2 (float receiver/depth targets). Three's
    // installed declaration still exposes the legacy WebGL1 context union.
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const target = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace();
    const mipLevel = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const framebuffer = gl.getParameter(
      gl.DRAW_FRAMEBUFFER_BINDING
    ) as WebGLFramebuffer | null;
    const readFramebuffer = gl.getParameter(
      gl.READ_FRAMEBUFFER_BINDING
    ) as WebGLFramebuffer | null;
    const nativeViewport = new THREE.Vector4().fromArray(
      gl.getParameter(gl.VIEWPORT)
    );
    const nativeScissor = new THREE.Vector4().fromArray(
      gl.getParameter(gl.SCISSOR_BOX)
    );
    const nativeScissorTest = gl.isEnabled(gl.SCISSOR_TEST);
    const depthTest = gl.isEnabled(gl.DEPTH_TEST);
    const depthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
    const depthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    const depthFunc = gl.getParameter(gl.DEPTH_FUNC) as number;
    const depthClear = gl.getParameter(gl.DEPTH_CLEAR_VALUE) as number;
    const colorClear = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;
    const colorMask = gl.getParameter(gl.COLOR_WRITEMASK) as boolean[];
    const clipping = renderer.clippingPlanes;
    const autoClear = renderer.autoClear;
    const background = scene.background;
    const xrEnabled = renderer.xr.enabled;
    const shadowEnabled = renderer.shadowMap.enabled;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    const otherShadowLights: THREE.Light[] = [];
    scene.traverse((object) => {
      const light = object as THREE.Light;
      if (light.isLight && light.castShadow && light !== activeLight)
        otherShadowLights.push(light);
    });
    try {
      renderer.resetState();
      renderer.autoClear = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = true;
      for (const light of otherShadowLights) light.castShadow = false;
      scene.background = null;
      renderer.clippingPlanes = clipping;
      renderer.setRenderTarget(this.prewarmSink);
      // Independent of the MapLibre bridge's active render callback lifetime.
      gl.depthRange(0, 1);
      renderer.render(scene, this.prewarmCamera);
    } finally {
      renderer.clippingPlanes = clipping;
      renderer.autoClear = autoClear;
      renderer.xr.enabled = xrEnabled;
      renderer.shadowMap.enabled = shadowEnabled;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      for (const light of otherShadowLights) light.castShadow = true;
      scene.background = background;
      // Reset Three's cached GL assumptions before restoring the caller's
      // framebuffer/depth state (which can belong to MapLibre, not a Three RT).
      renderer.resetState();
      renderer.setRenderTarget(target, cubeFace, mipLevel);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
      renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
      renderer.state.viewport(nativeViewport);
      renderer.state.scissor(nativeScissor);
      renderer.state.setScissorTest(nativeScissorTest);
      if (depthTest) renderer.state.enable(gl.DEPTH_TEST);
      else renderer.state.disable(gl.DEPTH_TEST);
      gl.depthRange(depthRange[0], depthRange[1]);
      gl.depthMask(depthMask);
      gl.depthFunc(depthFunc);
      gl.clearDepth(depthClear);
      gl.clearColor(colorClear[0], colorClear[1], colorClear[2], colorClear[3]);
      gl.colorMask(colorMask[0], colorMask[1], colorMask[2], colorMask[3]);
    }
  }

  private configurePage(
    plan: ShadowReceiverPage,
    lighting: TiledShadowLighting,
    receiverBiasLimit?: (
      bounds: THREE.Box3,
      groundTexelTargetMeters: number
    ) => number
  ) {
    let page = this.pages.get(plan.id);
    if (!page) {
      const controller = new ShadowController(this.scene);
      controller.setMaxShadowMapSize(this.maxMapSize);
      controller.setSoftSun(true);
      page = {
        controller,
        projectionKey: "",
        lightingKey: "",
        presentationKey: "",
        corridor: new THREE.Box3(),
        planes: [],
        width: 0,
        height: 0,
        limited: false,
        screenBounds: plan.screenBounds,
        receiverBounds: plan.bounds.clone(),
        groundTexelTargetMeters: plan.groundTexelTargetMeters,
        casterBounds: new THREE.Box3(),
        contentRevision: 0,
        casterRevision: null,
      };
    }
    this.pages.delete(plan.id);
    this.pages.set(plan.id, page);
    const snapshot = page.controller.update({
      ...lighting,
      maxReceiverBiasMeters: receiverBiasLimit
        ? receiverBiasLimit(plan.bounds, plan.groundTexelTargetMeters)
        : lighting.maxReceiverBiasMeters,
      receiverWorldPoints: shadowReceiverCorners(plan.bounds),
      receiverAnchorWorldPosition: plan.bounds.getCenter(new THREE.Vector3()),
      minimumElevationMeters: plan.bounds.min.y,
      maximumElevationMeters: plan.bounds.max.y,
      quality: 4,
      groundTexelFit: true,
      groundTexelTargetMeters: plan.groundTexelTargetMeters,
    });
    if (!snapshot) return;
    const light = page.controller.lights[0];
    light.visible = false;
    const c = snapshot.camera;
    const projectionKey = JSON.stringify([
      c.viewMatrixElements,
      c.projectionMatrixElements,
      c.shadowMapWidth,
      c.shadowMapHeight,
      light.shadow.bias,
      light.shadow.normalBias,
      plan.bounds.min,
      plan.bounds.max,
    ]);
    page.projectionKey = projectionKey;
    page.lightingKey = JSON.stringify([
      lighting.directionToSun,
      lighting.shadowIntensity,
      plan.bounds.min,
      plan.bounds.max,
    ]);
    page.presentationKey = JSON.stringify([
      lighting.directionToSun,
      lighting.shadowIntensity,
      plan.bounds.min.x,
      plan.bounds.min.z,
      plan.bounds.max.x,
      plan.bounds.max.z,
    ]);
    page.receiverBounds.copy(plan.bounds);
    page.groundTexelTargetMeters = plan.groundTexelTargetMeters;
    page.screenBounds = plan.screenBounds;
    page.width = c.shadowMapWidth;
    page.height = c.shadowMapHeight;
    page.limited =
      (c.groundTexelWidthMeters ?? Infinity) >
        plan.groundTexelTargetMeters * 1.001 ||
      (c.groundTexelHeightMeters ?? Infinity) >
        plan.groundTexelTargetMeters * 1.001;
    // Older sun/projection variants retain their caster dependencies too.
    // A conservative union may over-invalidate, but cannot reuse stale depth.
    page.casterBounds.copy(
      shadowReceiverCorridor(
        plan.bounds,
        lighting.directionToSun,
        snapshot.casterReachMeters +
          plan.bounds.getSize(new THREE.Vector3()).length(),
        SUN_ANGULAR_RADIUS_RAD,
        c.guardMeters
      )
    );
    page.corridor.union(page.casterBounds);
    page.planes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -plan.bounds.min.x),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), plan.bounds.max.x),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -plan.bounds.min.z),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), plan.bounds.max.z),
    ];
  }

  /** Pass old UNION new bounds on movement/removal/source replacement. Also
   * call for newly available geometry: absent casters are dependencies too.
   */
  invalidateCasters(changedBounds: THREE.Box3): readonly string[] {
    const affected: string[] = [];
    for (const [id, page] of this.pages) {
      if (!page.corridor.intersectsBox(changedBounds)) continue;
      page.contentRevision += 1;
      this.cache.invalidate(id);
      affected.push(id);
    }
    return affected;
  }

  /** Readiness can change after decode without another bounds change. A newly
   * complete cut must replace the early hard mask, not wait for the disc pass.
   * Pending refinement retains the last complete publication. */
  setCasterRevision(id: string, revision: string | null): boolean {
    const page = this.pages.get(id);
    if (!page || revision === null || page.casterRevision === revision)
      return false;
    page.casterRevision = revision;
    page.contentRevision += 1;
    this.cache.invalidate(id);
    return true;
  }

  /** The host owns the target/clear/accumulation. Every visible receiver page
   * is rendered for this exact disc sample; no centre-sun mask substitution.
   */
  renderSample(camera: THREE.Camera, sample: number, samples: number) {
    this.renderSamples(camera, this.activePageIds, sample, samples);
  }

  /** One corridor's full RGB lighting, using the same production depth cache. */
  renderPageSample(
    camera: THREE.Camera,
    pageId: string,
    sample: number,
    samples: number,
    screenBounds?: THREE.Vector4
  ): boolean {
    if (this.disposed || !this.activePageIds.has(pageId)) return false;
    this.renderSamples(camera, [pageId], sample, samples, screenBounds);
    return true;
  }

  get accumulationPages(): readonly ShadowAccumulationPage[] {
    return [...this.activePageIds].map((id) => {
      const page = this.pages.get(id)!;
      const light = page.controller.lights[0];
      return {
        id,
        contentKey: JSON.stringify([page.lightingKey, page.contentRevision]),
        presentationKey: page.presentationKey,
        revision: JSON.stringify([
          page.projectionKey,
          page.contentRevision,
          light.color.toArray(),
          light.intensity,
          light.shadow.intensity,
        ]),
        screenBounds: page.screenBounds.clone(),
        receiverBounds: page.receiverBounds.clone(),
        groundTexelTargetMeters: page.groundTexelTargetMeters,
      };
    });
  }

  areCastersReady(id: string, ready: (bounds: THREE.Box3) => boolean): boolean {
    const page = this.pages.get(id);
    return Boolean(page && ready(page.casterBounds));
  }

  getPageGeometry(id: string): Readonly<{
    casterBounds: THREE.Box3;
    receiverBounds: THREE.Box3;
    width: number;
    height: number;
    /** Scene-local diagnostic identity; do not persist without rebasing. */
    projectionKey: string;
  }> | null {
    const page = this.pages.get(id);
    return page
      ? {
          casterBounds: page.casterBounds.clone(),
          receiverBounds: page.receiverBounds.clone(),
          width: page.width,
          height: page.height,
          projectionKey: page.projectionKey,
        }
      : null;
  }

  /** A single visible depth cannot partition translucent colour contributions. */
  get supportsOpaqueAccumulation(): boolean {
    let supported = true;
    this.scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        if (
          material.visible &&
          (material.transparent || !material.depthWrite || !material.depthTest)
        )
          supported = false;
      }
    });
    return supported;
  }

  private renderSamples(
    camera: THREE.Camera,
    pageIds: Iterable<string>,
    sample: number,
    samples: number,
    screenBounds?: THREE.Vector4
  ) {
    if (this.disposed) return;
    if (this.renderer.shadowMap.type !== THREE.PCFShadowMap) {
      throw new Error(
        "Shadow page cache must be recreated after changing the depth/filter format"
      );
    }
    if (
      !Number.isInteger(samples) ||
      samples < 1 ||
      !Number.isInteger(sample) ||
      sample < 0 ||
      sample >= samples
    ) {
      throw new RangeError(
        "Shadow sample must lie within its finite-disc sequence"
      );
    }
    if (samples !== this.activeSamples) {
      this.activeSamples = samples;
      this.updateActiveVariants();
    }
    const { renderer, scene } = this;
    // The host selects the same receiver policy for mono and tiled rendering.
    // DEM keeps stock PCF; meshes may use receiver-plane correction with actual
    // geometry normals. See MESH-CONTACT-BIAS-20260908 in three/TILED_SHADOW_PAGES.md.
    const clipping = renderer.clippingPlanes;
    const autoClear = renderer.autoClear;
    const background = scene.background;
    const sceneTarget = renderer.getRenderTarget();
    const previousScissor = sceneTarget?.scissor.clone();
    const previousScissorTest = sceneTarget?.scissorTest;
    renderer.autoClear = false;
    // A sky/background is the host's one-time pass, never one pass per cell.
    scene.background = null;
    try {
      for (const id of pageIds) {
        const page = this.pages.get(id)!;
        const light = page.controller.lights[0];
        if (samples === 1) page.controller.restoreSunDiscCenter();
        else page.controller.applySunDiscSample(sample, samples);
        const variantId = JSON.stringify([id, page.projectionKey, samples]);
        const key = JSON.stringify([variantId, sample]);
        const cached = this.cache.get(key);
        if (
          !cached &&
          this.streamedTarget &&
          (this.streamedTarget.width !== page.width ||
            this.streamedTarget.height !== page.height)
        ) {
          disposeShadowDepthPage(this.streamedTarget);
          this.streamedTarget = null;
        }
        light.shadow.map = cached ?? this.streamedTarget;
        if (!cached) this.streamedTarget = null;
        light.shadow.needsUpdate = !cached;
        light.visible = true;
        renderer.clippingPlanes = [...clipping, ...page.planes];
        if (sceneTarget) {
          const { x, y, z, w } = screenBounds ?? page.screenBounds;
          const left = Math.floor(x * sceneTarget.width);
          const bottom = Math.floor(y * sceneTarget.height);
          sceneTarget.scissor.set(
            left,
            bottom,
            Math.ceil((x + z) * sceneTarget.width) - left,
            Math.ceil((y + w) * sceneTarget.height) - bottom
          );
          sceneTarget.scissorTest = true;
          // Three restores this target/scissor after its unscissored depth pass.
          // Only colour fill is restricted; no wall/roof caster is excluded.
          renderer.setRenderTarget(sceneTarget);
        }
        try {
          renderer.render(scene, camera);
          this.colorPasses += 1;
          if (!cached && light.shadow.map) {
            this.depthRenders += 1;
            const target = light.shadow.map;
            if (!this.cache.admit(key, id, target, variantId))
              this.streamedTarget = target;
          }
        } catch (error) {
          if (!cached && light.shadow.map)
            disposeShadowDepthPage(light.shadow.map);
          throw error;
        } finally {
          light.visible = false;
          // Cache, not LightShadow.dispose/update, owns retained attachments.
          light.shadow.map = null;
        }
      }
    } finally {
      renderer.clippingPlanes = clipping;
      renderer.autoClear = autoClear;
      scene.background = background;
      if (sceneTarget && previousScissor) {
        sceneTarget.scissor.copy(previousScissor);
        sceneTarget.scissorTest = previousScissorTest ?? false;
        renderer.setRenderTarget(sceneTarget);
      }
    }
  }

  get stats(): TiledShadowStats {
    const activePages = [...this.activePageIds].map(
      (id) => this.pages.get(id)!
    );
    return {
      pages: activePages.length,
      cachedSamplePages: this.cache.count,
      cacheBytes: this.cache.bytes,
      scratchBytes: this.reservedBytes,
      hits: this.cache.hits,
      misses: this.cache.misses,
      depthRenders: this.depthRenders,
      colorPasses: this.colorPasses,
      limitedPages: activePages.filter((p) => p.limited).length,
      dimensions: activePages.map((p) => `${p.width}×${p.height}`),
    };
  }

  clearCache() {
    this.cache.clear();
    for (const page of this.pages.values()) page.contentRevision += 1;
  }

  private updateActiveVariants() {
    this.cache.setActiveVariants(
      new Set(
        [...this.activePageIds].flatMap((id) =>
          // Live presentation still needs centre-sun depth for newly exposed
          // receiver surfaces. Soft integration must not evict that reusable
          // depth on every 1 -> N -> 1 sample-count transition. Once the bounded
          // cache is full, stream additional disc samples as already intended.
          [...new Set([1, this.activeSamples])].map((samples) =>
            JSON.stringify([id, this.pages.get(id)!.projectionKey, samples])
          )
        )
      )
    );
  }

  get pageLevels(): readonly ShadowPageLevel[] {
    return [...this.activePageIds].map((id) => {
      const page = this.pages.get(id)!;
      return {
        id,
        level: Math.max(
          0,
          Math.round(
            Math.log2(this.maxMapSize / Math.max(page.width, page.height))
          )
        ),
        width: page.width,
        height: page.height,
      };
    });
  }

  /** Call on WebGL context loss as well as host teardown. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cache.clear();
    if (this.streamedTarget) disposeShadowDepthPage(this.streamedTarget);
    this.streamedTarget = null;
    this.prewarmSink?.dispose();
    this.prewarmSink = null;
    this.clearPrewarmView();
    this.scratchBytes = 0;
    for (const page of this.pages.values()) page.controller.dispose();
    this.pages.clear();
    this.activePageIds.clear();
  }
}
