import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { degToRadNumeric } from "@carma-units";
import { buildSharedSceneAccumulator } from "@carma-mapping/engines/three/primitives/rendering";
import { ShadowCorridorAccumulator } from "../runtime/shadow-corridor-accumulator";

import {
  TiledShadowRenderer,
  type TiledShadowStats,
} from "../runtime/tiled-shadow-renderer";
import {
  createTiledShadowReference,
  type ShadowDemoCaster,
} from "./tiled-shadow-reference";
import {
  benchmarkSunShadowPasses,
  type SunShadowBenchmarkResult,
} from "./sun-shadow-benchmark";
import {
  readSunShadowLinearImage,
  compareSunShadowLinearImages,
  type SunShadowImageDifference,
} from "./sun-shadow-image-comparison";

export type TiledShadowDemoOptions = Readonly<{
  targetPixels: number;
  samples: number;
  elevationDegrees: number;
  cacheMiB: number;
  maximumMapSize: number;
  panMeters: number;
  benchmark: boolean;
  caster: ShadowDemoCaster;
  casterLiftMeters: number;
  animateCamera: boolean;
}>;

export type TiledShadowDemoStatus = Readonly<{
  phase: string;
  width: number;
  height: number;
  completedSamples: number;
  stats: TiledShadowStats;
  levels: readonly number[];
  cameraPosition: readonly number[];
  cameraTarget: readonly number[];
  benchmark?: readonly SunShadowBenchmarkResult[];
  imageDifference?: SunShadowImageDifference;
}>;

/** DOM host of the shared runtime, used by Mapping/Shadows/Tiled Corridors.
 * Controls change inputs only. No mock cache hits or alternate shadow shader.
 */
