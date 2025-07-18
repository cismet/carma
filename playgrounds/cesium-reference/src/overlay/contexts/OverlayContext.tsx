import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  RefObject,
} from "react";
import { createRoot, Root } from "react-dom/client";

import type { OverlayElement, OverlayContextType } from "../types/OverlayTypes";

const OverlayContext = createContext<OverlayContextType | undefined>(undefined);

interface OverlayProviderProps {
  children: ReactNode;
  containerRef?: RefObject<HTMLElement>;
  requestUpdateCallback?: (updateFn: () => void) => void;
}

export const OverlayProvider: React.FC<OverlayProviderProps> = ({
  children,
  containerRef,
  requestUpdateCallback,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [overlayElements, setOverlayElements] = useState<
    Map<string, OverlayElement>
  >(new Map());

  // Create overlay container
  useEffect(() => {
    // If no containerRef is provided, create overlay in document body
    const container = containerRef?.current || document.body;
    if (!container) return;

    // Create overlay div
    const overlayDiv = document.createElement("div");
    overlayDiv.id = "overlay-container";
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

    return () => {
      if (overlayDiv && container.contains(overlayDiv)) {
        container.removeChild(overlayDiv);
      }
    };
  }, [containerRef]);

  // Create stable reference to overlay elements for position updates
  const overlayElementsRef =
    useRef<Map<string, OverlayElement>>(overlayElements);
  overlayElementsRef.current = overlayElements;

  // Update overlay elements positions using external update requests
  useEffect(() => {
    if (!overlayRef.current) return;

    const updatePositions = () => {
      if (!overlayRef.current) return;

      const overlayContainer = overlayRef.current;
      if (!overlayContainer) return;

      overlayElementsRef.current.forEach((element, id) => {
        const elementDiv = overlayContainer.querySelector(
          `[data-overlay-id="${id}"]`
        ) as HTMLElement;
        if (!elementDiv) return;

        // Check if element is hidden (outside viewport) - don't update position at all
        if (element.isHidden === true) {
          elementDiv.style.display = "none";
          return;
        }

        // For visible elements, get fresh screen coordinates via callback
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
    };

    // Register update function with external callback system
    if (requestUpdateCallback) {
      requestUpdateCallback(updatePositions);
    } else {
      // Fallback to requestAnimationFrame if no callback provided
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
  }, [requestUpdateCallback]);

  // Keep track of React roots for proper cleanup
  const reactRootsRef = useRef<Map<string, Root>>(new Map());

  useEffect(() => {
    if (!overlayRef.current) return;

    const overlayContainer = overlayRef.current;

    // Remove elements that no longer exist
    const existingElements =
      overlayContainer.querySelectorAll("[data-overlay-id]");
    existingElements.forEach((elementDiv) => {
      const id = elementDiv.getAttribute("data-overlay-id");
      if (id && !overlayElements.has(id)) {
        // Clean up React root if it exists
        const root = reactRootsRef.current.get(id);
        if (root) {
          root.unmount();
          reactRootsRef.current.delete(id);
        }
        elementDiv.remove();
      }
    });

    // Add or update current elements
    overlayElements.forEach((element, id) => {
      let elementDiv = overlayContainer.querySelector(
        `[data-overlay-id="${id}"]`
      ) as HTMLElement;

      // Create new element if it doesn't exist
      if (!elementDiv) {
        elementDiv = document.createElement("div");
        elementDiv.setAttribute("data-overlay-id", id);
        elementDiv.style.position = "absolute";
        elementDiv.style.pointerEvents = "none";
        overlayContainer.appendChild(elementDiv);
      }

      // Update content only if needed
      const currentContent = elementDiv.getAttribute("data-content-hash");
      const contentProps =
        typeof element.content === "string"
          ? element.content
          : React.isValidElement(element.content)
          ? element.content.props
          : {};
      const newContentHash = JSON.stringify({ content: contentProps });

      if (currentContent !== newContentHash) {
        elementDiv.setAttribute("data-content-hash", newContentHash);

        // Render React components or HTML strings
        if (typeof element.content === "string") {
          elementDiv.innerHTML = element.content;
        } else if (React.isValidElement(element.content)) {
          // Use React portal for React components
          let root = reactRootsRef.current.get(id);
          if (!root) {
            root = createRoot(elementDiv);
            reactRootsRef.current.set(id, root);
          }
          root.render(element.content);
        } else {
          elementDiv.textContent = String(element.content);
        }
      }
    });
  }, [overlayElements]);

  const addOverlayElement = useCallback((element: OverlayElement) => {
    setOverlayElements((prev) => new Map(prev.set(element.id, element)));
  }, []);

  const removeOverlayElement = useCallback((id: string) => {
    setOverlayElements((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  }, []);

  const updateOverlayElement = useCallback(
    (id: string, updates: Partial<OverlayElement>) => {
      setOverlayElements((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(id);
        if (existing) {
          newMap.set(id, { ...existing, ...updates });
        }
        return newMap;
      });
    },
    []
  );

  const clearOverlayElements = useCallback(() => {
    setOverlayElements(new Map());
  }, []);

  const contextValue: OverlayContextType = useMemo(
    () => ({
      addOverlayElement,
      removeOverlayElement,
      updateOverlayElement,
      clearOverlayElements,
    }),
    [
      addOverlayElement,
      removeOverlayElement,
      updateOverlayElement,
      clearOverlayElements,
    ]
  );

  return (
    <OverlayContext.Provider value={contextValue}>
      {children}
    </OverlayContext.Provider>
  );
};

export const useOverlay = (): OverlayContextType => {
  const context = useContext(OverlayContext);
  if (context === undefined) {
    throw new Error("useOverlay must be used within an OverlayProvider");
  }
  return context;
};
