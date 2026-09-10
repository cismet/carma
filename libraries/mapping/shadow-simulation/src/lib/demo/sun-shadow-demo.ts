import * as THREE from "three";

import {
  buildSharedSceneAccumulator,
  type SceneAccumulationFormat,
  type SharedSceneAccumulator,
} from "@carma-mapping/engines/three/primitives/rendering";

import type { ShadowCameraSnapshot } from "../runtime/shadow-controller";
import type { ShadowSunDiscSamples } from "../core/shadow-types";
import { createSunShadowLightingCache } from "./sun-shadow-lighting-cache";
import {
  measurePlateShadowBanding,
  type SunShadowBanding,
} from "./sun-shadow-banding";
import {
  benchmarkSunShadowPasses,
  waitForSunShadowBenchmarkFrame,
  type SunShadowBenchmarkCase,
  type SunShadowBenchmarkResult,
} from "./sun-shadow-benchmark";
import {
  createSunShadowReference,
  type SunShadowReferenceOptions,
} from "./sun-shadow-reference";
import {
  compareSunShadowLinearImages,
  readSunShadowLinearImage,
  type SunShadowImageDifference,
} from "./sun-shadow-image-comparison";

export type SunShadowDemoOptions = Omit<
  SunShadowReferenceOptions,
  "visibilityOnly"
> &
  Readonly<{
    samples: ShadowSunDiscSamples;
    bufferFormat: SceneAccumulationFormat;
    msaaSamples: 0 | 4;
    renderScale: number;
    benchmark: boolean;
    cachedLighting: boolean;
    measureBanding: boolean;
  }>;

export type SunShadowDemoStatus = Readonly<{
  backend: "WebGL2";
  phase: string;
  samples: number;
  width: number;
  height: number;
  shadowMapSize: number;
  bufferFormat: SceneAccumulationFormat;
  msaaSamples: number;
  cachedLighting: boolean;
  shadowCamera?: ShadowCameraSnapshot;
  benchmark?: readonly SunShadowBenchmarkResult[];
  imageDifference?: SunShadowImageDifference;
  banding?: SunShadowBanding;
}>;

export type SunShadowDemo = Readonly<{
  update: (options: SunShadowDemoOptions) => void;
  dispose: () => void;
}>;

