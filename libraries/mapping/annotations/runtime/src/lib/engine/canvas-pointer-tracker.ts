import type {
  AnnotationClientPosition,
  AnnotationEnginePointer,
  AnnotationScreenPosition,
} from "./annotation-engine.types";

/**
 * Engine-neutral port of the Cesium scene pointer tracker
 * (`scenePointerTracker.ts` in `@carma-mapping/engines/cesium/react/interactions`):
 * the latest client position over a canvas and its DOM overlays, resolved to
 * a canvas-relative screen position on demand. One tracker per canvas,
 * reference counted through `register`.
 */

const LABEL_OVERLAY_CONTAINER_ATTRIBUTE = "data-label-overlay-container";
const LABEL_OVERLAY_ROOT_ATTRIBUTE = "data-annotation-label-overlay-root";
const VISUALIZER_OVERLAY_ROOT_ATTRIBUTE =
  "data-annotation-visualizer-overlay-root";
const VISUALIZER_OVERLAY_CONTAINER_ATTRIBUTE =
  "data-annotation-visualizer-overlay-container";
export const ANNOTATION_POINTER_QUERY_PRESERVE_ATTRIBUTE =
  "data-carma-pointer-query-preserve";

const ALLOWED_POINTER_TARGET_SELECTOR = [
  `[${LABEL_OVERLAY_CONTAINER_ATTRIBUTE}="true"]`,
  `[${LABEL_OVERLAY_ROOT_ATTRIBUTE}="true"]`,
  `[${VISUALIZER_OVERLAY_ROOT_ATTRIBUTE}="true"]`,
  `[${VISUALIZER_OVERLAY_CONTAINER_ATTRIBUTE}="true"]`,
].join(", ");
const POINTER_QUERY_PRESERVE_TARGET_SELECTOR = `[${ANNOTATION_POINTER_QUERY_PRESERVE_ATTRIBUTE}="true"]`;

type CanvasRectSnapshot = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type CanvasPointerTracker = {
  refCount: number;
  latestClientPosition: AnnotationClientPosition | null;
  screenPosition: AnnotationScreenPosition | null;
  canvasRect: CanvasRectSnapshot | null;
  canvasRectDirty: boolean;
  pointerPositionDirty: boolean;
  listeners: Set<(clientPosition: AnnotationClientPosition | null) => void>;
  removeListeners: () => void;
};

const trackerByCanvas = new WeakMap<HTMLCanvasElement, CanvasPointerTracker>();

const notifyTrackerListeners = (tracker: CanvasPointerTracker) => {
  tracker.listeners.forEach((listener) => {
    listener(tracker.latestClientPosition);
  });
};

const readCanvasRect = (canvas: HTMLCanvasElement): CanvasRectSnapshot => {
  const rect = canvas.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
};

const isClientPositionInsideCanvas = (
  clientPosition: AnnotationClientPosition | null,
  canvasRect: CanvasRectSnapshot | null
) =>
  Boolean(
    clientPosition &&
      canvasRect &&
      clientPosition.x >= canvasRect.left &&
      clientPosition.x <= canvasRect.right &&
      clientPosition.y >= canvasRect.top &&
      clientPosition.y <= canvasRect.bottom
  );

const clearTrackerPointerPosition = (tracker: CanvasPointerTracker) => {
  tracker.latestClientPosition = null;
  tracker.pointerPositionDirty = false;
  tracker.screenPosition = null;
  notifyTrackerListeners(tracker);
};

const resolveEventTargetElement = (event: PointerEvent): Element | null => {
  const eventTarget = event.target;
  if (eventTarget instanceof Element) {
    return eventTarget;
  }
  if (eventTarget instanceof Node) {
    return eventTarget.parentElement;
  }
  return null;
};

const isAllowedPointerEventTarget = (
  canvas: HTMLCanvasElement,
  event: PointerEvent
) => {
  const eventTargetElement = resolveEventTargetElement(event);
  if (!eventTargetElement) {
    return false;
  }
  return (
    eventTargetElement === canvas ||
    canvas.contains(eventTargetElement) ||
    eventTargetElement.closest(ALLOWED_POINTER_TARGET_SELECTOR) !== null
  );
};

const isPointerQueryPreservedEventTarget = (event: PointerEvent) =>
  Boolean(
    resolveEventTargetElement(event)?.closest(
      POINTER_QUERY_PRESERVE_TARGET_SELECTOR
    )
  );

const ensureCanvasRect = (
  canvas: HTMLCanvasElement,
  tracker: CanvasPointerTracker
) => {
  if (tracker.canvasRectDirty || !tracker.canvasRect) {
    tracker.canvasRect = readCanvasRect(canvas);
    tracker.canvasRectDirty = false;
  }
  return tracker.canvasRect;
};

const syncTrackerPointerPosition = (
  canvas: HTMLCanvasElement,
  tracker: CanvasPointerTracker
): AnnotationScreenPosition | null => {
  const canvasRect = ensureCanvasRect(canvas, tracker);
  if (!tracker.pointerPositionDirty) {
    return tracker.screenPosition;
  }
  tracker.pointerPositionDirty = false;
  const latestClientPosition = tracker.latestClientPosition;
  if (
    !latestClientPosition ||
    !isClientPositionInsideCanvas(latestClientPosition, canvasRect)
  ) {
    tracker.screenPosition = null;
    return null;
  }
  const nextScreenPosition = tracker.screenPosition ?? { x: 0, y: 0 };
  nextScreenPosition.x = latestClientPosition.x - canvasRect.left;
  nextScreenPosition.y = latestClientPosition.y - canvasRect.top;
  tracker.screenPosition = nextScreenPosition;
  return nextScreenPosition;
};

