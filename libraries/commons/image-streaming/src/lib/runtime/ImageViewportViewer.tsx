import { useEffect, useRef, type CSSProperties } from "react";
import type { CssPixels, Radians, Ratio } from "@carma-units";
import {
  nativePreviewWindow,
  type NativePreviewWindow,
} from "../core/image-viewport-window";
import {
  ImageViewportPool,
  type ImageViewportSource,
  type ImageViewportSnapshot,
  type ImageViewportBaseline,
} from "./image-viewport-pool";

const ZOOM_BUTTON_STYLE: CSSProperties = {
  background: "#273343",
  color: "inherit",
  border: "1px solid #5a6678",
  borderRadius: 4,
  padding: "4px 7px",
  font: "inherit",
};

export type ImageViewportViewerProps = {
  source: ImageViewportSource;
  pool?: ImageViewportPool;
  /** External crop/physical target; omit for built-in pan and zoom. */
  viewport?: NativePreviewWindow;
  zoom?: number;
  height?: number;
  /** Fill a height-constrained parent; diagnostics keep their natural height. */
  fill?: boolean;
  /** Emits built-in pan/zoom/resize changes, never echoes a host-controlled crop. */
  onViewportChange?: (viewport: NativePreviewWindow) => void;
  onMetrics?: (
    snapshot: ImageViewportSnapshot,
    pool: ImageViewportPool["metrics"]
  ) => void;
};

/** Image-only adapter to the production worker; pixels never enter React state.
 * Stories: Libraries/Image streaming → Large image and Pool carousel.
 */
