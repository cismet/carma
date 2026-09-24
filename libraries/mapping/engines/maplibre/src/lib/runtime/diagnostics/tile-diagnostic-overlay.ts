import type { Camera } from "three";
import type { TileCameraSnapshot } from "../../core/tile-camera-demand";
import type { Tile } from "3d-tiles-renderer/core";
import {
  TILE_STEPS,
  type OverlayModel,
} from "../../core/diagnostics/tile-diagnostic-model";
import {
  TILE_KINDS,
  TILE_PHASES,
  TILE_RECORD_FLOATS,
  TILE_STEP_SLOTS,
  type DiagnosticFrame,
  type DiagnosticSnapshot,
  type DiagnosticView,
  type DiagnosticWorkerMessage,
} from "../../core/diagnostics/tile-diagnostic-scene";
import {
  scheduleTileDiagnosticTask,
  yieldTileDiagnosticTask,
} from "./tile-diagnostic-scheduler";

export type TileDiagnosticOverlayInput = {
  updateOnRender?: boolean;
  followCamera?: boolean;
  cameraFocus?: string;
  followPaddingPercent?: number;
  showFrustum?: boolean;
  orbit?: DiagnosticFrame["orbit"];
  model: OverlayModel;
  view: DiagnosticView;
  opacity: number;
  popout: boolean;
  labels: DiagnosticFrame["labels"];
  hover: { tile: Tile; parent: Tile | null; siblings: Tile[] } | null;
};
export type TileDiagnosticOverlayOptions = {
  onStatus?: (status: { ready: boolean; error?: string }) => void;
};

