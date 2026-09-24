import {
  buildDiagnosticPrimitives,
  buildDiagnosticSelection,
  drawDiagnosticText,
  buildDiagnosticViewport,
  TILE_RECORD_FLOATS,
  type DiagnosticSnapshot,
  type DiagnosticWorkerMessage,
  type DiagnosticFrame,
} from "../../core/diagnostics/tile-diagnostic-scene";
import type { TileCameraSnapshot } from "../../core/tile-camera-demand";
import { projectTileDiagnosticViewports } from "./tile-diagnostic-viewport";
import * as THREE from "three";
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
let renderedSnapshot: DiagnosticSnapshot | null = null;
let sourceSnapshot: DiagnosticSnapshot | null = null;
let renderedOrbit = "";
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
        renderedOrbit = "";
      }
      if (
        target?.followPaddingPercent !== update.frame.followPaddingPercent ||
        target?.cameraFocus !== update.frame.cameraFocus ||
        target?.orbit?.yaw !== update.frame.orbit?.yaw ||
        target?.orbit?.pitch !== update.frame.orbit?.pitch
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
              target.orbit
            )
          : null;
      cameraDirty = false;
    }
    const orbitKey = `${target.orbit?.yaw ?? 0},${target.orbit?.pitch ?? 0}:${
      target.cameraFocus ?? ""
    }:${
      target.orbit?.yaw || target.orbit?.pitch
        ? viewport?.basis.worldToOverview.join(",")
        : ""
    }`;
    if (sourceSnapshot !== snapshot || renderedOrbit !== orbitKey) {
      sourceSnapshot = snapshot;
      renderedOrbit = orbitKey;
      const basis = viewport?.basis;
      const bounds = basis?.rectBounds;
      const transforms = basis?.rectTransforms;
      let scene = snapshot;
      if (
        basis &&
        bounds &&
        (target.orbit?.yaw || target.orbit?.pitch) &&
        bounds.length >= (snapshot.tiles.length / TILE_RECORD_FLOATS) * 6
      ) {
        const tiles = snapshot.tiles.slice();
        const worldToOverview = new THREE.Matrix4().fromArray(
          basis.worldToOverview
        );
        const box = new THREE.Box3();
        const transform = new THREE.Matrix4();
        const [scale, offsetX, offsetY, scaleY = scale] = basis.screen;
        for (let i = 0; i < tiles.length / TILE_RECORD_FLOATS; i++) {
          box.min.fromArray(bounds, i * 6);
          box.max.fromArray(bounds, i * 6 + 3);
          if (transforms) transform.fromArray(transforms, i * 16);
          else transform.identity();
          const projected = box.applyMatrix4(
            worldToOverview.clone().multiply(transform)
          );
          const x0 = offsetX + projected.min.x * scale;
          const x1 = offsetX + projected.max.x * scale;
          const y0 = offsetY + projected.min.z * scaleY;
          const y1 = offsetY + projected.max.z * scaleY;
          const offset = i * TILE_RECORD_FLOATS;
          tiles[offset] = Math.min(x0, x1);
          tiles[offset + 1] = Math.min(y0, y1);
          tiles[offset + 2] = Math.abs(x1 - x0);
          tiles[offset + 3] = Math.abs(y1 - y0);
        }
        scene = { ...snapshot, tiles, extent: null, edges: new Float32Array() };
      }
      renderedSnapshot = scene;
      renderer.setScene(buildDiagnosticPrimitives(scene));
    }
    const scene = renderedSnapshot ?? snapshot;
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
    drawDiagnosticText(textContext, scene, frame);
    const selected = buildDiagnosticSelection(scene, frame.selection);
    const colors = ["#ffffff", "#ffbf69", "#7bffb2", "#c7a0ff"];
    const frustums =
      target.showFrustum === false
        ? []
        : viewport
        ? viewport.views.map((view, i) => {
            const light =
              (i === 0 ? camera : cameras[i - 1])?.role === "geometry";
            return buildDiagnosticViewport(
              view,
              light ? "rgba(246, 250, 164, 0.6)" : colors[i % colors.length],
              light
            );
          })
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
        view: [frame.view.x, frame.view.y, frame.view.w, frame.view.h],
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