export const createTiledShadowDemo = (
  container: HTMLElement,
  initial: TiledShadowDemoOptions,
  onStatus: (status: TiledShadowDemoStatus) => void
) => {
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
    "World-fixed shadow corridor reference; drag to orbit or pan"
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
  let options = initial;
  const buildPages = () =>
    new TiledShadowRenderer(
      reference.scene,
      renderer,
      options.cacheMiB * 1024 ** 2,
      options.maximumMapSize
    );
  const buildAccumulator = () =>
    buildSharedSceneAccumulator(options.samples, {
      format: "rgba16f-32f",
      msaaSamples: 0,
    });
  let pages = buildPages();
  let accumulator = buildAccumulator();
  const corridorAccumulator = new ShadowCorridorAccumulator(renderer);
  let corridorProgress = 0;
  let corridorSettled = false;
  let revision = 0;
  let frame = 0;
  let disposed = false;
  let contextLost = false;
  let benchmarkAbort: AbortController | null = null;
  let benchmarkDone = false;
  let benchmark: readonly SunShadowBenchmarkResult[] | undefined;
  let imageDifference: SunShadowImageDifference | undefined;
  let tourTime = 0;
  let adjustingControls = false;
  let dragging = false;
  let lastStatusTime = -Infinity;
  let lastStatusPhase = "";
  const publish = (phase: string) => {
    const now = performance.now();
    if (phase === lastStatusPhase && now - lastStatusTime < 250) return;
    lastStatusTime = now;
    lastStatusPhase = phase;
    onStatus({
      phase,
      width: size.x,
      height: size.y,
      completedSamples: Math.floor(corridorProgress * options.samples),
      stats: pages.stats,
      levels: [...new Set(pages.pageLevels.map((page) => page.level))].sort(),
      cameraPosition: camera.position.toArray(),
      cameraTarget: controls.target.toArray(),
      benchmark,
      imageDifference,
    });
  };
  const resetAccumulation = () => accumulator.ensureState(String(++revision));
  const updateView = () => {
    corridorSettled = false;
    camera.updateMatrixWorld(true);
    const changed = reference.setCaster(
      options.caster,
      options.casterLiftMeters
    );
    const elevation = degToRadNumeric(options.elevationDegrees);
    pages.setView(reference.cells, camera, size, options.targetPixels, {
      directionToSun: new THREE.Vector3(
        (Math.cos(elevation) * Math.sqrt(3)) / 2,
        Math.sin(elevation),
        Math.cos(elevation) / 2
      ),
      color: "#fff1d8",
      intensity: 3,
      shadowIntensity: 1,
    });
    // Digits are real casters: a changed LOD number invalidates every
    // intersecting downstream corridor, not only the number's own tile.
    for (const bounds of [
      ...changed,
      ...reference.setLevels(pages.pageLevels),
    ]) {
      pages.invalidateCasters(bounds);
    }
    resetAccumulation();
  };
  const renderRound = (round: number) =>
    accumulator.renderRound(renderer, size.x, size.y, () =>
      pages.renderSample(camera, round, options.samples)
    );
  const composite = () => {
    renderer.setRenderTarget(null);
    renderer.clear(true, true, false);
    accumulator.composite(renderer);
  };
  const schedule = () => {
    if (!disposed && !contextLost && !frame && !benchmarkAbort)
      frame = requestAnimationFrame(render);
  };
  const runBenchmark = async () => {
    const abort = new AbortController();
    benchmarkAbort = abort;
    benchmarkDone = true;
    try {
      // This optional diagnostic still isolates depth-cache cold/warm reuse.
      // Interactive rendering below uses the same corridor-owned integrator
      // as Geoportal; the reference accumulator is only a benchmark oracle.
      resetAccumulation();
      for (let round = 0; round < options.samples; round += 1) {
        if (abort.signal.aborted) return;
        renderRound(round);
        if (round % 4 === 3)
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
          );
      }
      // Excluded from timing: compare fresh and reused per-direction results,
      // not just cache counters. Uses the existing linear HDR readback helper.
      const original = readSunShadowLinearImage(
        renderer,
        accumulator,
        size.x,
        size.y
      );
      benchmark = await benchmarkSunShadowPasses(
        renderer,
        options.samples,
        (round, mode) => {
          if (round === 0 && mode === "tiled-cold") pages.clearCache();
          renderRound(round);
          if (round === options.samples - 1) composite();
        },
        resetAccumulation,
        abort.signal,
        publish,
        { cases: ["tiled-cold", "tiled-warm"], batchRounds: 4 }
      );
      imageDifference = compareSunShadowLinearImages(
        original,
        readSunShadowLinearImage(renderer, accumulator, size.x, size.y)
      );
      publish(
        "Depth-cache reference benchmark complete; identical per-direction shadows"
      );
    } catch (error) {
      if (!abort.signal.aborted) publish(`Benchmark failed: ${String(error)}`);
    } finally {
      if (benchmarkAbort === abort) {
        benchmarkAbort = null;
        schedule();
      }
    }
  };
  function render() {
    frame = 0;
    if (disposed || contextLost) return;
    try {
      if (
        options.animateCamera &&
        !options.benchmark &&
        !dragging &&
        corridorSettled
      ) {
        // Complete the finite-disc frame before advancing. Never average
        // different observer poses or silently substitute a centre-ray shadow.
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
      const progress = corridorAccumulator.render(camera, pages, {
        width: size.x,
        height: size.y,
        viewKey: [
          ...camera.projectionMatrix.elements,
          ...camera.matrixWorldInverse.elements,
        ].join(","),
        styleEpoch: 0,
        samples: options.samples,
        active: !dragging,
        options: { format: "rgba16f-32f", msaaSamples: 0 },
      });
      corridorProgress = progress?.progress ?? 0;
      corridorSettled = progress?.settled ?? false;
      if (!progress) pages.renderSample(camera, 0, 1);
      publish(
        !progress
          ? "Centre-sun preview — motion or native HDR budget limit"
          : corridorSettled
          ? options.animateCamera && !options.benchmark
            ? "Camera tour — full-disc frames"
            : "Settled — no animation loop"
          : "Integrating the solar disc per corridor"
      );
      if (progress?.needsRepaint) schedule();
      else if (options.benchmark && !benchmarkDone) void runBenchmark();
      else if (options.animateCamera && !options.benchmark) schedule();
    } catch (error) {
      publish(`Rendering failed: ${String(error)}`);
    }
  }
  const cancelBenchmark = () => {
    benchmarkAbort?.abort();
    benchmarkAbort = null;
  };
  const moved = () => {
    if (adjustingControls || contextLost) return;
    cancelBenchmark();
    updateView();
    schedule();
  };
  controls.addEventListener("change", moved);
  const dragStarted = () => {
    dragging = true;
  };
  const dragEnded = () => {
    dragging = false;
    schedule();
  };
  controls.addEventListener("start", dragStarted);
  controls.addEventListener("end", dragEnded);
  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
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
    cancelBenchmark();
    cancelAnimationFrame(frame);
    frame = 0;
    pages.dispose();
    corridorAccumulator.dispose();
    publish("WebGL context lost — reload the story to recreate resources");
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  resize();
  return {
    update(next: TiledShadowDemoOptions) {
      if (disposed || contextLost) return;
      cancelBenchmark();
      const previous = options;
      options = next;
      if (
        previous.cacheMiB !== next.cacheMiB ||
        previous.maximumMapSize !== next.maximumMapSize
      ) {
        pages.dispose();
        pages = buildPages();
      }
      if (previous.samples !== next.samples) {
        accumulator.dispose();
        accumulator = buildAccumulator();
      }
      if (previous.panMeters !== next.panMeters) {
        const delta = next.panMeters - previous.panMeters;
        camera.position.x += delta;
        controls.target.x += delta;
        controls.update();
      }
      benchmarkDone = false;
      benchmark = undefined;
      imageDifference = undefined;
      updateView();
      schedule();
    },
    dispose() {
      disposed = true;
      cancelBenchmark();
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("change", moved);
      controls.removeEventListener("start", dragStarted);
      controls.removeEventListener("end", dragEnded);
      controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      accumulator.dispose();
      corridorAccumulator.dispose();
      pages.dispose();
      reference.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
