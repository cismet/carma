import { drawImageLevelReadiness } from "./draw-image-level-readiness";
import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import type { DevicePixels, Ratio } from "@carma-units";
import type {
  ImageLevelPlanOptions,
  ImageRect,
} from "../core/image-level-plan";
import { drawImageLevels } from "./draw-image-levels";
import type { ImageLevelStack } from "./image-level-stack";
import {
  ImageLevelStackPool,
  type ImageLevelStackPoolMetrics,
  type ImagePyramidSource,
} from "./image-level-stack-pool";
import { ThreeImageLevels } from "./three-image-levels";

export type ImagePyramidViewerProps = {
  source: ImagePyramidSource;
  pool?: ImageLevelStackPool;
  /** "three" draws with the same GPU compositor the oblique scene uses. */
  renderer?: "canvas" | "three";
  /** Fade tile edges with missing same-level neighbors, in CSS pixels; 0 disables. */
  featherPx?: number;
  /** Fovea radius as fraction of the visible half diagonal; null loads the target uniformly. */
  foveaRadius?: number | null;
  ringTiles?: number;
  /** Levels with a shorter long edge are neither loaded nor shown; 0 uses all. */
  minLevelEdge?: DevicePixels;
  diagnostics?: boolean;
  height?: number;
  /** Fill a height-constrained parent instead of using `height`. */
  fill?: boolean;
  dataTestId?: string;
  onMetrics?: (metrics: ImageLevelStackPoolMetrics) => void;
};

const BUTTON: CSSProperties = {
  background: "#273343",
  color: "inherit",
  border: "1px solid #5a6678",
  borderRadius: 4,
  padding: "4px 7px",
  font: "inherit",
  cursor: "pointer",
};
const MiB = 1024 * 1024;

/**
 * Pan/zoom viewer over a transparent stack of sparse pyramid levels. Each frame
 * draws resident tiles directly; the stack loads the target level for the
 * physical display density, its parent underneath, rings for pans and the
 * next finer level ahead of zoom-in.
 */
