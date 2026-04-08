import { Cartesian2, type Scene } from "@carma-cesium";

type ClientPosition = {
  x: number;
  y: number;
};

export type CesiumScenePointerClientPosition = ClientPosition;

type CanvasRectSnapshot = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type ScenePointerTracker = {
  refCount: number;
  latestClientPosition: ClientPosition | null;
  screenPosition: Cartesian2 | null;
  canvasRect: CanvasRectSnapshot | null;
  canvasRectDirty: boolean;
  pointerPositionDirty: boolean;
  listeners: Set<(clientPosition: ClientPosition | null) => void>;
  removeListeners: () => void;
};

const trackerByScene = new WeakMap<Scene, ScenePointerTracker>();

const notifyTrackerListeners = (tracker: ScenePointerTracker) => {
  tracker.listeners.forEach((listener) => {
    listener(tracker.latestClientPosition);
  });
};

const readCanvasRect = (scene: Scene): CanvasRectSnapshot => {
  const rect = scene.canvas.getBoundingClientRect();

  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
};

const isClientPositionInsideCanvas = (
  clientPosition: ClientPosition,
  canvasRect: CanvasRectSnapshot | null
) =>
  Boolean(
    canvasRect &&
      clientPosition.x >= canvasRect.left &&
      clientPosition.x <= canvasRect.right &&
      clientPosition.y >= canvasRect.top &&
      clientPosition.y <= canvasRect.bottom
  );

const clearTrackerPointerPosition = (tracker: ScenePointerTracker) => {
  tracker.latestClientPosition = null;
  tracker.pointerPositionDirty = false;
  tracker.screenPosition = null;
  notifyTrackerListeners(tracker);
};

const syncTrackerPointerPosition = (
  scene: Scene,
  tracker: ScenePointerTracker
): Cartesian2 | null => {
  if (tracker.canvasRectDirty || !tracker.canvasRect) {
    tracker.canvasRect = readCanvasRect(scene);
    tracker.canvasRectDirty = false;
  }

  if (!tracker.pointerPositionDirty) {
    return tracker.screenPosition;
  }

  tracker.pointerPositionDirty = false;
  const latestClientPosition = tracker.latestClientPosition;
  if (
    !latestClientPosition ||
    !isClientPositionInsideCanvas(latestClientPosition, tracker.canvasRect)
  ) {
    tracker.screenPosition = null;
    return null;
  }

  const nextX = latestClientPosition.x - tracker.canvasRect.left;
  const nextY = latestClientPosition.y - tracker.canvasRect.top;
  const nextScreenPosition = tracker.screenPosition ?? new Cartesian2();
  nextScreenPosition.x = nextX;
  nextScreenPosition.y = nextY;
  tracker.screenPosition = nextScreenPosition;

  return nextScreenPosition;
};

const createScenePointerTracker = (scene: Scene): ScenePointerTracker => {
  const tracker: ScenePointerTracker = {
    refCount: 0,
    latestClientPosition: null,
    screenPosition: null,
    canvasRect: readCanvasRect(scene),
    canvasRectDirty: false,
    pointerPositionDirty: false,
    listeners: new Set(),
    removeListeners: () => undefined,
  };

  const markCanvasRectDirty = () => {
    tracker.canvasRectDirty = true;
  };

  const updateLatestPointerPosition = (event: PointerEvent) => {
    tracker.latestClientPosition = {
      x: event.clientX,
      y: event.clientY,
    };
    tracker.pointerPositionDirty = true;
    notifyTrackerListeners(tracker);
  };

  const handleCanvasPointerMove = (event: PointerEvent) => {
    updateLatestPointerPosition(event);
  };

  const handleCanvasPointerRawUpdate = (event: PointerEvent) => {
    const coalescedEvents =
      "getCoalescedEvents" in event ? event.getCoalescedEvents() : [];
    const latestEvent =
      coalescedEvents.length > 0
        ? coalescedEvents[coalescedEvents.length - 1]
        : event;

    updateLatestPointerPosition(latestEvent);
  };

  const handleCanvasPointerLeave = () => {
    clearTrackerPointerPosition(tracker);
  };

  const handleCanvasBlur = () => {
    clearTrackerPointerPosition(tracker);
  };

  const handleWindowBlur = () => {
    clearTrackerPointerPosition(tracker);
  };

  const handleDocumentVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      clearTrackerPointerPosition(tracker);
    }
  };

  scene.canvas.addEventListener("mouseleave", handleCanvasPointerLeave);
  scene.canvas.addEventListener("pointermove", handleCanvasPointerMove, {
    passive: true,
  });
  scene.canvas.addEventListener(
    "pointerrawupdate",
    handleCanvasPointerRawUpdate as EventListener,
    {
      passive: true,
    }
  );
  scene.canvas.addEventListener("blur", handleCanvasBlur);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("resize", markCanvasRectDirty);
  window.addEventListener("scroll", markCanvasRectDirty, true);
  document.addEventListener("visibilitychange", handleDocumentVisibilityChange);

  tracker.removeListeners = () => {
    scene.canvas.removeEventListener("mouseleave", handleCanvasPointerLeave);
    scene.canvas.removeEventListener("pointermove", handleCanvasPointerMove);
    scene.canvas.removeEventListener(
      "pointerrawupdate",
      handleCanvasPointerRawUpdate as EventListener
    );
    scene.canvas.removeEventListener("blur", handleCanvasBlur);
    window.removeEventListener("blur", handleWindowBlur);
    window.removeEventListener("resize", markCanvasRectDirty);
    window.removeEventListener("scroll", markCanvasRectDirty, true);
    document.removeEventListener(
      "visibilitychange",
      handleDocumentVisibilityChange
    );
  };

  return tracker;
};

const getOrCreateTracker = (scene: Scene) => {
  const existingTracker = trackerByScene.get(scene);
  if (existingTracker) {
    return existingTracker;
  }

  const nextTracker = createScenePointerTracker(scene);
  trackerByScene.set(scene, nextTracker);
  return nextTracker;
};

export const registerCesiumScenePointerTracker = (scene: Scene) => {
  const tracker = getOrCreateTracker(scene);
  tracker.refCount += 1;

  return () => {
    const currentTracker = trackerByScene.get(scene);
    if (!currentTracker) {
      return;
    }

    currentTracker.refCount -= 1;
    if (currentTracker.refCount > 0) {
      return;
    }

    currentTracker.removeListeners();
    trackerByScene.delete(scene);
  };
};

export const clearCesiumScenePointerTracker = (scene: Scene) => {
  const tracker = trackerByScene.get(scene);
  if (!tracker) {
    return;
  }

  clearTrackerPointerPosition(tracker);
};

export const getCesiumScenePointerScreenPosition = (scene: Scene) => {
  const tracker = trackerByScene.get(scene);
  if (!tracker) {
    return null;
  }

  return syncTrackerPointerPosition(scene, tracker);
};

export const getCesiumScenePointerClientPosition = (scene: Scene) => {
  const tracker = trackerByScene.get(scene);
  return tracker?.latestClientPosition ?? null;
};

export const subscribeCesiumScenePointerClientPosition = (
  scene: Scene,
  listener: (clientPosition: ClientPosition | null) => void
) => {
  const tracker = getOrCreateTracker(scene);
  tracker.listeners.add(listener);

  return () => {
    tracker.listeners.delete(listener);
  };
};
