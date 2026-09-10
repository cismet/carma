import * as THREE from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  buildSharedSceneAccumulator,
  DEFAULT_SCENE_ACCUMULATION_OPTIONS,
  fitRenderTargetSizeToPixelBudget,
  type SharedSceneAccumulator,
} from "@carma-mapping/engines/three/primitives/rendering";
import type {
  SharedSceneAccumulationController,
  SharedThreeSceneFrame,
} from "../../core/shared-three-scene-types";
import type {
  DepthRange,
  RenderTargetDepthRangeBridge,
} from "./shared-three-scene-render-context";
import { MAP_LOADING_PHASE } from "../../core/map-loading-progress";
import { publishMapLoadingProgress } from "./map-loading-progress";
import { setSharedThreeShadedPresentation } from "./shared-three-scene-content-registry";

export const createSharedThreeSceneAccumulation = (layerId: string) => {
  let accumulationController: SharedSceneAccumulationController | null = null;
  let accumulator: SharedSceneAccumulator | null = null;
  let accumulatorConfigurationKey = "";
  let settledAccumulatorVisualKey = "";
  let accumulationRetryTimer: ReturnType<typeof setTimeout> | null = null;
  const clearAccumulationRetry = () => {
    if (accumulationRetryTimer !== null) clearTimeout(accumulationRetryTimer);
    accumulationRetryTimer = null;
  };

  return {
    get controller() {
      return accumulationController;
    },
    setController(
      controller: SharedSceneAccumulationController | null,
      map: MaplibreMap | null,
      renderer: THREE.WebGLRenderer | null
    ) {
      if (map)
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          controller ? 0 : 1
        );
      if (map && !controller) setSharedThreeShadedPresentation(map, false);
      accumulationController = controller;
      if (renderer) {
        renderer.toneMapping = controller
          ? THREE.AgXToneMapping
          : THREE.NoToneMapping;
      }
      if (!controller) {
        accumulator?.dispose();
        accumulator = null;
      }
    },

    render(
      renderer: THREE.WebGLRenderer,
      scene: THREE.Scene,
      frame: SharedThreeSceneFrame,
      options: {
        styleEpoch: number;
        depthRangeBridge: RenderTargetDepthRangeBridge | null;
        depthRange: DepthRange;
      }
    ) {
      const { map, renderCamera, viewport } = frame;
      const {
        styleEpoch: mapStyleProjectionEpoch,
        depthRangeBridge,
        depthRange: savedDepthRange,
      } = options;
      const accumulation = accumulationController;
      const renderScene = (round: number | null) => {
        if (!accumulation?.renderScene?.(renderCamera, round)) {
          renderer?.render(scene, renderCamera);
        }
      };
      const poseKey = [
        // A DPR-only resize can keep both camera matrices unchanged. Its old
        // settled color frame must not be stretched to the new native viewport.
        viewport.x,
        viewport.y,
        ...renderCamera.matrixWorld.elements,
        ...renderCamera.projectionMatrix.elements,
      ]
        .map((value) => value.toPrecision(6))
        .join(",");
      const visualKey = accumulation
        ? `${accumulation.visualEpoch()}|${mapStyleProjectionEpoch}|${poseKey}`
        : "";
      const nextAccumulatorConfigurationKey = accumulation
        ? `${accumulation.rounds}|${
            accumulation.options?.format ??
            DEFAULT_SCENE_ACCUMULATION_OPTIONS.format
          }|${
            accumulation.options?.msaaSamples ??
            DEFAULT_SCENE_ACCUMULATION_OPTIONS.msaaSamples
          }`
        : "";
      const progressiveResult: {
        value: ReturnType<
          NonNullable<SharedSceneAccumulationController["renderProgressive"]>
        >;
      } = { value: null };
      if (accumulation?.renderProgressive && renderer) {
        depthRangeBridge?.render(savedDepthRange, () => {
          progressiveResult.value =
            accumulation.renderProgressive?.(renderCamera, {
              width: viewport.x,
              height: viewport.y,
              viewKey: poseKey,
              styleEpoch: mapStyleProjectionEpoch,
              active: accumulation.active(),
            }) ?? null;
        });
      }
      const progressive = progressiveResult.value;
      clearAccumulationRetry();
      if (
        accumulator &&
        accumulatorConfigurationKey !== nextAccumulatorConfigurationKey
      ) {
        accumulator.dispose();
        accumulator = null;
        settledAccumulatorVisualKey = "";
      }
      if (progressive) {
        // A corridor-owned integration must never also be averaged by the
        // viewport accumulator. Release mono targets when changing strategy.
        accumulator?.dispose();
        accumulator = null;
        accumulatorConfigurationKey = "";
        settledAccumulatorVisualKey = "";
        if (progressive.needsRepaint) map.triggerRepaint();
        else if (progressive.retryAfterMs !== undefined) {
          accumulationRetryTimer = setTimeout(() => {
            accumulationRetryTimer = null;
            map.triggerRepaint();
          }, progressive.retryAfterMs);
        }
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          progressive.progress
        );
        if (progressive.settled) accumulation?.onSettled?.();
      } else if (
        !accumulation?.renderProgressive &&
        accumulation?.active() &&
        renderer &&
        !accumulator?.broken
      ) {
        if (!accumulator) {
          accumulator = buildSharedSceneAccumulator(
            accumulation.rounds,
            accumulation.options
          );
          accumulatorConfigurationKey = nextAccumulatorConfigurationKey;
        }
        accumulator.ensureState(
          `${accumulation.epoch()}|${mapStyleProjectionEpoch}|${poseKey}`
        );
        const retainSettled =
          accumulator.hasSettledFrame &&
          settledAccumulatorVisualKey === visualKey;
        // MapLibre owns canvas resizes. Three's cached drawing-buffer size
        // stays at construction size because we intentionally never setSize.
        // Use the physical canvas viewport for draped text after resize/DPR moves.
        const accumulationSize = fitRenderTargetSizeToPixelBudget(
          viewport.x,
          viewport.y,
          accumulation.maxRenderTargetPixels ?? Number.POSITIVE_INFINITY
        );
        let becameSettled = false;
        if (!accumulator.converged) {
          const round = accumulator.nextRound;
          accumulation.prepareRound(round);
          // Only sample the light direction. MapLibre's captured color/depth
          // were rendered from this exact camera; keep that registration for
          // every round. The accumulation target supplies geometry MSAA.
          const activeRenderer = renderer;
          try {
            depthRangeBridge?.render(savedDepthRange, () => {
              accumulator?.renderRound(
                activeRenderer,
                accumulationSize.width,
                accumulationSize.height,
                () => renderScene(round)
              );
            });
          } finally {
            accumulation.finishRound?.();
          }
          if (accumulator.converged) {
            settledAccumulatorVisualKey = visualKey;
            becameSettled = true;
          }
        }
        let composited = false;
        depthRangeBridge?.render(savedDepthRange, () => {
          if (renderer) {
            composited =
              accumulator?.composite(renderer, retainSettled, undefined, {
                allowPartial: true,
              }) ?? false;
          }
        });
        if (!composited) {
          depthRangeBridge?.render(savedDepthRange, () => {
            renderScene(null);
          });
        }
        if (!accumulator.converged) map.triggerRepaint();
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          accumulator.converged
            ? 1
            : accumulator.nextRound / Math.max(1, accumulation.rounds)
        );
        if (becameSettled && composited) accumulation.onSettled?.();
      } else {
        const retainSettled =
          accumulation?.retainSettledFrame() === true &&
          accumulator?.hasSettledFrame === true &&
          settledAccumulatorVisualKey === visualKey;
        let composited = false;
        depthRangeBridge?.render(savedDepthRange, () => {
          if (retainSettled && renderer) {
            composited = accumulator?.composite(renderer, true) ?? false;
          }
        });
        if (!composited) {
          depthRangeBridge?.render(savedDepthRange, () => {
            renderScene(null);
          });
        }
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          !accumulator?.broken && accumulation?.pending?.() ? 0 : 1
        );
      }

      if (accumulation) setSharedThreeShadedPresentation(map, true);
    },
    dispose() {
      clearAccumulationRetry();
      accumulator?.dispose();
      accumulator = null;
    },
  };
};
