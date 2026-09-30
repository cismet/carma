import { buildDiagnosticPrimitives } from "../../core/diagnostics/tile-diagnostic-primitives";
import { buildDiagnosticBoxScene } from "../../core/diagnostics/tile-diagnostic-box-scene";
import {
  buildDiagnosticSelection,
  buildDiagnosticViewportGeometry,
} from "../../core/diagnostics/tile-diagnostic-camera-primitives";
import {
  drawDiagnosticText,
  type DiagnosticLabelHit,
} from "../../core/diagnostics/tile-diagnostic-labels";
import {
  TILE_DIAGNOSTIC_WORKER_COMMAND,
  TILE_DIAGNOSTIC_WORKER_REPLY,
  PRIMITIVE_FLOATS,
  rgba,
  type DiagnosticLegendEntry,
  type DiagnosticSnapshot,
  type DiagnosticWorkerMessage,
  type DiagnosticFrame,
} from "../../core/diagnostics/tile-diagnostic-scene";
import {
  TILE_CAMERA_ROLE,
  type TileCameraSnapshot,
} from "../../core/tile-camera-demand";
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
let pending: Extract<
  DiagnosticWorkerMessage,
  { type: typeof TILE_DIAGNOSTIC_WORKER_COMMAND.FRAME }
> | null = null;
let target: DiagnosticFrame | null = null;
let camera: TileCameraSnapshot | null = null;
let cameras: readonly TileCameraSnapshot[] = [];
let cameraDirty = false;
let viewport: ReturnType<typeof projectTileDiagnosticViewports> | null = null;
let renderedSnapshot: DiagnosticSnapshot | null = null;
let sourceSnapshot: DiagnosticSnapshot | null = null;
let renderedOrbit = "";
let boxScene: ReturnType<typeof buildDiagnosticBoxScene> | null = null;
let sceneLegend: DiagnosticLegendEntry[] = [];
const fail = (error: unknown) => {
  renderer?.dispose();
  renderer = null;
  if (!disposed)
    host.postMessage({
      type: TILE_DIAGNOSTIC_WORKER_REPLY.ERROR,
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
    const basis = viewport?.basis ?? snapshot.viewportBasis;
    const orbitKey = basis?.worldToOverview.join(",") ?? "";
    if (sourceSnapshot !== snapshot || renderedOrbit !== orbitKey) {
      sourceSnapshot = snapshot;
      renderedOrbit = orbitKey;
      boxScene = basis
        ? buildDiagnosticBoxScene(snapshot, basis, camera ?? undefined)
        : null;
      renderedSnapshot = boxScene?.annotationSnapshot ?? snapshot;
      if (boxScene) {
        sceneLegend = boxScene.legend;
        renderer.setScene(boxScene.primitives, boxScene.planes);
      } else
        renderer.setScene(
          buildDiagnosticPrimitives(snapshot, (entries) => {
            sceneLegend = entries;
          })
        );
    }
    const scene = renderedSnapshot ?? snapshot;
    // Camera presentation is immediate, never interpolated or held behind tile capture.
    const frame: DiagnosticFrame = {
      ...target,
      view: target.followCamera && viewport ? viewport.view : target.view,
      depthRange: boxScene?.depthRange ?? [-1, 1],
    };
    const width = Math.max(1, Math.round(frame.width * frame.pixelRatio)),
      height = Math.max(1, Math.round(frame.height * frame.pixelRatio));
    if (textCanvas.width !== width || textCanvas.height !== height) {
      textCanvas.width = width;
      textCanvas.height = height;
    }
    const labelHits: DiagnosticLabelHit[] = [];
    drawDiagnosticText(textContext, scene, frame, boxScene?.labelFaces, (hit) =>
      labelHits.push(hit)
    );
    const selectionValues: number[] = [],
      selectionPlanes: number[] = [];
    if (boxScene)
      for (const [record, primary] of frame.selection) {
        const range = boxScene.edgeRanges.get(record);
        if (!range) continue;
        for (let i = range.start; i < range.start + range.count; i++) {
          const item = Array.from(
            boxScene.primitives.subarray(
              i * PRIMITIVE_FLOATS,
              (i + 1) * PRIMITIVE_FLOATS
            )
          );
          item[5] = 2;
          item.splice(8, 4, ...rgba(primary ? "#fff05a" : "#ff974f"));
          selectionValues.push(...item);
          selectionPlanes.push(
            ...boxScene.planes.subarray(i * 12, (i + 1) * 12)
          );
        }
      }
    const selected = boxScene
      ? new Float32Array(selectionValues)
      : buildDiagnosticSelection(scene, frame.selection);
    const selectedPlanes = boxScene
      ? new Float32Array(selectionPlanes)
      : new Float32Array(
          Array.from({ length: selected.length / PRIMITIVE_FLOATS }, () => [
            0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0,
          ]).flat()
        );
    const legend = [...sceneLegend];
    const appendCutLegend = (
      primitives: Float32Array,
      id: string,
      label: string
    ) => {
      if (!primitives.length) return;
      const sample = Array.from(primitives.subarray(0, PRIMITIVE_FLOATS));
      if (sample[4] === 3 || sample[4] === 5) sample.splice(0, 4, 1, 9, 11, 2);
      else sample.splice(0, 4, 6, 6, 4, 4);
      for (
        let i = PRIMITIVE_FLOATS;
        i < primitives.length;
        i += PRIMITIVE_FLOATS
      ) {
        if (primitives[i + 4] !== 7) continue;
        const direction = Array.from(
          primitives.subarray(i, i + PRIMITIVE_FLOATS)
        );
        direction.splice(0, 4, 6, 6, 4, 4);
        sample.push(...direction);
        break;
      }
      if (sample.every(Number.isFinite))
        legend.push({ id, label, primitives: sample });
    };
    appendCutLegend(selected, "selection", "Selection");
    const colors = ["#ffffff", "#ffbf69", "#7bffb2", "#c7a0ff"];
    const frustums =
      target.showFrustum === false
        ? []
        : viewport
        ? viewport.views.map((view, i) => {
            const light =
              (i === 0 ? camera : cameras[i - 1])?.role ===
              TILE_CAMERA_ROLE.GEOMETRY;
            const geometry = buildDiagnosticViewportGeometry(
              view,
              light ? "rgba(246, 250, 164, 0.6)" : colors[i % colors.length],
              light
            );
            appendCutLegend(
              geometry.primitives,
              `camera-${i}`,
              light
                ? "Sun cuts / light"
                : i === 0
                ? "Camera cuts"
                : `Camera ${i + 1} cuts`
            );
            return geometry;
          })
        : [buildDiagnosticViewportGeometry(snapshot)];
    if (!viewport && frustums.length)
      appendCutLegend(frustums[0].primitives, "camera-0", "Camera cuts");
    const dynamic = new Float32Array(
      selected.length + frustums.reduce((n, f) => n + f.primitives.length, 0)
    );
    const dynamicPlanes = new Float32Array(
      (dynamic.length / PRIMITIVE_FLOATS) * 12
    );
    dynamic.set(selected);
    dynamicPlanes.set(selectedPlanes);
    let offset = selected.length;
    for (const frustum of frustums) {
      dynamic.set(frustum.primitives, offset);
      dynamicPlanes.set(frustum.planes, (offset / PRIMITIVE_FLOATS) * 12);
      offset += frustum.primitives.length;
    }
    // The light direction marker may sit in front of all content boxes.
    const depths =
      viewport?.views.flatMap((view) => [
        ...view.edgeDepths,
        ...(view.nearDepth === undefined ? [] : [view.nearDepth]),
      ]) ?? [];
    let [near, far] = frame.depthRange!;
    for (const depth of depths) {
      if (Number.isFinite(depth)) {
        near = Math.min(near, depth);
        far = Math.max(far, depth);
      }
    }
    const margin = Math.max(1e-6, (far - near) * 0.001);
    frame.depthRange = [near - margin, far + margin];
    const metrics = await renderer.render(frame, dynamic, dynamicPlanes);
    if (!disposed)
      host.postMessage({
        type: TILE_DIAGNOSTIC_WORKER_REPLY.FRAME,
        completed: Boolean(update),
        legend,
        labelHits,
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
    if (data.type === TILE_DIAGNOSTIC_WORKER_COMMAND.DISPOSE) {
      disposed = true;
      pending = null;
      camera = null;
      cameras = [];
      renderer?.dispose();
      renderer = null;
      snapshot = null;
      sceneLegend = [];
      boxScene = null;
      renderedSnapshot = null;
      sourceSnapshot = null;
      host.postMessage({ type: TILE_DIAGNOSTIC_WORKER_REPLY.DISPOSED });
    } else if (data.type === TILE_DIAGNOSTIC_WORKER_COMMAND.CAMERA) {
      camera = data.camera;
      cameras = data.cameras ?? [];
      cameraDirty = true;
      if (target) schedule();
    } else if (data.type === TILE_DIAGNOSTIC_WORKER_COMMAND.INIT) {
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
      host.postMessage({ type: TILE_DIAGNOSTIC_WORKER_REPLY.READY });
    } else {
      pending = data;
      schedule();
    }
  } catch (error) {
    fail(error);
  }
};
