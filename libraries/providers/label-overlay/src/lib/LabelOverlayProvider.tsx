import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { LabelOverlayContext } from "./LabelOverlayContext";
import type { LabelOverlayElement, LabelOverlayContextType } from "./types";

const hasSameOverlayPortalContent = (
  left: LabelOverlayElement,
  right: LabelOverlayElement
) => {
  if (left.contentKey !== undefined || right.contentKey !== undefined) {
    return left.contentKey === right.contentKey;
  }

  return left.content === right.content;
};

const shouldReuseOverlayPortal = (
  existing: LabelOverlayElement,
  next: LabelOverlayElement
) =>
  hasSameOverlayPortalContent(existing, next) &&
  existing.zIndex === next.zIndex &&
  existing.onClick === next.onClick &&
  existing.onDoubleClick === next.onDoubleClick &&
  existing.cursor === next.cursor;

interface LabelOverlayProviderProps {
  children: ReactNode;
  containerRef?: RefObject<HTMLElement | null>;
  requestUpdateCallback?: (updateFn: () => void) => void | (() => void);
}

export const LabelOverlayProvider: React.FC<LabelOverlayProviderProps> = ({
  children,
  containerRef,
  requestUpdateCallback,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayElementsRef = useRef<Map<string, LabelOverlayElement>>(
    new Map()
  );
  const externalUpdateDriverDetectedRef = useRef(false);
  const overlayDebugSnapshotByIdRef = useRef<Map<string, string>>(new Map());
  const overlayDebugMutationCountByIdRef = useRef<Map<string, number>>(
    new Map()
  );
  const overlayDebugFrameRef = useRef(0);
  const overlayDebugLastLogFrameRef = useRef(0);
  const renderScheduledRef = useRef(false);
  const requestRenderRef = useRef<(() => void) | null>(null);
  // Force a re-render when we need to update Portals (add/remove/content change)
  const [renderCounter, setRenderCounter] = useState(0);
  const forceRender = useCallback(() => {
    if (renderScheduledRef.current) return;
    renderScheduledRef.current = true;
    if (!requestRenderRef.current) {
      requestRenderRef.current = () => {
        renderScheduledRef.current = false;
        setRenderCounter((c) => c + 1);
      };
    }
    queueMicrotask(requestRenderRef.current);
  }, []);

  // Create overlay container
  useEffect(() => {
    const container = containerRef?.current || document.body;
    if (!container) return;

    const overlayDiv = document.createElement("div");
    overlayDiv.id = "label-overlay-container";
    overlayDiv.style.position = "absolute";
    overlayDiv.style.top = "0";
    overlayDiv.style.left = "0";
    overlayDiv.style.width = "100%";
    overlayDiv.style.height = "100%";
    overlayDiv.style.pointerEvents = "none";
    overlayDiv.style.zIndex = "1000";
    overlayDiv.style.overflow = "hidden";
    overlayDiv.style.clipPath = "inset(0)";

    container.appendChild(overlayDiv);
    overlayRef.current = overlayDiv;
    // Trigger render to ensure portals can mount to the new container
    forceRender();

    return () => {
      if (overlayDiv && container.contains(overlayDiv)) {
        container.removeChild(overlayDiv);
      }
    };
  }, [containerRef, forceRender]);

  const addLabelOverlayElement = useCallback(
    (element: LabelOverlayElement) => {
      const existing = overlayElementsRef.current.get(element.id);
      if (existing && shouldReuseOverlayPortal(existing, element)) {
        overlayElementsRef.current.set(element.id, element);
        return;
      }

      overlayElementsRef.current.set(element.id, element);
      forceRender();
    },
    [forceRender]
  );

  const removeLabelOverlayElement = useCallback(
    (id: string) => {
      if (!overlayElementsRef.current.has(id)) return;
      overlayElementsRef.current.delete(id);
      forceRender();
    },
    [forceRender]
  );

  const updateLabelOverlayElement = useCallback(
    (id: string, updates: Partial<LabelOverlayElement>) => {
      const existing = overlayElementsRef.current.get(id);
      if (existing) {
        const updated = { ...existing, ...updates };
        const shouldRender = !shouldReuseOverlayPortal(existing, updated);
        overlayElementsRef.current.set(id, updated);

        if (shouldRender) {
          forceRender();
        }
      }
    },
    [forceRender]
  );

  const clearLabelOverlayElements = useCallback(() => {
    if (overlayElementsRef.current.size === 0) return;
    overlayElementsRef.current.clear();
    forceRender();
  }, [forceRender]);

  // Update overlay positions (imperative, no React render)
  const updatePositionsInternal = useCallback(() => {
    const overlayContainer = overlayRef.current;
    if (!overlayContainer) return;
    const debugEnabled =
      typeof window !== "undefined" &&
      Boolean(
        (
          window as unknown as {
            __CARMA_LABEL_OVERLAY_DEBUG__?: boolean;
          }
        ).__CARMA_LABEL_OVERLAY_DEBUG__
      );
    let debugChangedIds: string[] = [];
    const captureDebugSnapshot = (id: string, elementDiv: HTMLElement) => {
      if (!debugEnabled) return;
      const lineLabelTextEl = elementDiv.querySelector(
        '[data-line-visualizer-text="true"]'
      ) as SVGTextElement | null;
      const anchoredLabelTextEl = elementDiv.querySelector(
        '[data-anchored-label-text="true"]'
      ) as HTMLSpanElement | null;
      const anchoredLabelRootEl = elementDiv.querySelector(
        '[data-anchored-label-root="true"]'
      ) as HTMLDivElement | null;
      const snapshot = [
        elementDiv.style.display,
        elementDiv.style.left,
        elementDiv.style.top,
        elementDiv.style.transform,
        lineLabelTextEl?.getAttribute("x") ?? "",
        lineLabelTextEl?.getAttribute("y") ?? "",
        lineLabelTextEl?.getAttribute("transform") ?? "",
        lineLabelTextEl?.style.display ?? "",
        anchoredLabelRootEl?.style.transform ?? "",
        anchoredLabelTextEl?.style.visibility ?? "",
      ].join("|");

      const previousSnapshot = overlayDebugSnapshotByIdRef.current.get(id);
      if (snapshot === previousSnapshot) return;
      overlayDebugSnapshotByIdRef.current.set(id, snapshot);
      const previousMutationCount =
        overlayDebugMutationCountByIdRef.current.get(id) ?? 0;
      overlayDebugMutationCountByIdRef.current.set(
        id,
        previousMutationCount + 1
      );
      debugChangedIds.push(id);
    };

    overlayElementsRef.current.forEach((element, id) => {
      const elementDiv = overlayContainer.querySelector(
        `[data-label-overlay-id="${id}"]`
      ) as HTMLElement;
      if (!elementDiv) return;

      if (element.isHidden === true) {
        elementDiv.style.display = "none";
        captureDebugSnapshot(id, elementDiv);
        return;
      }

      if (element.updatePosition) {
        const hasPosition = element.updatePosition(elementDiv);
        elementDiv.style.display =
          hasPosition && element.visible !== false ? "block" : "none";
        captureDebugSnapshot(id, elementDiv);
        return;
      }

      const canvasPosition = element.getCanvasPosition
        ? element.getCanvasPosition()
        : null;

      if (canvasPosition && element.visible !== false) {
        elementDiv.style.position = "absolute";
        elementDiv.style.left = `${canvasPosition.x}px`;
        elementDiv.style.top = `${canvasPosition.y}px`;
        elementDiv.style.transform = "translate(-50%, -50%)";
        elementDiv.style.display = "block";
      } else {
        elementDiv.style.display = "none";
      }
      captureDebugSnapshot(id, elementDiv);
    });

    if (!debugEnabled) return;

    overlayDebugFrameRef.current += 1;
    const frame = overlayDebugFrameRef.current;
    const shouldLog =
      debugChangedIds.length > 0 &&
      frame - overlayDebugLastLogFrameRef.current >= 30;
    if (!shouldLog) return;

    overlayDebugLastLogFrameRef.current = frame;
    const sortedTopMutations = Array.from(
      overlayDebugMutationCountByIdRef.current.entries()
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => `${id}:${count}`);
    // eslint-disable-next-line no-console
    console.debug(
      `[LabelOverlayProvider] frame=${frame} changed=${
        debugChangedIds.length
      } ids=${debugChangedIds
        .slice(0, 8)
        .join(",")} topMutations=${sortedTopMutations.join(",")}`
    );
  }, []);

  const updatePositions = useCallback(() => {
    externalUpdateDriverDetectedRef.current = true;
    updatePositionsInternal();
  }, [updatePositionsInternal]);

  // Register update loop
  useEffect(() => {
    if (requestUpdateCallback) {
      const cleanup = requestUpdateCallback(updatePositionsInternal);
      externalUpdateDriverDetectedRef.current = true;
      return () => {
        if (typeof cleanup === "function") {
          cleanup();
        }
      };
    } else {
      let animationFrameId: number;
      const animationLoop = () => {
        if (externalUpdateDriverDetectedRef.current) {
          animationFrameId = 0;
          return;
        }
        updatePositionsInternal();
        animationFrameId = requestAnimationFrame(animationLoop);
      };
      animationFrameId = requestAnimationFrame(animationLoop);
      return () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };
    }
  }, [requestUpdateCallback, updatePositionsInternal]);

  // Force update positions after DOM updates (e.g. adding new label)
  useLayoutEffect(() => {
    updatePositionsInternal();
  }, [renderCounter, updatePositionsInternal]);

  const contextValue: LabelOverlayContextType = useMemo(
    () => ({
      addLabelOverlayElement,
      removeLabelOverlayElement,
      updateLabelOverlayElement,
      clearLabelOverlayElements,
      updatePositions,
    }),
    [
      addLabelOverlayElement,
      removeLabelOverlayElement,
      updateLabelOverlayElement,
      clearLabelOverlayElements,
      updatePositions,
    ]
  );

  const portals = useMemo(() => {
    if (!overlayRef.current) return null;

    return Array.from(overlayElementsRef.current.entries()).map(
      ([id, element]) =>
        createPortal(
          <div
            key={id}
            data-label-overlay-id={id}
            style={{
              position: "absolute",
              zIndex: element.zIndex ?? 0,
              pointerEvents:
                element.onClick || element.onDoubleClick ? "auto" : "none",
              cursor:
                element.cursor ??
                (element.onClick || element.onDoubleClick
                  ? "pointer"
                  : "default"),
            }}
            onClick={element.onClick}
            onDoubleClick={element.onDoubleClick}
          >
            {element.content}
          </div>,
          overlayRef.current!
        )
    );
  }, [renderCounter]);

  return (
    <LabelOverlayContext.Provider value={contextValue}>
      {children}
      {portals}
    </LabelOverlayContext.Provider>
  );
};