export const ImageViewportViewer = ({
  source,
  pool,
  viewport,
  zoom = 1,
  height = 600,
  fill = false,
  onViewportChange,
  onMetrics,
}: ImageViewportViewerProps) => {
  const stage = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    overview = useRef<HTMLCanvasElement>(null),
    levelsOverview = useRef<HTMLDivElement>(null),
    diagnostic = useRef<HTMLOutputElement>(null),
    zoomStatus = useRef<HTMLOutputElement>(null),
    liveResolution = useRef<HTMLOutputElement>(null),
    fitButton = useRef<HTMLButtonElement>(null),
    pixelButton = useRef<HTMLButtonElement>(null);
  const ownPool = useRef<ImageViewportPool | null>(null);
  if (!pool && !ownPool.current) ownPool.current = new ImageViewportPool();
  const activePool = pool ?? ownPool.current!;
  const callbacks = useRef({ onViewportChange, onMetrics, viewport });
  callbacks.current = { onViewportChange, onMetrics, viewport };
  const update = useRef<(() => void) | null>(null),
    zoomRef = useRef(zoom);
  const navigation = useRef<{
    fit: () => void;
    pixels: () => void;
    step: (factor: number) => void;
  } | null>(null);
  const disposeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  useEffect(() => {
    if (activePool === ownPool.current) clearTimeout(disposeTimer.current);
    return () => {
      if (activePool === ownPool.current)
        disposeTimer.current = setTimeout(() => {
          activePool.dispose();
          ownPool.current = null;
        }, 0);
    };
  }, [activePool]);
  useEffect(() => {
    const root = stage.current!,
      display = canvas.current!;
    if (overview.current) {
      const scale = 56 / Math.max(source.nativeSize.width, source.nativeSize.height);
      overview.current.width = Math.max(1, Math.round(source.nativeSize.width * scale));
      overview.current.height = Math.max(1, Math.round(source.nativeSize.height * scale));
    }
    zoomRef.current = zoom;
    const handle = activePool.acquire(source);
    let snapshot = handle.snapshot();
    let presented: ImageViewportBaseline | null = null;
    let painted: { bitmap: ImageBitmap; left: number; top: number; scaleX: number; scaleY: number } | null = null;
    let pan = { x: 0, y: 0 },
      width = 1,
      height = 1,
      ratio = 1;
    let dragging: { x: number; y: number; pointer: number } | null = null;
    let currentWindow: NativePreviewWindow | null = null;
    let overviewTimer: ReturnType<typeof setTimeout> | undefined;
    let overviewDrawnAt = -Infinity;
    let renderFrame: number | undefined;
    const levelCanvases = new Map<
      number,
      { figure: HTMLElement; canvas: HTMLCanvasElement; caption: HTMLElement }
    >();
    const fitScale = () =>
      Math.min(
        width / source.nativeSize.width,
        height / source.nativeSize.height
      );
    const finestDensity = () => {
      const minimum = Number(source.minimumQualityLevel ?? 0);
      const stored = (snapshot.readiness ?? [])
        .filter((level) => level.level >= minimum)
        .map((level) => Math.max(
          level.width / source.nativeSize.width,
          level.height / source.nativeSize.height
        ));
      return Math.min(
        source.maxSourceDensity ?? 1,
        stored.length ? Math.max(...stored) : 2 ** -minimum
      );
    };
    const drawCrop = (
      context: CanvasRenderingContext2D,
      crop: NativePreviewWindow["source"],
      color: string,
      width: number,
      height: number
    ) => {
      context.strokeStyle = color;
      context.lineWidth = 1;
      context.strokeRect(
        (crop.x / source.nativeSize.width) * width,
        (crop.y / source.nativeSize.height) * height,
        (crop.width / source.nativeSize.width) * width,
        (crop.height / source.nativeSize.height) * height
      );
    };
    const drawOverviews = () => {
      overviewTimer = undefined;
      overviewDrawnAt = performance.now();
      const context = overview.current?.getContext("2d");
      if (context && overview.current) {
        const w = overview.current.width,
          h = overview.current.height;
        context.clearRect(0, 0, w, h);
        context.fillStyle = "#303844";
        context.fillRect(0, 0, w, h);
        if (snapshot.overview)
          context.drawImage(snapshot.overview, 0, 0, w, h);
        if (snapshot.frame)
          drawCrop(context, snapshot.frame.source, "#71e390", w, h);
        for (const prepared of snapshot.preparedFrames ?? [])
          drawCrop(context, prepared.crop, "#bca0ff", w, h);
        if (currentWindow)
          drawCrop(context, currentWindow.source, "white", w, h);
      }
      const host = levelsOverview.current;
      if (!host) return;
      const levels = snapshot.readiness ?? [];
      host.style.display = levels.length ? "flex" : "none";
      const retainedLevels = new Set(levels.map((level) => level.level));
      for (const [level, value] of levelCanvases) {
        if (retainedLevels.has(level)) continue;
        value.figure.remove();
        value.canvas.width = value.canvas.height = 1;
        levelCanvases.delete(level);
      }
      const colors = ["#303844", "#f5cd66", "#6da8ff", "#71e390"];
      for (const level of levels) {
        let view = levelCanvases.get(level.level);
        if (!view) {
          const figure = document.createElement("figure");
          const canvas = document.createElement("canvas");
          const caption = document.createElement("figcaption");
          Object.assign(figure.style, {
            margin: "0", position: "relative", flex: "0 0 auto",
            font: "11px monospace", border: "1px solid #5a6678", borderRadius: "4px",
            overflow: "hidden",
          });
          figure.tabIndex = 0;
          const scale = 56 / Math.max(level.width, level.height);
          canvas.width = Math.max(1, Math.round(level.width * scale));
          canvas.height = Math.max(1, Math.round(level.height * scale));
          canvas.style.display = "block";
          Object.assign(caption.style, {
            position: "absolute", left: "2px", bottom: "2px",
            background: "#141a23cc", color: "white", padding: "1px 3px",
            borderRadius: "2px", pointerEvents: "none",
          });
          canvas.setAttribute("aria-label", `${source.kind.toUpperCase()} L${level.level} Tile-Status`);
          canvas.dataset.testId = `image-viewport-level-${level.level}`;
          figure.append(canvas, caption);
          host.append(figure);
          view = { figure, canvas, caption };
          levelCanvases.set(level.level, view);
        }
        const { canvas, caption } = view;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = colors[0];
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const counts = [0, 0, 0, 0];
        for (let cell = 0; cell < level.states.length; cell++) {
          const state = level.states[cell];
          counts[state]++;
          const x = (cell % level.cols) * level.tileWidth;
          const y = Math.floor(cell / level.cols) * level.tileHeight;
          const w = Math.min(level.tileWidth, level.width - x);
          const h = Math.min(level.tileHeight, level.height - y);
          ctx.fillStyle = colors[state] ?? colors[0];
          ctx.fillRect(
            (x / level.width) * canvas.width,
            (y / level.height) * canvas.height,
            Math.max(0, (w / level.width) * canvas.width - 0.4),
            Math.max(0, (h / level.height) * canvas.height - 0.4)
          );
        }
        for (const prepared of snapshot.preparedFrames ?? [])
          drawCrop(ctx, prepared.crop, "#bca0ff", canvas.width, canvas.height);
        const warmPlans = (snapshot.neighborhoodReadiness ?? []).filter((plan) => plan.level === level.level);
        for (const plan of warmPlans) {
          const [left, top, right, bottom] = plan.nativeBounds;
          ctx.strokeStyle = plan.role === "next-finer" ? "#60caff" : plan.role === "parent" ? "#f5cd66" : "#71e390";
          ctx.strokeRect(left / source.nativeSize.width * canvas.width,
            top / source.nativeSize.height * canvas.height,
            (right - left) / source.nativeSize.width * canvas.width,
            (bottom - top) / source.nativeSize.height * canvas.height);
        }
        if (currentWindow)
          drawCrop(
            ctx,
            currentWindow.source,
            "white",
            canvas.width,
            canvas.height
          );
        const previouslyFetched = level.previouslyFetchedCells.reduce(
          (count, fetched) => count + Number(fetched !== 0),
          0
        );
        const currentInput = snapshot.input?.level === level.level;
        const overviewInput = snapshot.overviewInput?.level === level.level;
        caption.textContent = `L${level.level}${currentInput ? " →" : ""}`;
        view.figure.style.borderColor = currentInput ? "#60caff" : "#5a6678";
        view.figure.style.outline = currentInput ? "1px solid #60caff" : "none";
        const detail = [
          ...(currentInput ? ["Quelle des aktuell dargestellten Canvas"] : []),
          ...(overviewInput ? ["Separat gehaltene grobe Übersicht"] : []),
          `L${level.level} · ${level.width}×${level.height}`,
          `${level.cols}×${level.rows}: ${counts[1]} lädt, ${counts[2]} lokal, ${counts[3]} decodiert`,
          `${previouslyFetched} zuvor geladen · Übersicht ${level.wholeOverviewReady ? "bereit" : "offen"}`,
          ...warmPlans.map((plan) => `${plan.role}: ${plan.encoded}/${plan.totalTiles} lokal, ${plan.decoded}/${plan.totalTiles} decodiert · ${(plan.requiredBytes / 1048576).toFixed(1)} MiB`),
        ].join("\n");
        view.figure.title = detail;
        view.figure.setAttribute("aria-label", detail);
      }
    };
    const scheduleOverviews = () => {
      if (overviewTimer !== undefined) return;
      overviewTimer = setTimeout(
        drawOverviews,
        Math.max(0, 100 - (performance.now() - overviewDrawnAt))
      );
    };
    const render = () => {
      if (currentWindow) {
        const external = callbacks.current.viewport;
        const scaleX = external ? width / external.source.width : fitScale() * zoomRef.current;
        const scaleY = external ? height / external.source.height : scaleX;
        const sourceLeft = external ? -external.source.x * scaleX : width / 2 + pan.x - source.nativeSize.width * scaleX / 2;
        const sourceTop = external ? -external.source.y * scaleY : height / 2 + pan.y - source.nativeSize.height * scaleY / 2;
        const needed = Math.min(scaleX * ratio, scaleY * ratio, finestDensity());
        const covers = (candidate: ImageViewportBaseline) => {
          const a = candidate.frame.source, b = currentWindow!.source;
          return a.x <= b.x && a.y <= b.y &&
            a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height;
        };
        const main = snapshot.bitmap && snapshot.frame ? {
          bitmap: snapshot.bitmap, frame: snapshot.frame, input: snapshot.input ?? undefined,
          density: Math.min(snapshot.bitmap.width / snapshot.frame.source.width,
            snapshot.bitmap.height / snapshot.frame.source.height,
            (snapshot.input?.width ?? source.nativeSize.width) / source.nativeSize.width,
            (snapshot.input?.height ?? source.nativeSize.height) / source.nativeSize.height),
        } : null;
        const candidates = [main, ...(snapshot.bufferedFrames ?? []), snapshot.baseline]
          .filter((candidate): candidate is ImageViewportBaseline => !!candidate && covers(candidate))
          .sort((a, b) => b.density - a.density);
        // Use one fully covering resolution. Mixing an old sharp ROI with a coarse
        // full photograph exposes a rectangular quality boundary on every zoom-out.
        let ready = candidates.find((candidate) => candidate.density >= needed / 2);
        if (!ready && !presented) {
          ready = candidates[0];
          if (!ready && snapshot.overview) ready = {
            bitmap: snapshot.overview,
            frame: { source: { x: 0, y: 0, ...source.nativeSize } as NativePreviewWindow["source"],
              target: { width: snapshot.overview.width, height: snapshot.overview.height } as NativePreviewWindow["target"] },
            input: snapshot.overviewInput ?? undefined,
            density: Math.min(snapshot.overview.width / source.nativeSize.width, snapshot.overview.height / source.nativeSize.height),
          };
        }
        if (ready) {
          const physicalWidth = Math.max(1, Math.ceil(width * ratio));
          const physicalHeight = Math.max(1, Math.ceil(height * ratio));
          const changed = !painted || painted.bitmap !== ready.bitmap || painted.left !== sourceLeft ||
            painted.top !== sourceTop || painted.scaleX !== scaleX || painted.scaleY !== scaleY ||
            display.width !== physicalWidth || display.height !== physicalHeight;
          if (changed) {
            if (display.width !== physicalWidth) display.width = physicalWidth;
            if (display.height !== physicalHeight) display.height = physicalHeight;
            const context = display.getContext("2d");
            if (context) {
              context.clearRect(0, 0, display.width, display.height);
              context.imageSmoothingEnabled = true;
              context.imageSmoothingQuality = "low";
              context.drawImage(ready.bitmap,
                (sourceLeft + ready.frame.source.x * scaleX) * ratio,
                (sourceTop + ready.frame.source.y * scaleY) * ratio,
                ready.frame.source.width * scaleX * ratio,
                ready.frame.source.height * scaleY * ratio);
              presented = ready;
              painted = { bitmap: ready.bitmap, left: sourceLeft, top: sourceTop, scaleX, scaleY };
            }
          }
          Object.assign(display.style, { left: "0", top: "0", width: `${width}px`, height: `${height}px` });
        }
        // If an interaction exposes an unprepared edge, retain the last uniform
        // display until the worker supplies its nearest fully covering level.
      }
      const image = presented?.bitmap ?? null;
      const frame = presented?.frame ?? null;
      const metrics = snapshot.metrics,
        pooled = activePool.metrics;
      if (liveResolution.current) {
        const physical = { width: Math.ceil(width * ratio), height: Math.ceil(height * ratio) };
        const external = callbacks.current.viewport;
        const scaleX = painted?.scaleX ?? (external ? width / external.source.width : fitScale() * zoomRef.current);
        const scaleY = painted?.scaleY ?? (external ? height / external.source.height : scaleX);
        const input = presented?.input;
        const basis = snapshot.baseline?.input ?? snapshot.overviewInput;
        const basisImage = snapshot.baseline?.bitmap ?? snapshot.overview;
        const level = input?.level !== undefined ? `L${input.level}` : input?.backend.toUpperCase();
        const displayWidth = frame ? frame.source.width * scaleX * ratio : 0;
        const displayHeight = frame ? frame.source.height * scaleY * ratio : 0;
        const samplingX = input ? input.width / source.nativeSize.width / (scaleX * ratio) : 0;
        const samplingY = input ? input.height / source.nativeSize.height / (scaleY * ratio) : 0;
        const roi = input && frame ? {
          width: Math.ceil((frame.source.x + frame.source.width) * input.width / source.nativeSize.width) -
            Math.floor(frame.source.x * input.width / source.nativeSize.width),
          height: Math.ceil((frame.source.y + frame.source.height) * input.height / source.nativeSize.height) -
            Math.floor(frame.source.y * input.height / source.nativeSize.height),
        } : null;
        liveResolution.current.textContent = [
          `Ansicht ${physical.width}×${physical.height} px · ${width}×${height} CSS · DPR ${ratio}`,
          image && frame ? `Canvas ${display.width}×${display.height} px → ${Number(displayWidth.toFixed(1))}×${Number(displayHeight.toFixed(1))} Display-px` : "Canvas lädt …",
          input ? `Quelle ${level ?? "?"} · ${input.width}×${input.height} px${roi ? ` · ROI ${roi.width}×${roi.height}` : ""} · ${samplingX.toFixed(2)}×${samplingY.toFixed(2)} px/px` : "Quelle noch nicht gemeldet",
          ...(basis ? [`Basis ${basis.level !== undefined ? `L${basis.level}` : basis.backend.toUpperCase()} · ${basisImage?.width}×${basisImage?.height} px${snapshot.baseline ? " · gehalten" : ""}`] : []),
        ].join("\n");
        liveResolution.current.title = [
          "Ansicht: gesamter Viewport in physischen und CSS-Pixeln.",
          "Canvas: Rasterpuffer und aktuell auf dem Display belegte Pixel.",
          "Quelle: tatsächliche Eingabestufe des zuletzt angenommenen Canvas, unabhängig vom Decoder-Cache.",
          "Quell-px/Display-px: 1,00 = direkte Pixeldichte; unter 1,00 = Hochskalierung; über 1,00 = Herunterskalierung.",
          ...(frame ? [`L0-Ausschnitt: x ${frame.source.x}, y ${frame.source.y}, ${frame.source.width}×${frame.source.height}`] : []),
          ...(input && frame ? [`Quell-Ausschnitt: ${(frame.source.width * input.width / source.nativeSize.width).toFixed(2)}×${(frame.source.height * input.height / source.nativeSize.height).toFixed(2)} px, linear skaliert.`] : []),
          "Basis ist ausschließlich die separate Übersicht, nicht die Quelle des Haupt-Canvas.",
        ].join("\n");
      }
      if (zoomStatus.current) {
        const external = callbacks.current.viewport;
        const scale = fitScale() * zoomRef.current;
        const finest = finestDensity();
        const pixelX = (external ? width / external.source.width : scale) * ratio / finest;
        const pixelY = (external ? height / external.source.height : scale) * ratio / finest;
        const fitted = !external && Math.abs(zoomRef.current - 1) < 0.0001 &&
          Math.abs(pan.x) < 0.5 && Math.abs(pan.y) < 0.5;
        const oneToOne = Math.abs(pixelX - 1) < 0.0001 && Math.abs(pixelY - 1) < 0.0001;
        const mode = external ? "Extern" : fitted ? "Einpassen" : oneToOne ? "1:1" : "Zoom";
        const percentage = Math.abs(pixelX - pixelY) < 0.0001
          ? `${(pixelX * 100).toFixed(1)}%`
          : `${(pixelX * 100).toFixed(1)}% × ${(pixelY * 100).toFixed(1)}%`;
        zoomStatus.current.textContent = `${mode} · ${percentage}`;
        zoomStatus.current.title = "Physische Displaypixel je Pixel der feinsten verfügbaren Bildstufe";
        if (fitButton.current) {
          fitButton.current.setAttribute("aria-pressed", String(fitted));
          fitButton.current.style.background = fitted ? "#335e81" : "#273343";
        }
        if (pixelButton.current) {
          pixelButton.current.setAttribute("aria-pressed", String(oneToOne));
          pixelButton.current.style.background = oneToOne ? "#335e81" : "#273343";
        }
      }
      if (diagnostic.current) {
        const state = snapshot.error ? "Fehler" : snapshot.loading ? "Lädt …" : "Bereit";
        diagnostic.current.textContent = `${state} · ${display.width}×${display.height} · ${(metrics.managedBytes / 1048576).toFixed(1)} / ${(metrics.budgetBytes / 1048576).toFixed(1)} MiB · Pool ${(pooled.managedBytes / 1048576).toFixed(1)} MiB`;
        const detail = [
          `${source.id} · Canvas ${display.width}×${display.height} · ${
            snapshot.loading ? "lädt" : "bereit"
          }`,
          `Renderfläche ${(display.width * display.height * 4 / 1048576).toFixed(2)} MiB · einheitliche Bildstufe`,
          `Bild ${(metrics.managedBytes / 1048576).toFixed(1)} / ${(
            metrics.budgetBytes / 1048576
          ).toFixed(1)} MiB · Pool ${pooled.images.length}/${
            pooled.maxImages
          }: ${(pooled.managedBytes / 1048576).toFixed(1)} MiB`,
          `AVIF-Zellen ${
            metrics.sourceMemory?.decodedTileCount ?? 0
          } · Range-Cache ${(
            (metrics.sourceMemory?.rangeBytes ?? 0) / 1048576
          ).toFixed(1)} MiB`,
          `Worker-Arbeitspuffer-Peak mindestens ${(
            metrics.peakWorkerWorkingBytes / 1048576
          ).toFixed(1)} MiB (zusätzlicher Decoder-Speicher unbekannt)`,
          `Renderlimit ${(metrics.renderBudgetBytes / 1048576).toFixed(1)} MiB · Sourcecache ${(metrics.cacheBudgetBytes / 1048576).toFixed(1)} MiB`,
          `${snapshot.preparedFrames?.length ?? 0} Zoomausschnitte vorbereitet · ${snapshot.bufferedFrames?.length ?? 0} vorherige Ausschnitte gehalten`,
          snapshot.error ??
            "RGBA-Schätzung; zusätzliche Browser-/Decoder-Allokationen unbekannt.",
        ].join("\n");
        diagnostic.current.title = detail;
        diagnostic.current.setAttribute("aria-label", detail);
      }
      scheduleOverviews();
      callbacks.current.onMetrics?.(snapshot, pooled);
    };
    const draw = () => {
      if (renderFrame !== undefined) return;
      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = undefined;
        render();
      });
    };
    const compute = () => {
      ratio = window.devicePixelRatio || 1;
      width = Math.max(1, root.clientWidth);
      height = Math.max(1, root.clientHeight);
      const scale = fitScale() * zoomRef.current;
      currentWindow =
        callbacks.current.viewport ??
        nativePreviewWindow(
          { width: width as CssPixels, height: height as CssPixels },
          {
            width: (source.nativeSize.width * scale) as CssPixels,
            height: (source.nativeSize.height * scale) as CssPixels,
          },
          source.nativeSize,
          { x: pan.x as CssPixels, y: pan.y as CssPixels },
          { xOffset: 0, yOffset: 0 },
          0 as Radians,
          ratio as Ratio
        );
      if (currentWindow) {
        handle.setViewport(
          currentWindow,
          Math.ceil(width * ratio) * Math.ceil(height * ratio)
        );
        if (!callbacks.current.viewport)
          callbacks.current.onViewportChange?.(currentWindow);
      }
      draw();
    };
    const changeZoom = (next: number, recenter = false) => {
      if (callbacks.current.viewport) return;
      const previous = zoomRef.current;
      // A physical 1:1 preset can be beyond the ordinary wheel range for gigapixel sources.
      const maximum = Math.max(64, finestDensity() / (ratio * fitScale()));
      zoomRef.current = Math.min(maximum, Math.max(0.25, next));
      pan = recenter ? { x: 0, y: 0 } : {
        x: pan.x * zoomRef.current / previous,
        y: pan.y * zoomRef.current / previous,
      };
      compute();
    };
    navigation.current = {
      fit: () => changeZoom(1, true),
      pixels: () => changeZoom(finestDensity() / (ratio * fitScale())),
      step: (factor) => changeZoom(zoomRef.current * factor),
    };
    const unsubscribe = handle.subscribe((next) => {
      snapshot = next;
      draw();
    });
    const unsubscribePool = activePool.subscribe(draw);
    const wheel = (event: WheelEvent) => {
      if (callbacks.current.viewport ||
          (event.target as Element).closest?.("[data-image-viewport-controls]")) return;
      event.preventDefault();
      const oldScale = fitScale() * zoomRef.current,
        box = root.getBoundingClientRect(),
        x = event.clientX - box.left - width / 2,
        y = event.clientY - box.top - height / 2;
      zoomRef.current = Math.min(
        Math.max(64, finestDensity() / (ratio * fitScale())),
        Math.max(0.25, zoomRef.current * 2 ** (-event.deltaY / 500))
      );
      const nextScale = fitScale() * zoomRef.current;
      pan = {
        x: x - ((x - pan.x) / oldScale) * nextScale,
        y: y - ((y - pan.y) / oldScale) * nextScale,
      };
      compute();
    };
    const down = (event: PointerEvent) => {
      if (callbacks.current.viewport ||
          (event.target as Element).closest?.("[data-image-viewport-controls]")) return;
      dragging = {
        x: event.clientX,
        y: event.clientY,
        pointer: event.pointerId,
      };
      root.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      pan.x += event.clientX - dragging.x;
      pan.y += event.clientY - dragging.y;
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      compute();
    };
    const up = () => {
      dragging = null;
    };
    root.addEventListener("wheel", wheel, { passive: false });
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    const observer = new ResizeObserver(compute);
    observer.observe(root);
    update.current = compute;
    compute();
    return () => {
      update.current = null;
      navigation.current = null;
      observer.disconnect();
      root.removeEventListener("wheel", wheel);
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", up);
      unsubscribe();
      unsubscribePool();
      clearTimeout(overviewTimer);
      if (renderFrame !== undefined) window.cancelAnimationFrame(renderFrame);
      for (const view of levelCanvases.values()) {
        view.figure.remove();
        view.canvas.width = view.canvas.height = 1;
      }
      handle.release();
      display.width = display.height = 1;
    };
  }, [
    activePool,
    source.id,
    source.url,
    source.kind,
    source.nativeSize.width,
    source.nativeSize.height,
    source.minimumQualityLevel,
    source.maxSourceDensity,
    source.avifPyramidUrl,
    source.avifOnly,
    source.sourceIdentity,
    source.flipForTexture,
  ]);
  useEffect(() => {
    zoomRef.current = zoom;
    update.current?.();
  }, [zoom, viewport]);
  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        height: fill ? "100%" : undefined,
        minHeight: fill ? 0 : undefined,
        display: fill ? "flex" : undefined,
        flexDirection: fill ? "column" : undefined,
      }}
    >
      <div
        ref={stage}
        data-test-id="image-viewport"
        style={{
          height: fill ? undefined : height,
          flex: fill ? "1 1 0" : undefined,
          minHeight: 0,
          minWidth: 0,
          position: "relative",
          overflow: "hidden",
          touchAction: "none",
          background: "#141a23",
        }}
      >
        <div
          data-image-viewport-controls
          style={{
            position: "absolute", top: 8, right: 8, zIndex: 1,
            display: "flex", alignItems: "center", gap: 4, padding: 4,
            background: "#141a23e6", borderRadius: 6, color: "white",
            font: "12px system-ui", flexWrap: "wrap", maxWidth: "calc(100% - 16px)",
          }}
        >
          {[
            { label: "Einpassen", title: "Ganzes Bild einpassen und zentrieren", action: "fit" as const, ref: fitButton },
            { label: "1:1", title: "Ein Bildpixel je physischem Displaypixel", action: "pixels" as const, ref: pixelButton },
          ].map((button) => (
            <button
              key={button.action} ref={button.ref} type="button"
              disabled={viewport !== undefined} title={button.title}
              aria-pressed={false} onClick={() => navigation.current?.[button.action]()}
              style={ZOOM_BUTTON_STYLE}
            >{button.label}</button>
          ))}
          <button type="button" disabled={viewport !== undefined} title="Verkleinern" aria-label="Verkleinern"
            onClick={() => navigation.current?.step(0.5)}
            style={ZOOM_BUTTON_STYLE}>−</button>
          <button type="button" disabled={viewport !== undefined} title="Vergrößern" aria-label="Vergrößern"
            onClick={() => navigation.current?.step(2)}
            style={ZOOM_BUTTON_STYLE}>+</button>
          <output ref={zoomStatus} data-test-id="image-viewport-zoom" aria-live="off" style={{ padding: "0 5px", minWidth: 112 }} />
        </div>
        <output
          ref={liveResolution}
          data-test-id="image-viewport-live-resolution"
          data-image-viewport-controls
          aria-live="off"
          style={{
            position: "absolute", bottom: 8, left: 8, zIndex: 1,
            background: "#141a23e6", borderRadius: 4, color: "white",
            font: "11px monospace", whiteSpace: "pre-line", padding: "5px 7px",
            maxWidth: "calc(100% - 16px)",
          }}
        />
        <canvas
          ref={canvas}
          width={1}
          height={1}
          style={{ position: "absolute", pointerEvents: "none" }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexShrink: 0,
          minWidth: 0,
          gap: 8,
          alignItems: "center",
          padding: 6,
          overflowX: "auto",
          background: "#202733",
          color: "white",
        }}
      >
        <canvas
          ref={overview}
          width={56}
          height={56}
          aria-label="Weiß: angeforderter Ausschnitt. Grün: angezeigt. Violett: vorbereiteter Ausschnitt."
          title="Bildübersicht · Weiß: angefordert · Grün: angezeigt · Violett: vorbereitet"
          style={{ flexShrink: 0 }}
        />
        <output
          ref={diagnostic}
          data-test-id="image-viewport-metrics"
          aria-live="off"
          style={{ font: "11px monospace", flex: "0 0 auto", maxWidth: 200 }}
        >
          Lädt …
        </output>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
          {[
            ["#303844", "Unbekannt"], ["#f5cd66", "Angefragt"],
            ["#6da8ff", "Komprimiert lokal verfügbar"], ["#71e390", "Decodiert"],
          ].map(([color, label]) => (
            <span key={color} title={label} aria-label={label}
              style={{ width: 8, height: 8, background: color, border: "1px solid #8190a6", borderRadius: 2 }} />
          ))}
        </div>
        <div
          ref={levelsOverview}
          data-test-id="image-viewport-pyramid-readiness"
          title="Tile-Zustand pro Stufe · Weiß: aktuelle Anfrage · Violett: vorbereitet. Historische Downloads sind keine bestätigten Cache-Treffer."
          style={{ display: "flex", alignItems: "center", gap: 5, flex: "0 0 auto" }}
        />
      </div>
    </div>
  );
};