const createTracker = (canvas: HTMLCanvasElement): CanvasPointerTracker => {
  const tracker: CanvasPointerTracker = {
    refCount: 0,
    latestClientPosition: null,
    screenPosition: null,
    canvasRect: readCanvasRect(canvas),
    canvasRectDirty: false,
    pointerPositionDirty: false,
    listeners: new Set(),
    removeListeners: () => undefined,
  };
  const markCanvasRectDirty = () => {
    tracker.canvasRectDirty = true;
  };
  const updateLatestPointerPosition = (event: PointerEvent) => {
    tracker.latestClientPosition = { x: event.clientX, y: event.clientY };
    tracker.pointerPositionDirty = true;
    notifyTrackerListeners(tracker);
  };
  const handleCanvasPointerMove = (event: PointerEvent) => {
    updateLatestPointerPosition(event);
  };
  const handleWindowPointerMove = (event: PointerEvent) => {
    const canvasRect = ensureCanvasRect(canvas, tracker);
    const nextClientPosition = { x: event.clientX, y: event.clientY };
    const wasInsideCanvas = Boolean(
      tracker.latestClientPosition &&
        isClientPositionInsideCanvas(tracker.latestClientPosition, canvasRect)
    );
    const isInsideCanvas = isClientPositionInsideCanvas(
      nextClientPosition,
      canvasRect
    );
    if (!wasInsideCanvas && !isInsideCanvas) {
      return;
    }
    if (isPointerQueryPreservedEventTarget(event)) {
      return;
    }
    if (!isAllowedPointerEventTarget(canvas, event)) {
      clearTrackerPointerPosition(tracker);
      return;
    }
    updateLatestPointerPosition(event);
  };
  const handleCanvasPointerRawUpdate = (event: PointerEvent) => {
    const coalescedEvents =
      "getCoalescedEvents" in event ? event.getCoalescedEvents() : [];
    const latestEvent =
      coalescedEvents.length > 0
        ? coalescedEvents[coalescedEvents.length - 1]!
        : event;
    updateLatestPointerPosition(latestEvent);
  };
  const handleCanvasPointerLeave = () => {
    if (
      isClientPositionInsideCanvas(
        tracker.latestClientPosition,
        ensureCanvasRect(canvas, tracker)
      )
    ) {
      return;
    }
    clearTrackerPointerPosition(tracker);
  };
  const handleBlur = () => {
    clearTrackerPointerPosition(tracker);
  };
  const handleDocumentVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      clearTrackerPointerPosition(tracker);
    }
  };
  canvas.addEventListener("mouseleave", handleCanvasPointerLeave);
  canvas.addEventListener("pointermove", handleCanvasPointerMove, {
    passive: true,
  });
  window.addEventListener("pointermove", handleWindowPointerMove, {
    capture: true,
    passive: true,
  });
  canvas.addEventListener(
    "pointerrawupdate",
    handleCanvasPointerRawUpdate as EventListener,
    { passive: true }
  );
  canvas.addEventListener("blur", handleBlur);
  window.addEventListener("blur", handleBlur);
  window.addEventListener("resize", markCanvasRectDirty);
  window.addEventListener("scroll", markCanvasRectDirty, true);
  document.addEventListener("visibilitychange", handleDocumentVisibilityChange);
  tracker.removeListeners = () => {
    canvas.removeEventListener("mouseleave", handleCanvasPointerLeave);
    canvas.removeEventListener("pointermove", handleCanvasPointerMove);
    window.removeEventListener("pointermove", handleWindowPointerMove, true);
    canvas.removeEventListener(
      "pointerrawupdate",
      handleCanvasPointerRawUpdate as EventListener
    );
    canvas.removeEventListener("blur", handleBlur);
    window.removeEventListener("blur", handleBlur);
    window.removeEventListener("resize", markCanvasRectDirty);
    window.removeEventListener("scroll", markCanvasRectDirty, true);
    document.removeEventListener(
      "visibilitychange",
      handleDocumentVisibilityChange
    );
  };
  return tracker;
};

const getOrCreateTracker = (canvas: HTMLCanvasElement) => {
  const existing = trackerByCanvas.get(canvas);
  if (existing) {
    return existing;
  }
  const next = createTracker(canvas);
  trackerByCanvas.set(canvas, next);
  return next;
};

/** The `AnnotationEnginePointer` of one canvas, shared by every engine on it. */
export const createCanvasPointerTracker = (
  canvas: HTMLCanvasElement
): AnnotationEnginePointer => ({
  register: () => {
    const tracker = getOrCreateTracker(canvas);
    tracker.refCount += 1;
    return () => {
      const current = trackerByCanvas.get(canvas);
      if (!current) {
        return;
      }
      current.refCount -= 1;
      if (current.refCount > 0) {
        return;
      }
      current.removeListeners();
      trackerByCanvas.delete(canvas);
    };
  },
  getScreenPosition: () => {
    const tracker = trackerByCanvas.get(canvas);
    return tracker ? syncTrackerPointerPosition(canvas, tracker) : null;
  },
  getClientPosition: () =>
    trackerByCanvas.get(canvas)?.latestClientPosition ?? null,
  subscribeClientPosition: (listener) => {
    const tracker = getOrCreateTracker(canvas);
    tracker.listeners.add(listener);
    return () => {
      tracker.listeners.delete(listener);
    };
  },
  clear: () => {
    const tracker = trackerByCanvas.get(canvas);
    if (tracker) {
      clearTrackerPointerPosition(tracker);
    }
  },
});
