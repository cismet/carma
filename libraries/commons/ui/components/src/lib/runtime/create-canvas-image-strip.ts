import {
  CANVAS_IMAGE_STRIP_INITIAL_VIEW,
  constrainCanvasImageStripView,
  getCanvasImageStripFitScale,
  getCanvasImageStripSlices,
  getCanvasImageStripView,
  setCanvasImageStripPosition,
  zoomCanvasImageStripAt,
  type CanvasImageStripDimensions,
  type CanvasImageStripInitialView,
  type CanvasImageStripTransform,
  type CanvasImageStripView,
} from "../core/canvas-image-strip-view";

export type CanvasImageStripOptions = {
  closedLoop?: boolean;
  initialView?: CanvasImageStripInitialView;
  /** Source-space interval to show initially (and on reset), e.g. ten segments
   * of a long virtual strip. Re-read when source dimensions change. */
  initialRange?: () => readonly [start: number, end: number] | null;
  ariaLabel?: string;
  /** Coalesced to a presentation frame; source-only repaints do not notify. */
  onViewChange?: (view: CanvasImageStripView) => void;
  /** Alt + vertical drag, frame-coalesced CSS pixels; upward is positive. */
  onElevationDelta?: (deltaCssPixels: number) => void;
  /** Alternate presenter (e.g. shared WebGL viewport); keeps native navigation. */
  onDraw?: (frame: {
    y: number;
    scale: number;
    slices: ReturnType<typeof getCanvasImageStripSlices>;
  }) => void;
};

export type CanvasImageStrip = {
  canvas: HTMLCanvasElement;
  refresh: () => void;
  resetView: (mode?: CanvasImageStripInitialView) => void;
  setPosition: (position: number) => void;
  /** Shared source-space navigation for synchronized arrays. */
  setView: (view: CanvasImageStripTransform) => void;
  setClosedLoop: (closedLoop: boolean) => void;
  getView: () => CanvasImageStripView;
  dispose: () => void;
};

