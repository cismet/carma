import {
  buildDiagnosticPrimitives,
  buildDiagnosticSelection,
  drawDiagnosticText,
  buildDiagnosticViewport,
  type DiagnosticSnapshot,
  type DiagnosticWorkerMessage,
  type DiagnosticFrame,
} from "../../core/diagnostics/tile-diagnostic-scene";
import type { TileCameraSnapshot } from "../../core/tile-camera-demand";
import { projectTileDiagnosticViewports } from "./tile-diagnostic-viewport";
import { createTileDiagnosticRenderer } from "./tile-diagnostic-webgpu";

const host = self as unknown as {
  onmessage: ((event: MessageEvent<DiagnosticWorkerMessage>) => void) | null;
  postMessage: (data: unknown) => void;
};
let renderer: Awaited<ReturnType<typeof createTileDiagnosticRenderer>> | null =
  null;
let snapshot: DiagnosticSnapshot | null = null;
let textCanvas: OffscreenCanvas | null = null;
let textContext: OffscreenCanvasRenderingContext2D | null = null;
let disposed = false,
  drawing = false,
  scheduled = false;
let pending: Extract<DiagnosticWorkerMessage, { type: "frame" }> | null = null;
let target: DiagnosticFrame | null = null;
let camera: TileCameraSnapshot | null = null;
let cameras: readonly TileCameraSnapshot[] = [];
let cameraDirty = false;
let viewport: ReturnType<typeof projectTileDiagnosticViewports> | null = null;
const fail = (error: unknown) => {
  renderer?.dispose();
  renderer = null;
  if (!disposed)
    host.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
};
const schedule = () => {
  if (disposed || drawing || scheduled) return;
  scheduled = true;
  // Demand-driven: no permanent animation loop for an unchanged snapshot.
  const callback = () => {
    scheduled = false;
    void draw();
  };
  if (typeof requestAnimationFrame === "function")
    requestAnimationFrame(callback);
  else setTimeout(callback, 1000 / 60);
};
const draw = async () => {
  if (disposed || drawing || !renderer || !textCanvas || !textContext) return;
  drawing = true;
  const started = performance.now();
  const update = pending;
  pending = null;
  try {
    if (update) {
      if (update.snapshot) {
        snapshot = update.snapshot;
        cameraDirty = true;
        renderer.setScene(buildDiagnosticPrimitives(snapshot));
      }
      if (
        target?.followPaddingPercent !== update.frame.followPaddingPercent ||
        target?.cameraFocus !== update.frame.cameraFocus
      )
        cameraDirty = true;
      target = update.frame;
    }
    if (!snapshot || !target) return;
    if (cameraDirty) {
      viewport =
        camera && snapshot.viewportBasis
          ? projectTileDiagnosticViewports(
              snapshot.viewportBasis,
              [camera, ...cameras],
              target.cameraFocus,
              target.followPaddingPercent,
              snapshot.tileBounds
            )
          : null;
      cameraDirty = false;
    }
    // Camera presentation is immediate, never interpolated or held behind tile capture.
    const frame = {
      ...target,
      view: target.followCamera && viewport ? viewport.view : target.view,
    };
    const width = Math.max(1, Math.round(frame.width * frame.pixelRatio)),
      height = Math.max(1, Math.round(frame.height * frame.pixelRatio));
    if (textCanvas.width !== width || textCanvas.height !== height) {
      textCanvas.width = width;
      textCanvas.height = height;
    }
    drawDiagnosticText(textContext, snapshot, frame);
    const selected = buildDiagnosticSelection(snapshot, frame.selection);
    const colors = ["#ffffff", "#ffbf69", "#7bffb2", "#c7a0ff"];
    const frustums =
      target.showFrustum === false
        ? []
        : viewport
        ? viewport.views.map((view, i) =>
            buildDiagnosticViewport(
              view,
              colors[i % colors.length],
              // The main camera receives; a light only contributes geometry,
              // and its arrow is read in the middle of the drawn view.
              (i === 0 ? camera : cameras[i - 1])?.role === "geometry" && {
                x: frame.view.x + frame.view.w / 2,
                y: frame.view.y + frame.view.h / 2,
              }
            )
          )
        : [buildDiagnosticViewport(snapshot)];
    const dynamic = new Float32Array(
      selected.length + frustums.reduce((n, f) => n + f.length, 0)
    );
    dynamic.set(selected);
    let offset = selected.length;
    for (const frustum of frustums) {
      dynamic.set(frustum, offset);
      offset += frustum.length;
    }
    const metrics = await renderer.render(frame, dynamic);
    if (!disposed && update)
      host.postMessage({
        type: "frame",
        ...metrics,
        workerMs: performance.now() - started,
      });
  } catch (error) {
    fail(error);
  } finally {
    drawing = false;
    if (renderer && (pending || cameraDirty) && target) schedule();
  }
};
host.onmessage = async ({ data }) => {
  try {
    if (data.type === "dispose") {
      disposed = true;
      pending = null;
      camera = null;
      cameras = [];
      renderer?.dispose();
      renderer = null;
      snapshot = null;
      host.postMessage({ type: "disposed" });
    } else if (data.type === "camera") {
      camera = data.camera;
      cameras = data.cameras ?? [];
      cameraDirty = true;
      if (target) schedule();
    } else if (data.type === "init") {
      textCanvas = data.text;
      textContext = textCanvas.getContext("2d");
      if (!textContext)
        throw new Error("Diagnostic text canvas is unavailable.");
      renderer = await createTileDiagnosticRenderer([
        data.foreground,
        data.contrast,
      ]);
      if (disposed) {
        renderer.dispose();
        renderer = null;
        return;
      }
      host.postMessage({ type: "ready" });
    } else {
      pending = data;
      schedule();
    }
  } catch (error) {
    fail(error);
  }
};