export const ImagePyramidViewer = ({
  source,
  pool,
  renderer = "canvas",
  featherPx = 0,
  foveaRadius = null,
  ringTiles = 1,
  minLevelEdge,
  diagnostics = true,
  height = 600,
  fill = false,
  dataTestId,
  onMetrics,
}: ImagePyramidViewerProps) => {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const readout = useRef<HTMLOutputElement>(null);
  const levelsHost = useRef<HTMLDivElement>(null);
  const navigation = useRef<{
    fit: () => void;
    pixels: () => void;
    step: (f: number) => void;
  } | null>(null);
  const planOptions = useRef<Partial<ImageLevelPlanOptions>>({
    foveaRadius,
    ringTiles,
    minLevelEdge,
  });
  const redraw = useRef<(() => void) | null>(null);
  const settings = useRef({ featherPx, onMetrics });
  settings.current = { featherPx, onMetrics };
  const stackRef = useRef<ImageLevelStack | null>(null);
  const composerRef = useRef<ThreeImageLevels | null>(null);
  const ownPool = useRef<ImageLevelStackPool | null>(null);
  if (!pool && !ownPool.current)
    ownPool.current = new ImageLevelStackPool({ maxImages: 1 });
  const activePool = pool ?? ownPool.current!;
  useEffect(
    () => () => {
      ownPool.current?.dispose();
      ownPool.current = null;
    },
    []
  );

  useEffect(() => {
    const root = stage.current!,
      display = canvas.current!;
    const { stack, release } = activePool.acquire(source);
    stackRef.current = stack;
    stack.configure(planOptions.current);
    let gl: THREE.WebGLRenderer | null = null;
    let composer: ThreeImageLevels | null = null;
    const context = renderer === "canvas" ? display.getContext("2d") : null;
    if (renderer === "three") {
      gl = new THREE.WebGLRenderer({
        canvas: display,
        alpha: true,
        antialias: false,
      });
      composer = new ThreeImageLevels();
      composer.attach(stack);
      composerRef.current = composer;
    }
    let zoom = 0,
      centerX = 0,
      centerY = 0,
      width = 1,
      height = 1,
      ratio = 1;
    let intent: "in" | "out" | null = null;
    let intentTimer: ReturnType<typeof setTimeout> | undefined;
    let focus: { x: number; y: number } | null = null;
    let frame: number | undefined;
    let dragging: { x: number; y: number } | null = null;
    let diagnosticsAt = 0;
    const native = () => stack.pyramid?.native ?? source.nativeSize ?? null;
    const fitZoom = () => {
      const size = native();
      return size ? Math.min(width / size.width, height / size.height) : 1;
    };
    const finestPixelZoom = () => {
      const pyramid = stack.pyramid;
      if (!pyramid) return fitZoom();
      const finest = pyramid.levels.reduce((a, b) =>
        a.level <= b.level ? a : b
      );
      return finest.width / pyramid.native.width / ratio;
    };
    const visible = (): ImageRect => ({
      x: (centerX - width / 2 / zoom) as DevicePixels,
      y: (centerY - height / 2 / zoom) as DevicePixels,
      width: (width / zoom) as DevicePixels,
      height: (height / zoom) as DevicePixels,
    });
    const publish = () => {
      if (!zoom) return;
      stack.setView(
        {
          visible: visible(),
          density: (zoom * ratio) as Ratio,
          focus: focus
            ? { x: focus.x as DevicePixels, y: focus.y as DevicePixels }
            : undefined,
        },
        Math.ceil(width * ratio) * Math.ceil(height * ratio),
        intent
      );
      schedule();
    };
    const setZoom = (next: number, anchor?: { x: number; y: number }) => {
      const limit = Math.max(fitZoom() * 4, finestPixelZoom() * 4);
      const clamped = Math.min(limit, Math.max(fitZoom() / 4, next));
      intent = clamped > zoom ? "in" : clamped < zoom ? "out" : intent;
      clearTimeout(intentTimer);
      intentTimer = setTimeout(() => {
        intent = null;
        publish();
      }, 400);
      if (anchor) {
        // Keep the native pixel under the pointer fixed.
        const nx = centerX + (anchor.x - width / 2) / zoom,
          ny = centerY + (anchor.y - height / 2) / zoom;
        centerX = nx - (anchor.x - width / 2) / clamped;
        centerY = ny - (anchor.y - height / 2) / clamped;
        focus = { x: nx, y: ny };
      } else focus = null;
      zoom = clamped;
      publish();
    };
    const fit = () => {
      const size = native();
      if (!size) return;
      centerX = size.width / 2;
      centerY = size.height / 2;
      focus = null;
      zoom = fitZoom();
      publish();
    };
    navigation.current = {
      fit,
      pixels: () => setZoom(finestPixelZoom()),
      step: (factor) => setZoom(zoom * factor),
    };
    const draw = () => {
      frame = undefined;
      const pixelWidth = Math.max(1, Math.round(width * ratio)),
        pixelHeight = Math.max(1, Math.round(height * ratio));
      if (gl && composer) {
        composer.featherPx = settings.current.featherPx * ratio;
        gl.setPixelRatio(1);
        gl.setSize(pixelWidth, pixelHeight, false);
        composer.renderToScreen(gl, visible(), {
          width: pixelWidth,
          height: pixelHeight,
        });
      } else if (context) {
        if (display.width !== pixelWidth) display.width = pixelWidth;
        if (display.height !== pixelHeight) display.height = pixelHeight;
        const area = visible();
        drawImageLevels(
          context,
          stack,
          { originX: area.x, originY: area.y, scale: zoom * ratio },
          { width: pixelWidth, height: pixelHeight },
          { featherPx: settings.current.featherPx * ratio }
        );
      }
      if (performance.now() - diagnosticsAt > 100) {
        diagnosticsAt = performance.now();
        drawDiagnostics();
      }
    };
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(draw);
    };
    const levelCanvases = new Map<number, HTMLCanvasElement>();
    const drawDiagnostics = () => {
      const metrics = stack.metrics;
      settings.current.onMetrics?.(activePool.metrics);
      if (readout.current) {
        const scale = metrics.targetScale;
        const text = [
          stack.error
            ? `Fehler: ${stack.error}`
            : metrics.visibleReady
            ? "Bereit"
            : "Lädt",
          metrics.target !== null
            ? `Ziel L${metrics.target} · ${
                scale ? (scale * 100).toFixed(0) : "?"
              } %`
            : "",
          `${(metrics.decodedBytes / MiB).toFixed(1)} / ${(
            metrics.budgetBytes / MiB
          ).toFixed(0)} MiB decodiert (${metrics.decodedTiles} Kacheln)`,
          `${(metrics.compressedBytes / MiB).toFixed(1)} MiB komprimiert · ${
            metrics.requests
          } Requests`,
        ]
          .filter(Boolean)
          .join(" · ");
        // Clipped with an ellipsis in narrow cells; the title keeps the full text.
        if (readout.current.textContent !== text) {
          readout.current.textContent = text;
          readout.current.title = text;
        }
      }
      const host = levelsHost.current;
      if (!host || !diagnostics) return;
      const plan = stack.plan;
      const area = visible();
      const size = native();
      const used = stack.readiness();
      for (const [level, view] of levelCanvases)
        if (!used.some((entry) => entry.level === level)) {
          view.remove();
          levelCanvases.delete(level);
        }
      for (const level of used)
        drawImageLevelReadiness(host, levelCanvases, level, plan, area, size);
    };
    redraw.current = schedule;
    const onStack = stack.subscribe(schedule);
    // Diagnostics follow every change; pixels only change with resident tiles.
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = root.getBoundingClientRect();
      setZoom(zoom * 2 ** (-event.deltaY / 500), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
    };
    const down = (event: PointerEvent) => {
      if ((event.target as Element).closest?.("[data-image-pyramid-controls]"))
        return;
      dragging = { x: event.clientX, y: event.clientY };
      root.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      centerX -= (event.clientX - dragging.x) / zoom;
      centerY -= (event.clientY - dragging.y) / zoom;
      dragging = { x: event.clientX, y: event.clientY };
      focus = null;
      publish();
    };
    const up = () => {
      dragging = null;
    };
    const resize = () => {
      const first = !zoom;
      ratio = window.devicePixelRatio || 1;
      width = Math.max(1, root.clientWidth);
      height = Math.max(1, root.clientHeight);
      if (first) fit();
      else publish();
    };
    root.addEventListener("wheel", wheel, { passive: false });
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    void stack.ready.then(() => {
      if (!source.nativeSize) fit();
      schedule();
    }, schedule);
    return () => {
      observer.disconnect();
      root.removeEventListener("wheel", wheel);
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", up);
      clearTimeout(intentTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      onStack();
      composer?.dispose();
      gl?.dispose();
      composerRef.current = null;
      stackRef.current = null;
      navigation.current = null;
      for (const view of levelCanvases.values()) view.remove();
      release();
    };
  }, [activePool, source, renderer, diagnostics]);
  useEffect(() => {
    planOptions.current = { foveaRadius, ringTiles, minLevelEdge };
    stackRef.current?.configure(planOptions.current);
  }, [foveaRadius, ringTiles, minLevelEdge]);
  useEffect(() => {
    redraw.current?.();
  }, [featherPx]);

  return (
    <div
      data-test-id={dataTestId}
      style={{
        display: "flex",
        flexDirection: "column",
        height: fill ? "100%" : height,
        minHeight: 0,
        minWidth: 0,
        color: "#e8edf4",
        font: "12px system-ui, sans-serif",
        background: "#141a23",
      }}
    >
      <div
        ref={stage}
        style={{
          position: "relative",
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "hidden",
          touchAction: "none",
          cursor: "grab",
        }}
      >
        <canvas
          ref={canvas}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        />
        <div
          data-image-pyramid-controls
          style={{
            position: "absolute",
            right: 8,
            top: 8,
            display: "flex",
            gap: 4,
          }}
        >
          <button
            type="button"
            style={BUTTON}
            onClick={() => navigation.current?.fit()}
          >
            Fit
          </button>
          <button
            type="button"
            style={BUTTON}
            onClick={() => navigation.current?.pixels()}
          >
            1:1
          </button>
          <button
            type="button"
            style={BUTTON}
            onClick={() => navigation.current?.step(1 / 1.5)}
          >
            −
          </button>
          <button
            type="button"
            style={BUTTON}
            onClick={() => navigation.current?.step(1.5)}
          >
            +
          </button>
        </div>
      </div>
      {diagnostics && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "4px 8px",
            flex: "0 0 auto",
            overflowX: "auto",
          }}
        >
          <div
            ref={levelsHost}
            style={{ display: "flex", gap: 4, flex: "0 0 auto" }}
          />
          <output
            ref={readout}
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          />
        </div>
      )}
    </div>
  );
};