/** React-free image navigation. Story: Tile Camera Stress / camera image strip. */
export const createCanvasImageStrip = (
  viewport: HTMLElement,
  source: HTMLCanvasElement,
  options: CanvasImageStripOptions = {}
): CanvasImageStrip => {
  const ownerWindow = viewport.ownerDocument.defaultView;
  if (!ownerWindow) throw new Error("Image strip requires a document window");
  const canvas = viewport.ownerDocument.createElement("canvas");
  const context = options.onDraw ? null : canvas.getContext("2d");
  if (!context && !options.onDraw)
    throw new Error("Image strip requires a 2D canvas context");
  canvas.className = "carma-canvas-image-strip";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    options.ariaLabel ?? "Interactive image strip"
  );
  canvas.title = `Drag to pan · Wheel to zoom · Arrow keys to pan · + / − to zoom · 0 to fit${
    options.onElevationDelta ? " · Alt + vertical drag to change elevation" : ""
  }`;
  Object.assign(canvas.style, {
    display: "block",
    width: "100%",
    height: "100%",
    touchAction: "none",
    userSelect: "none",
    cursor: "grab",
  });
  viewport.append(canvas);

  const initialView =
    options.initialView ?? CANVAS_IMAGE_STRIP_INITIAL_VIEW.FIT;
  let closedLoop = options.closedLoop ?? false;
  let disposed = false;
  let animationFrame: number | null = null;
  let viewChanged = true;
  let pendingElevationDelta = 0;
  let pixelRatio = 1;
  let drag: { pointerId: number; x: number; y: number } | null = null;
  const readDimensions = (): CanvasImageStripDimensions => ({
    sourceWidth: Math.max(1, source.width),
    sourceHeight: Math.max(1, source.height),
    viewportWidth: Math.max(1, viewport.clientWidth),
    viewportHeight: Math.max(1, viewport.clientHeight),
  });
  let dimensions = readDimensions();
  const initialTransform = (
    mode: CanvasImageStripInitialView
  ): CanvasImageStripTransform => {
    const range = options.initialRange?.();
    return constrainCanvasImageStripView(
      {
        scale:
          range && range[1] > range[0]
            ? dimensions.viewportWidth / (range[1] - range[0])
            : mode === CANVAS_IMAGE_STRIP_INITIAL_VIEW.NATIVE
            ? 1
            : getCanvasImageStripFitScale(dimensions),
        centerX: range ? (range[0] + range[1]) / 2 : dimensions.sourceWidth / 2,
        centerY: dimensions.sourceHeight / 2,
      },
      dimensions,
      closedLoop
    );
  };
  let transform = initialTransform(initialView);
  const getView = () =>
    getCanvasImageStripView(transform, dimensions, closedLoop);

  const draw = () => {
    animationFrame = null;
    if (disposed) return;
    if (pendingElevationDelta) {
      const delta = pendingElevationDelta;
      pendingElevationDelta = 0;
      options.onElevationDelta?.(delta);
    }
    context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context?.clearRect(
      0,
      0,
      dimensions.viewportWidth,
      dimensions.viewportHeight
    );
    if (source.width > 0 && source.height > 0) {
      const y =
        dimensions.viewportHeight / 2 - transform.centerY * transform.scale;
      const slices = getCanvasImageStripSlices(
        transform,
        dimensions,
        closedLoop
      );
      options.onDraw?.({ y, scale: transform.scale, slices });
      for (const slice of context ? slices : []) {
        context?.drawImage(
          source,
          slice.sourceX,
          0,
          slice.sourceWidth,
          dimensions.sourceHeight,
          slice.x,
          y,
          slice.width,
          dimensions.sourceHeight * transform.scale
        );
      }
    }
    if (viewChanged) {
      viewChanged = false;
      options.onViewChange?.(getView());
    }
  };
  const invalidate = (changed = true) => {
    if (disposed) return;
    viewChanged ||= changed;
    if (animationFrame === null)
      animationFrame = ownerWindow.requestAnimationFrame(draw);
  };
  const applyTransform = (next: CanvasImageStripTransform) => {
    if (disposed) return;
    const constrained = constrainCanvasImageStripView(
      next,
      dimensions,
      closedLoop
    );
    if (
      constrained.scale === transform.scale &&
      constrained.centerX === transform.centerX &&
      constrained.centerY === transform.centerY
    )
      return;
    transform = constrained;
    invalidate();
  };
  const syncDimensions = () => {
    const next = readDimensions();
    const sourceChanged =
      next.sourceWidth !== dimensions.sourceWidth ||
      next.sourceHeight !== dimensions.sourceHeight;
    const viewportChanged =
      next.viewportWidth !== dimensions.viewportWidth ||
      next.viewportHeight !== dimensions.viewportHeight;
    const nextRatio = ownerWindow.devicePixelRatio || 1;
    const ratioChanged = nextRatio !== pixelRatio;
    const oldFitScale = getCanvasImageStripFitScale(dimensions);
    dimensions = next;
    if (sourceChanged) transform = initialTransform(initialView);
    else if (viewportChanged)
      transform = constrainCanvasImageStripView(
        {
          ...transform,
          scale:
            (transform.scale / oldFitScale) *
            getCanvasImageStripFitScale(dimensions),
        },
        dimensions,
        closedLoop
      );
    const width = Math.round(next.viewportWidth * nextRatio);
    const height = Math.round(next.viewportHeight * nextRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    pixelRatio = nextRatio;
    invalidate(sourceChanged || viewportChanged || ratioChanged);
  };
  const refresh = () => {
    if (!disposed) syncDimensions();
  };
  const resetView = (mode = initialView) =>
    applyTransform(initialTransform(mode));
  const pan = (deltaX: number, deltaY: number) =>
    applyTransform({
      ...transform,
      centerX: transform.centerX - deltaX / transform.scale,
      centerY: transform.centerY - deltaY / transform.scale,
    });
  const zoom = (factor: number, x: number, y: number) =>
    applyTransform(
      zoomCanvasImageStripAt(
        transform,
        dimensions,
        factor,
        { x, y },
        closedLoop
      )
    );
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || drag) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.style.cursor = "grabbing";
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (event.altKey && options.onElevationDelta) {
      if (deltaY) {
        pendingElevationDelta -= deltaY;
        invalidate(false);
      }
    } else pan(deltaX, deltaY);
    event.preventDefault();
  };
  const endDrag = () => {
    const pointerId = drag?.pointerId;
    drag = null;
    if (pointerId !== undefined && canvas.hasPointerCapture(pointerId))
      canvas.releasePointerCapture(pointerId);
    canvas.style.cursor = "grab";
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (event.pointerId === drag?.pointerId) endDrag();
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
        ? dimensions.viewportHeight
        : 1;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey) {
      pan(-event.deltaX * unit, 0);
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    zoom(
      Math.exp(-Math.max(-500, Math.min(500, event.deltaY * unit)) * 0.002),
      ((event.clientX - bounds.left) * dimensions.viewportWidth) /
        (bounds.width || dimensions.viewportWidth),
      ((event.clientY - bounds.top) * dimensions.viewportHeight) /
        (bounds.height || dimensions.viewportHeight)
    );
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? 120 : 40;
    switch (event.key) {
      case "ArrowLeft":
        pan(step, 0);
        break;
      case "ArrowRight":
        pan(-step, 0);
        break;
      case "ArrowUp":
        pan(0, step);
        break;
      case "ArrowDown":
        pan(0, -step);
        break;
      case "+":
      case "=":
        zoom(1.25, dimensions.viewportWidth / 2, dimensions.viewportHeight / 2);
        break;
      case "-":
      case "_":
        zoom(0.8, dimensions.viewportWidth / 2, dimensions.viewportHeight / 2);
        break;
      case "0":
        resetView(CANVAS_IMAGE_STRIP_INITIAL_VIEW.FIT);
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("lostpointercapture", onPointerEnd);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKeyDown);
  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh);
  resizeObserver?.observe(viewport);
  ownerWindow.addEventListener("resize", refresh);
  refresh();

  return {
    canvas,
    refresh,
    resetView,
    getView,
    setView: (view) => {
      if ([view.scale, view.centerX, view.centerY].every(Number.isFinite))
        applyTransform(view);
    },
    setPosition: (position) => {
      if (Number.isFinite(position))
        applyTransform(
          setCanvasImageStripPosition(
            transform,
            dimensions,
            position,
            closedLoop
          )
        );
    },
    setClosedLoop: (nextClosedLoop) => {
      if (disposed || nextClosedLoop === closedLoop) return;
      closedLoop = nextClosedLoop;
      applyTransform(transform);
      invalidate();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      endDrag();
      if (animationFrame !== null)
        ownerWindow.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      ownerWindow.removeEventListener("resize", refresh);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("lostpointercapture", onPointerEnd);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.remove();
    },
  };
};
