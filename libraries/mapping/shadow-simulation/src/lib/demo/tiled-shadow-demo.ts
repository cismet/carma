import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { degToRadNumeric } from "@carma-units";

import { ShadowController } from "../runtime/shadow-controller";
import { ShadowTiledScene } from "../runtime/shadow-tiled-scene";
import {
  createTiledShadowReference,
  type ShadowDemoCaster,
} from "./tiled-shadow-reference";

export type TiledShadowDemoOptions = Readonly<{
  targetPixels: number;
  samples: number;
  elevationDegrees: number;
  maximumMapSize: number;
  renderScale: number;
  panMeters: number;
  caster: ShadowDemoCaster;
  casterLiftMeters: number;
  animateCamera: boolean;
}>;

export type TiledShadowDemoStatus = Readonly<{
  phase: string;
  ready: boolean;
  revision: number;
  startedAt: number;
  revisionStartedAt: number;
  firstFrameAt: number | null;
  settledAt: number | null;
  elapsedMilliseconds: number;
  width: number;
  height: number;
  completedSamples: number;
  completedPages: number;
  totalPages: number;
  stats: ShadowTiledScene["stats"];
  levels: readonly number[];
  cameraPosition: readonly number[];
  cameraTarget: readonly number[];
}>;

/** Standalone host of the addon tiled stack, including receiver publication.
 * Replaces the story-only observer atlas; raw depth-cache benchmarks remain in
 * lower-level modules/tests, not this interactive render path.
 * Decision: three/STORY_VALIDATION.md, SHADOW-STORY-ADDON-PARITY-20260914.
 */