/** Standalone host for the production controller and HDR accumulation path. */
export const createSunShadowDemo = (
  container: HTMLElement,
  initialOptions: SunShadowDemoOptions,
  onStatus: (status: SunShadowDemoStatus) => void
): SunShadowDemo => {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.autoClear = false;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
  renderer.domElement.setAttribute(
    "aria-label",
    "Sun-disc shadow reference scene"
  );
  container.append(renderer.domElement);
  const reference = createSunShadowReference(
    renderer.capabilities.maxTextureSize
  );
  const drawingSize = new THREE.Vector2();
  let options = initialOptions;
  // Explicit opt-in: raw scalar experiments remain available independently.
  const shouldUseCachedLighting = () =>
    options.cachedLighting && !options.bufferFormat.startsWith("rgba");
  const lightingCache = createSunShadowLightingCache(
    renderer,
    reference.scene,
    reference.camera,
    reference.controller.lights[0]
  );
  const lighting = () =>
    shouldUseCachedLighting() ? lightingCache.lighting : undefined;
  const createAccumulator = () =>
    buildSharedSceneAccumulator(options.samples, {
      format: options.bufferFormat,
      msaaSamples: options.msaaSamples,
    });
  let accumulator: SharedSceneAccumulator = createAccumulator();
  let stateVersion = 0;
  let frame = 0;
  let disposed = false;
  let benchmarkAbort: AbortController | null = null;
  let benchmarkRequested = false;
  let benchmarkError: string | null = null;
  let benchmarkResult: readonly SunShadowBenchmarkResult[] | undefined;
  let imageDifference: SunShadowImageDifference | undefined;
  let banding: SunShadowBanding | undefined;
  let bandingMeasured = false;

  const publish = (phase: string) =>
    onStatus({
      backend: "WebGL2",
      phase: benchmarkError ? `${phase}\n${benchmarkError}` : phase,
      samples: options.pointSun ? 1 : options.samples,
      width: drawingSize.x,
      height: drawingSize.y,
      shadowMapSize: options.shadowMapSize,
      bufferFormat: options.bufferFormat,
      msaaSamples: accumulator.msaaSamples,
      cachedLighting: shouldUseCachedLighting(),
      shadowCamera: reference.snapshot?.camera,
      benchmark: benchmarkResult,
      imageDifference,
      banding,
    });
  const reset = () => accumulator.ensureState(String(++stateVersion));

  const renderRound = (
    round: number,
    mode: SunShadowBenchmarkCase = "full",
    targetAccumulator = accumulator,
    rgbReference = false
  ) => {
    if (shouldUseCachedLighting() && !rgbReference && round === 0) {
      reference.controller.restoreSunDiscCenter();
      lightingCache.render(drawingSize.x, drawingSize.y);
    }
    reference.sample(round, options.samples);
    if (mode === "cached-shadow-map" && round > 0) {
      reference.controller.lights[0].shadow.needsUpdate = false;
    }
    targetAccumulator.renderRound(
      renderer,
      drawingSize.x,
      drawingSize.y,
      () => {
        const target = renderer.getRenderTarget();
        // Diagnostic lower bound on colour-pass work, NOT an edge classifier.
        // Three restores the scene target's scissor after rendering the full
        // shadow map into its own target, so depth-map work remains unchanged.
        if (target && mode === "one-percent-color" && round > 0) {
          target.scissor.set(
            0,
            0,
            Math.ceil(drawingSize.x / 10),
            Math.ceil(drawingSize.y / 10)
          );
          target.scissorTest = true;
          renderer.setRenderTarget(target);
        }
        const previousMaterial = reference.scene.overrideMaterial;
        if (rgbReference) reference.scene.overrideMaterial = null;
        try {
          renderer.render(reference.scene, reference.camera);
        } finally {
          reference.scene.overrideMaterial = previousMaterial;
          if (target) target.scissorTest = false;
        }
      }
    );
    if (targetAccumulator.broken)
      throw new Error("Sun-disc accumulation failed");
  };

  const schedule = () => {
    if (!disposed && !frame && !benchmarkAbort)
      frame = requestAnimationFrame(render);
  };
  const runBenchmark = async () => {
    const abort = new AbortController();
    benchmarkAbort = abort;
    try {
      const selectedImage = readSunShadowLinearImage(
        renderer,
        accumulator,
        drawingSize.x,
        drawingSize.y,
        lighting()
      );
      const referenceAccumulator = buildSharedSceneAccumulator(
        options.samples,
        {
          format:
            shouldUseCachedLighting() || options.bufferFormat.startsWith("rgba")
              ? "rgba32f"
              : "r32f",
          msaaSamples: 0,
        }
      );
      try {
        referenceAccumulator.ensureState("precision-reference");
        for (let round = 0; round < options.samples; round += 1) {
          if (abort.signal.aborted)
            throw new DOMException("Cancelled", "AbortError");
          renderRound(
            round,
            "full",
            referenceAccumulator,
            shouldUseCachedLighting()
          );
          if (round % 4 === 3)
            await waitForSunShadowBenchmarkFrame(abort.signal);
        }
        if (abort.signal.aborted)
          throw new DOMException("Cancelled", "AbortError");
        imageDifference = compareSunShadowLinearImages(
          selectedImage,
          readSunShadowLinearImage(
            renderer,
            referenceAccumulator,
            drawingSize.x,
            drawingSize.y
          )
        );
        benchmarkResult = await benchmarkSunShadowPasses(
          renderer,
          options.samples,
          (round, mode) => {
            const rgbReference = mode === "full-rgb-reference";
            const target = rgbReference ? referenceAccumulator : accumulator;
            renderRound(round, mode, target, rgbReference);
            // Include static RGB-cache generation (round zero above) and the
            // final composition for BOTH methods in this end-to-end comparison.
            if (shouldUseCachedLighting() && round === options.samples - 1) {
              renderer.setRenderTarget(null);
              renderer.clear(true, true, false);
              target.composite(
                renderer,
                false,
                rgbReference ? undefined : lighting()
              );
            }
          },
          () => {
            reset();
            referenceAccumulator.ensureState(String(stateVersion));
          },
          abort.signal,
          (progress) => publish(`Benchmark: ${progress}`),
          {
            ...(shouldUseCachedLighting()
              ? { cases: ["full", "full-rgb-reference"] as const }
              : {}),
            batchRounds: options.samples >= 1024 ? 16 : 4,
          }
        );
      } finally {
        referenceAccumulator.dispose();
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        benchmarkError = `Benchmark failed: ${String(error)}`;
        publish(benchmarkError);
      }
    } finally {
      if (benchmarkAbort === abort) {
        benchmarkAbort = null;
        reference.controller.restoreSunDiscCenter();
        reset();
        schedule();
      }
    }
  };
  function render() {
    frame = 0;
    if (disposed || benchmarkAbort) return;
    if (!options.pointSun && !accumulator.converged) {
      try {
        const deadline = performance.now() + 8;
        // Bounded submission batches keep high-fidelity references responsive
        // without waiting one browser frame for each individual sun direction.
        for (let batch = 0; batch < 4 && !accumulator.converged; batch += 1) {
          renderRound(accumulator.nextRound);
          if (performance.now() >= deadline) break;
        }
      } catch (error) {
        publish(String(error));
        return;
      }
      if (accumulator.broken) {
        publish("HDR accumulation failed; inspect the browser console");
        return;
      }
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x707980, 1);
    renderer.clear(true, true, false);
    if (
      options.pointSun ||
      !accumulator.composite(renderer, false, lighting())
    ) {
      reference.controller.restoreSunDiscCenter();
      const previousMaterial = reference.scene.overrideMaterial;
      if (shouldUseCachedLighting()) reference.scene.overrideMaterial = null;
      try {
        renderer.render(reference.scene, reference.camera);
      } finally {
        reference.scene.overrideMaterial = previousMaterial;
      }
    }
    const settled = options.pointSun || accumulator.converged;
    if (
      settled &&
      !bandingMeasured &&
      options.measureBanding &&
      !options.pointSun &&
      options.object === "plate" &&
      !options.bufferFormat.startsWith("rgba")
    ) {
      bandingMeasured = true;
      try {
        // Raw visibility before cached RGB, tone mapping and output dithering.
        banding = measurePlateShadowBanding(
          readSunShadowLinearImage(
            renderer,
            accumulator,
            drawingSize.x,
            drawingSize.y
          ),
          reference.camera,
          drawingSize.x,
          drawingSize.y,
          options
        );
      } catch (error) {
        benchmarkError = `Banding measurement unavailable: ${String(error)}`;
      }
    }
    publish(
      settled
        ? "Settled — no animation loop"
        : `Sun disc: ${accumulator.nextRound}/${options.samples}`
    );
    if (!settled) schedule();
    else if (options.benchmark && !benchmarkRequested && !options.pointSun) {
      benchmarkRequested = true;
      void runBenchmark();
    }
  }

  let cssWidth = 0;
  let cssHeight = 0;
  let pixelRatio = 0;
  const resize = (force = false) => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const nextPixelRatio =
      Math.min(window.devicePixelRatio, 2) * options.renderScale;
    if (
      !force &&
      width === cssWidth &&
      height === cssHeight &&
      nextPixelRatio === pixelRatio
    )
      return;
    cssWidth = width;
    cssHeight = height;
    pixelRatio = nextPixelRatio;
    banding = undefined;
    bandingMeasured = false;
    if (benchmarkAbort) {
      benchmarkAbort.abort();
      benchmarkAbort = null;
      benchmarkRequested = false;
      benchmarkResult = undefined;
      imageDifference = undefined;
    }
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    renderer.getDrawingBufferSize(drawingSize);
    reference.update(
      {
        ...options,
        visibilityOnly:
          options.bufferFormat.startsWith("r") &&
          !options.bufferFormat.startsWith("rgba"),
      },
      width / height
    );
    renderer.toneMappingExposure = options.exposure;
    reset();
    schedule();
  };
  const observer = new ResizeObserver(() => resize());
  observer.observe(container);
  resize();

  return {
    update(nextOptions) {
      if (JSON.stringify(options) === JSON.stringify(nextOptions)) return;
      benchmarkAbort?.abort();
      benchmarkAbort = null;
      benchmarkRequested = false;
      benchmarkError = null;
      benchmarkResult = undefined;
      imageDifference = undefined;
      const rebuild =
        options.samples !== nextOptions.samples ||
        options.bufferFormat !== nextOptions.bufferFormat ||
        options.msaaSamples !== nextOptions.msaaSamples;
      options = nextOptions;
      if (rebuild) {
        accumulator.dispose();
        accumulator = createAccumulator();
      }
      resize(true);
    },
    dispose() {
      disposed = true;
      benchmarkAbort?.abort();
      benchmarkAbort = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      accumulator.dispose();
      lightingCache.dispose();
      reference.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
