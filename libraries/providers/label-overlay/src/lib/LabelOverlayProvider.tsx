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

interface LabelOverlayProviderProps {
  children: ReactNode;
  containerRef?: RefObject<HTMLElement | null>;
  requestUpdateCallback?: (updateFn: () => void) => void;
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
  // Force a re-render when we need to update Portals (add/remove/content change)
  const [renderCounter, setRenderCounter] = useState(0);
  const forceRender = useCallback(() => setRenderCounter((c) => c + 1), []);

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
      // Check if element really needs an update
      const existing = overlayElementsRef.current.get(element.id);
      if (existing) {
        // Compare content to avoid unnecessary re-renders
        if (
          existing.content === element.content &&
          existing.zIndex === element.zIndex &&
          existing.visible === element.visible &&
          existing.isHidden === element.isHidden
        ) {
          // Just update the entry but don't force render
          overlayElementsRef.current.set(element.id, element);
          return;
        }
      }

      overlayElementsRef.current.set(element.id, element);
      forceRender();
    },
    [forceRender]
  );

  const removeLabelOverlayElement = useCallback(
    (id: string) => {
      overlayElementsRef.current.delete(id);
      forceRender();
    },
    [forceRender]
  );

  const updateLabelOverlayElement = useCallback(
    (id: string, updates: Partial<LabelOverlayElement>) => {
      const existing = overlayElementsRef.current.get(id);
      if (existing) {
        // Only trigger re-render if content property changes
        const shouldRender =
          updates.content !== undefined && updates.content !== existing.content;

        const updated = { ...existing, ...updates };
        overlayElementsRef.current.set(id, updated);

        if (shouldRender) {
          forceRender();
        }
      }
    },
    [forceRender]
  );

  const clearLabelOverlayElements = useCallback(() => {
    overlayElementsRef.current.clear();
    forceRender();
  }, [forceRender]);

  // Update overlay positions (imperative, no React render)
  const updatePositions = useCallback(() => {
    const overlayContainer = overlayRef.current;
    if (!overlayContainer) return;

    overlayElementsRef.current.forEach((element, id) => {
      const elementDiv = overlayContainer.querySelector(
        `[data-label-overlay-id="${id}"]`
      ) as HTMLElement;
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

  // Register update loop
  useEffect(() => {
    if (requestUpdateCallback) {
      requestUpdateCallback(updatePositions);
    } else {
      let animationFrameId: number;
      const animationLoop = () => {
        updatePositions();
        animationFrameId = requestAnimationFrame(animationLoop);
      };
      animationFrameId = requestAnimationFrame(animationLoop);
      return () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };
    }
  }, [requestUpdateCallback, updatePositions]);

  // Force update positions after DOM updates (e.g. adding new label)
  useLayoutEffect(() => {
    updatePositions();
  }, [renderCounter, updatePositions]);

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
                element.onClick || element.onDoubleClick
                  ? "pointer"
                  : "default",
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