export const createTiledShadowDemo = (
  container: HTMLElement,
  initial: TiledShadowDemoOptions,
  onStatus: (status: TiledShadowDemoStatus) => void
) => {
  const startedAt = performance.now();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.autoClear = false;
  renderer.setClearColor("#8796a5", 1);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
  renderer.domElement.setAttribute(
    "aria-label",
    "Addon shadow corridor scene; drag to orbit or pan"
  );
  container.append(renderer.domElement);
  const reference = createTiledShadowReference();
  const camera = new THREE.PerspectiveCamera(48, 1, 1, 800);
  camera.position.set(initial.panMeters, 36, 125);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(initial.panMeters, 0, 30);
  controls.update();
  const size = new THREE.Vector2();
  const controller = new ShadowController(reference.scene);
  controller.setSoftSun(true);
  const sky = new THREE.Group();
  const overlay = new THREE.Group();
  sky.visible = false;
  overlay.visible = false;
  let options = initial;
  let frame = 0;
  let disposed = false;
  let contextLost = false;
  let revision = 0;
  let revisionStartedAt = startedAt;
  let firstFrameAt: number | null = null;
  let settledAt: number | null = null;
  let ready = false;
  let tourTime = 0;
  let adjustingControls = false;
  let dragging = false;
  let lastStatusTime = -Infinity;
  let lastStatusPhase = "";
  let lastStatusRevision = -1;
  const schedule = () => {
    if (!disposed && !contextLost && !frame)
      frame = requestAnimationFrame(render);
  };
  const buildTiles = () =>
    new ShadowTiledScene(reference.scene, renderer, {
      light: controller.lights[0],
      sky,
      overlay,
      maximumMapSize: Math.min(
        options.maximumMapSize,
        renderer.capabilities.maxTextureSize
      ),
      requestRepaint: schedule,
    });
  let tiles = buildTiles();
  const sceneFrame = () => ({ renderCamera: camera, viewport: size });
  const publish = (phase: string) => {
    const now = performance.now();
    // A retained view may settle in its first frame and schedule no successor.
    // Never throttle that revision's only publication behind the previous one.
    if (
      revision === lastStatusRevision &&
      phase === lastStatusPhase &&
      now - lastStatusTime < 250
    )
      return;
    lastStatusRevision = revision;
    lastStatusTime = now;
    lastStatusPhase = phase;
    const stats = tiles.stats;
    const pages = stats.corridorAccumulation?.pageSamples ?? [];
    onStatus({
      phase,
      ready,
      revision,
      startedAt,
      revisionStartedAt,
      firstFrameAt,
      settledAt,
      elapsedMilliseconds: (settledAt ?? now) - revisionStartedAt,
      width: size.x,
      height: size.y,
      completedSamples: pages.length
        ? Math.min(...pages.map((page) => page.samples))
        : 0,
      completedPages: pages.filter((page) => page.published).length,
      totalPages: pages.length,
      stats,
      levels: [...new Set(tiles.pageLevels.map((page) => page.level))].sort(),
      cameraPosition: camera.position.toArray(),
      cameraTarget: controls.target.toArray(),
    });
  };
  const updateView = () => {
    if (revision > 0) revisionStartedAt = performance.now();
    revision += 1;
    settledAt = null;
    ready = false;
    camera.updateMatrixWorld(true);
    const changed = reference.setCaster(
      options.caster,
      options.casterLiftMeters
    );
    const elevation = degToRadNumeric(options.elevationDegrees);
    const lighting = {
      directionToSun: new THREE.Vector3(
        (Math.cos(elevation) * Math.sqrt(3)) / 2,
        Math.sin(elevation),
        Math.cos(elevation) / 2
      ),
      color: "#fff1d8",
      intensity: 3,
      shadowIntensity: 1,
    };
    // Same central light supplies immediate hard coverage while the addon
    // completes geometry-owned finite-disc publications independently.
    const bounds = reference.cells.reduce(
      (extent, cell) => extent.union(cell.bounds),
      new THREE.Box3()
    );
    controller.setMaxShadowMapSize(
      Math.min(options.maximumMapSize, renderer.capabilities.maxTextureSize)
    );
    controller.update({
      ...lighting,
      receiverWorldPoints: [bounds.min.x, bounds.max.x].flatMap((x) =>
        [bounds.min.y, bounds.max.y].flatMap((y) =>
          [bounds.min.z, bounds.max.z].map((z) => new THREE.Vector3(x, y, z))
        )
      ),
      receiverAnchorWorldPosition: bounds.getCenter(new THREE.Vector3()),
      minimumElevationMeters: bounds.min.y,
      maximumElevationMeters: bounds.max.y,
      quality: 4,
      groundTexelFit: true,
      mapTexelBudget: options.maximumMapSize ** 2,
    });
    tiles.update(reference.cells, sceneFrame(), lighting, options.targetPixels);
    const levelChanges = reference.setLevels(tiles.pageLevels);
    if (changed.length || levelChanges.length)
      tiles.invalidateContent([...changed, ...levelChanges]);
  };
  function render() {
    frame = 0;
    if (disposed || contextLost) return;
    try {
      if (options.animateCamera && !dragging && ready) {
        tourTime += 0.4;
        const heading = 0.55 * Math.sin(tourTime * 0.25);
        adjustingControls = true;
        controls.target.set(
          options.panMeters + 42 * Math.sin(tourTime * 0.18),
          0,
          25 - 70 * Math.sin(tourTime * 0.12)
        );
        camera.position
          .copy(controls.target)
          .add(
            new THREE.Vector3(
              95 * Math.sin(heading),
              36 + 6 * Math.sin(tourTime * 0.15),
              95 * Math.cos(heading)
            )
          );
        controls.update();
        adjustingControls = false;
        updateView();
      }
      renderer.setRenderTarget(null);
      renderer.clear(true, true, false);
      const progress = tiles.renderProgressive(camera, {
        width: size.x,
        height: size.y,
        viewKey: String(revision),
        styleEpoch: 0,
        samples: options.samples,
        active: !dragging,
        options: { format: "rgba16f-32f", msaaSamples: 0 },
      });
      if (!progress && !tiles.render(camera, null, options.samples, false))
        renderer.render(reference.scene, camera);
      firstFrameAt ??= performance.now();
      // The adapter's settled flag is transition-only. Replayed completed views
      // may emit no new event (e.g. toggling the tour without moving the camera).
      // Actual page publications plus finished work prove persistent readiness.
      if (progress) {
        const pages = tiles.stats.corridorAccumulation?.pageSamples ?? [];
        ready =
          progress.progress >= 1 &&
          !progress.needsRepaint &&
          pages.length > 0 &&
          pages.every((page) => page.published);
        if (ready) settledAt ??= performance.now();
      }
      publish(
        dragging
          ? "Moving — retained receiver shadows"
          : ready
          ? options.animateCamera
            ? "Camera tour — completed soft-shadow frame"
            : "Settled — addon soft-shadow publications ready"
          : progress
          ? "Integrating the solar disc — addon receiver stack"
          : "Hard-shadow preview — awaiting soft-shadow publication"
      );
      if (progress?.needsRepaint || (options.animateCamera && ready))
        schedule();
    } catch (error) {
      ready = false;
      settledAt = null;
      publish(`Rendering failed: ${String(error)}`);
    }
  }
  const moved = () => {
    if (adjustingControls || contextLost) return;
    camera.updateMatrixWorld(true);
    if (dragging) tiles.updatePresentation(sceneFrame());
    else updateView();
    schedule();
  };
  controls.addEventListener("change", moved);
  const dragStarted = () => {
    dragging = true;
    ready = false;
    settledAt = null;
    tiles.pausePending();
  };
  const dragEnded = () => {
    dragging = false;
    updateView();
    schedule();
  };
  controls.addEventListener("start", dragStarted);
  controls.addEventListener("end", dragEnded);
  let cssWidth = 0;
  let cssHeight = 0;
  let pixelRatio = 0;
  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const nextRatio =
      Math.min(window.devicePixelRatio || 1, 2) * options.renderScale;
    if (width === cssWidth && height === cssHeight && nextRatio === pixelRatio)
      return;
    cssWidth = width;
    cssHeight = height;
    pixelRatio = nextRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    renderer.getDrawingBufferSize(size);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    moved();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const lost = () => {
    contextLost = true;
    ready = false;
    settledAt = null;
    cancelAnimationFrame(frame);
    frame = 0;
    publish("WebGL context lost — reload the story to recreate resources");
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  resize();
  return {
    update(next: TiledShadowDemoOptions) {
      if (
        disposed ||
        contextLost ||
        JSON.stringify(next) === JSON.stringify(options)
      )
        return;
      const previous = options;
      options = next;
      if (previous.maximumMapSize !== next.maximumMapSize) {
        tiles.dispose();
        tiles = buildTiles();
      }
      if (
        previous.samples !== next.samples ||
        previous.elevationDegrees !== next.elevationDegrees
      )
        tiles.cancelPending(
          previous.elevationDegrees !== next.elevationDegrees
        );
      if (previous.panMeters !== next.panMeters) {
        const delta = next.panMeters - previous.panMeters;
        camera.position.x += delta;
        controls.target.x += delta;
        adjustingControls = true;
        controls.update();
        adjustingControls = false;
      }
      if (previous.renderScale !== next.renderScale) resize();
      else updateView();
      schedule();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("change", moved);
      controls.removeEventListener("start", dragStarted);
      controls.removeEventListener("end", dragEnded);
      controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      tiles.dispose();
      controller.dispose();
      reference.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