/** Latest-wins mailbox: one snapshot being encoded/rendered and one replaceable pending input. */
export const createTileDiagnosticOverlay = (
  host: HTMLElement,
  options: TileDiagnosticOverlayOptions = {}
) => {
  let worker: Worker | null = null;
  let disposed = false,
    ready = false,
    working = false,
    dirty = false;
  let latest: TileDiagnosticOverlayInput | null = null;
  let cameraSnapshot: TileCameraSnapshot | null = null;
  let additionalCameras: readonly TileCameraSnapshot[] = [];
  let uploadedModel: OverlayModel | null = null;
  let tileIndices = new Map<Tile, number>();
  let cancelTask: (() => void) | null = null;
  let width = host.clientWidth,
    height = host.clientHeight;
  let observer: ResizeObserver | null = null;
  const canvases: HTMLCanvasElement[] = [];
  const fail = (error: unknown) => {
    ready = false;
    worker?.terminate();
    worker = null;
    for (const canvas of canvases) canvas.remove();
    if (!disposed)
      options.onStatus?.({
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      });
  };
  const flush = async () => {
    cancelTask = null;
    if (disposed || !ready || working || !latest || width <= 0 || height <= 0)
      return;
    working = true;
    dirty = false;
    try {
      const model = latest.model;
      let snapshot: DiagnosticSnapshot | undefined;
      let pendingTileIndices = tileIndices;
      if (model !== uploadedModel) {
        const volumes = model.volumes ?? [];
        const tiles = new Float32Array(
          (model.rects.length + volumes.length) * TILE_RECORD_FLOATS
        );
        const ids: string[] = [];
        const indices = new Map<Tile, number>();
        let started = performance.now();
        for (let i = 0; i < model.rects.length; i++) {
          if (disposed) return;
          const rect = model.rects[i];
          const flags =
            Number(rect.floor) |
            (Number(rect.ring) << 1) |
            (Number(rect.outsideDemand) << 2) |
            (Number(rect.quality?.estimated) << 3) |
            (Number(
              rect.tile.internal?.hasRenderableContent === true &&
                !rect.tile.children?.length
            ) <<
              4) |
            (Number(rect.coverage === "viewport") << 5) |
            (Number(rect.coverage === "seam") << 6) |
            (Number(rect.coverage === "base") << 7);
          tiles.set(
            [
              rect.x,
              rect.y,
              rect.w,
              rect.h,
              rect.kind === "ancestor" ? -1 : TILE_KINDS.indexOf(rect.kind),
              flags,
              rect.quality?.minimum ?? NaN,
              rect.quality?.maximum ?? NaN,
              TILE_PHASES.indexOf(rect.phase as (typeof TILE_PHASES)[number]),
              rect.error,
              rect.bytes ?? 0,
              ...(rect.steps ?? []).reduce(
                (slots, step) => {
                  const named = TILE_STEPS.findIndex(
                    ({ label }) => label === step.label
                  );
                  slots[named < 0 ? TILE_STEP_SLOTS - 1 : named] += step.ms;
                  return slots;
                },
                Array.from({ length: TILE_STEP_SLOTS }, () => 0)
              ),
              rect.tile.internal?.depth ?? 0,
            ],
            i * TILE_RECORD_FLOATS
          );
          ids.push(rect.id);
          indices.set(rect.tile, i);
          if ((i & 127) === 127 && performance.now() - started >= 2) {
            await yieldTileDiagnosticTask();
            started = performance.now();
          }
        }
        // Volume sources own no Tile, so they stay out of the hover index and
        // carry the same record layout: a leaf, ringed when the corridor holds
        // it, dimmed when no camera demands it.
        for (let i = 0; i < volumes.length; i++) {
          if (disposed) return;
          const volume = volumes[i];
          tiles.set(
            [
              volume.x,
              volume.y,
              volume.w,
              volume.h,
              TILE_KINDS.indexOf(volume.kind),
              (Number(volume.inShadow) << 1) |
                (Number(!volume.inView) << 2) |
                (1 << 4),
              NaN,
              NaN,
              TILE_PHASES.indexOf(volume.phase as (typeof TILE_PHASES)[number]),
              volume.error,
              volume.bytes ?? 0,
              // A step lands in the slot of its name, so its colour is stable
              // across tiles; an unknown name folds into the last slot.
              ...(volume.steps ?? []).reduce(
                (slots, step) => {
                  const named = TILE_STEPS.findIndex(
                    ({ label }) => label === step.label
                  );
                  slots[named < 0 ? TILE_STEP_SLOTS - 1 : named] += step.ms;
                  return slots;
                },
                Array.from({ length: TILE_STEP_SLOTS }, () => 0)
              ),
              volume.level ?? 0,
            ],
            (model.rects.length + i) * TILE_RECORD_FLOATS
          );
          ids.push(volume.id);
          if ((i & 127) === 127 && performance.now() - started >= 2) {
            await yieldTileDiagnosticTask();
            started = performance.now();
          }
        }
        if (disposed) return;
        snapshot = {
          showSize: model.showSize,
          showStats: model.showStats,
          tiles,
          ids,
          viewportBasis: model.viewportBasis,
          extent: model.extent,
          edges: new Float32Array(model.intersectionEdges?.flat() ?? []),
          center: model.centerHit,
          target: model.target,
        };
        pendingTileIndices = indices;
      }
      if (latest.model !== model) {
        working = false;
        schedule();
        return;
      }
      const input = latest;
      const selection: Array<[number, number]> = [];
      if (input.hover) {
        for (const tile of [
          input.hover.tile,
          input.hover.parent,
          ...input.hover.siblings,
        ]) {
          if (!tile) continue;
          const index = pendingTileIndices.get(tile);
          if (index !== undefined)
            selection.push([index, Number(tile === input.hover.tile)]);
        }
      }
      const frame: DiagnosticFrame = {
        view: input.view,
        followCamera: input.followCamera,
        cameraFocus: input.cameraFocus,
        followPaddingPercent: input.followPaddingPercent,
        showFrustum: input.showFrustum,
        orbit: input.orbit,
        width,
        height,
        pixelRatio: host.ownerDocument.defaultView?.devicePixelRatio ?? 1,
        opacity: input.opacity,
        popout: input.popout,
        labels: input.labels,
        selection,
      };
      canvases[0].style.visibility = input.popout ? "hidden" : "visible";
      const message: DiagnosticWorkerMessage = {
        type: "frame",
        snapshot,
        frame,
      };
      worker?.postMessage(
        message,
        snapshot ? [snapshot.tiles.buffer, snapshot.edges.buffer] : []
      );
      if (snapshot) {
        uploadedModel = model;
        tileIndices = pendingTileIndices;
      }
      // `working` stays true until the GPU completion acknowledgement.
    } catch (error) {
      working = false;
      fail(error);
    }
  };
  const schedule = () => {
    if (!cancelTask && !working && ready && !disposed)
      cancelTask = scheduleTileDiagnosticTask(() => {
        void flush();
      }, latest?.updateOnRender);
  };
  try {
    if (
      !globalThis.Worker ||
      !HTMLCanvasElement.prototype.transferControlToOffscreen
    )
      throw new Error(
        "Worker canvases are unavailable; tile diagnostics are disabled."
      );
    for (const name of ["contrast", "foreground", "text"]) {
      const canvas = host.ownerDocument.createElement("canvas");
      canvas.dataset.testId =
        name === "contrast"
          ? "mesh-coverage-contrast"
          : name === "foreground"
          ? "mesh-coverage-overlay"
          : "mesh-coverage-text";
      Object.assign(canvas.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        mixBlendMode: name === "contrast" ? "darken" : "normal",
        opacity: name === "contrast" ? "0.25" : "1",
      });
      canvases.push(canvas);
      host.append(canvas);
    }
    worker = new Worker(
      new URL("./tile-diagnostic.worker.ts", import.meta.url),
      { type: "module", name: "tile-diagnostics" }
    );
    worker.onerror = (event) => fail(event.message);
    worker.onmessage = ({ data }) => {
      if (disposed) return;
      if (data.type === "error") {
        fail(data.message);
        return;
      }
      if (data.type === "ready") {
        if (cameraSnapshot)
          worker?.postMessage({
            type: "camera",
            camera: cameraSnapshot,
            cameras: additionalCameras,
          });
        ready = true;
        options.onStatus?.({ ready: true });
      }
      if (data.type === "frame") {
        working = false;
        host.dataset.instances = String(data.instances);
        host.dataset.bufferBytes = String(data.bufferBytes);
        host.dataset.uploads = String(data.uploads);
        host.dataset.workerMs = String(data.workerMs);
        if (data.view) host.dataset.projectedView = data.view.join(" ");
      }
      if (dirty || data.type === "ready") schedule();
    };
    const [contrast, foreground, text] = canvases.map((canvas) =>
      canvas.transferControlToOffscreen()
    );
    worker.postMessage(
      {
        type: "init",
        contrast,
        foreground,
        text,
      } satisfies DiagnosticWorkerMessage,
      [contrast, foreground, text]
    );
    observer = new ResizeObserver((entries) => {
      const size = entries[0]?.contentRect;
      if (!size) return;
      width = size.width;
      height = size.height;
      dirty = true;
      schedule();
    });
    observer.observe(host);
  } catch (error) {
    fail(error);
  }
  return {
    /** Render-thread work is only a matrix comparison/copy and a tiny mailbox message. */
    updateCamera(
      camera: Camera,
      force = false,
      cameras: readonly TileCameraSnapshot[] = []
    ) {
      if (disposed) return;
      if (
        !force &&
        cameraSnapshot &&
        cameras.length === additionalCameras.length &&
        cameras.every(
          (value, i) =>
            value.id === additionalCameras[i].id &&
            value.matrixWorld.every(
              (v, j) => v === additionalCameras[i].matrixWorld[j]
            ) &&
            value.projectionMatrix.every(
              (v, j) => v === additionalCameras[i].projectionMatrix[j]
            )
        ) &&
        camera.coordinateSystem === cameraSnapshot.coordinateSystem &&
        camera.reversedDepth === cameraSnapshot.reversedDepth &&
        camera.matrixWorld.elements.every(
          (v, i) => v === cameraSnapshot!.matrixWorld[i]
        ) &&
        camera.projectionMatrix.elements.every(
          (v, i) => v === cameraSnapshot!.projectionMatrix[i]
        )
      )
        return;
      additionalCameras = cameras;
      cameraSnapshot = {
        id: "overview-live",
        matrixWorld: camera.matrixWorld.toArray(),
        projectionMatrix: camera.projectionMatrix.toArray(),
        coordinateSystem: camera.coordinateSystem,
        reversedDepth: camera.reversedDepth,
        viewport: [Math.max(1, width), Math.max(1, height)],
        errorTargetPixels: 1,
        role: "receiver",
      };
      if (ready)
        worker?.postMessage({
          type: "camera",
          camera: cameraSnapshot,
          cameras: additionalCameras,
        } satisfies DiagnosticWorkerMessage);
    },
    update(input: TileDiagnosticOverlayInput) {
      latest = input;
      dirty = true;
      schedule();
    },
    dispose() {
      disposed = true;
      cancelTask?.();
      observer?.disconnect();
      latest = null;
      uploadedModel = null;
      tileIndices.clear();
      const retiring = worker;
      if (retiring) {
        const timeout = setTimeout(() => retiring.terminate(), 250);
        retiring.onmessage = ({ data }) => {
          if (data.type === "disposed") {
            clearTimeout(timeout);
            retiring.terminate();
          }
        };
        retiring.postMessage({
          type: "dispose",
        } satisfies DiagnosticWorkerMessage);
      }
      worker = null;
      for (const canvas of canvases) canvas.remove();
    },
  };
};
