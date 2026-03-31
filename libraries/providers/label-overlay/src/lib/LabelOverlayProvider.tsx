import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { LabelOverlayContext } from "./LabelOverlayContext";
import type { LabelOverlayHostBinding } from "./host";
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
  host: LabelOverlayHostBinding;
}

export const LabelOverlayProvider: React.FC<LabelOverlayProviderProps> = ({
  children,
  host,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayElementNodeByIdRef = useRef<Map<string, HTMLDivElement>>(
    new Map()
  );
  const overlayElementsRef = useRef<Map<string, LabelOverlayElement>>(
    new Map()
  );
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
  const resolvedContainerRef = host.containerRef;
  const resolvedFrameSubscription = host.subscribeFrame;
  const forceLayoutOnPortalRender = host.forceLayoutOnPortalRender ?? true;

  // Create overlay container
  useEffect(() => {
    const container = resolvedContainerRef.current;
    if (!container) return;

    const overlayDiv = document.createElement("div");
    overlayDiv.dataset.labelOverlayContainer = "true";
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
      overlayElementNodeByIdRef.current.clear();
      if (overlayDiv && container.contains(overlayDiv)) {
        container.removeChild(overlayDiv);
      }
    };
  }, [forceRender, resolvedContainerRef]);

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
      overlayElementNodeByIdRef.current.delete(id);
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
    overlayElementNodeByIdRef.current.clear();
    forceRender();
  }, [forceRender]);

  // Update overlay positions (imperative, no React render)
  const updatePositionsInternal = useCallback(() => {
    const overlayContainer = overlayRef.current;
    if (!overlayContainer) return;

    overlayElementsRef.current.forEach((element, id) => {
      const elementDiv = overlayElementNodeByIdRef.current.get(id);
      if (!elementDiv) return;

      if (element.isHidden === true) {
        elementDiv.style.display = "none";
        return;
      }

      if (element.updatePosition) {
        const hasPosition = element.updatePosition(elementDiv);
        elementDiv.style.display =
          hasPosition && element.visible !== false ? "block" : "none";
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
    });
  }, []);

  const updatePositions = useCallback(() => {
    updatePositionsInternal();
  }, [updatePositionsInternal]);

  // Register update loop
  useEffect(() => {
    if (resolvedFrameSubscription) {
      const cleanup = resolvedFrameSubscription(updatePositionsInternal);
      return () => {
        if (typeof cleanup === "function") {
          cleanup();
        }
      };
    } else {
      let animationFrameId: number;
      const animationLoop = () => {
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
  }, [resolvedFrameSubscription, updatePositionsInternal]);

  useLayoutEffect(() => {
    if (!forceLayoutOnPortalRender) {
      return;
    }

    updatePositionsInternal();
  }, [forceLayoutOnPortalRender, renderCounter, updatePositionsInternal]);

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
            ref={(node) => {
              if (node) {
                overlayElementNodeByIdRef.current.set(id, node);
                return;
              }

              overlayElementNodeByIdRef.current.delete(id);
            }}
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
