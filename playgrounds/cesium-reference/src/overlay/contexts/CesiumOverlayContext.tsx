import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import { createRoot, Root } from "react-dom/client";
import { defined } from "cesium";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import type {
  OverlayElement,
  CesiumOverlayContextType,
} from "../types/OverlayTypes";

const CesiumOverlayContext = createContext<
  CesiumOverlayContextType | undefined
>(undefined);

interface CesiumOverlayProviderProps {
  children: ReactNode;
}

export const CesiumOverlayProvider: React.FC<CesiumOverlayProviderProps> = ({
  children,
}) => {
  const { viewer } = useCesiumViewer();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [overlayElements, setOverlayElements] = useState<
    Map<string, OverlayElement>
  >(new Map());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Create overlay container with canvas layer
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const cesiumContainer = viewer.container;
    
    // Create overlay div
    const overlayDiv = document.createElement("div");
    overlayDiv.id = "cesium-overlay";
    overlayDiv.style.position = "absolute";
    overlayDiv.style.top = "0";
    overlayDiv.style.left = "0";
    overlayDiv.style.width = "100%";
    overlayDiv.style.height = "100%";
    overlayDiv.style.pointerEvents = "none";
    overlayDiv.style.zIndex = "1000";
    overlayDiv.style.overflow = "hidden"; // Prevent page resize from labels extending outside
    overlayDiv.style.clipPath = "inset(0)"; // Additional clipping for better performance

    // Create canvas for custom rendering (dots, lines, etc.)
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "1";
    
    // Set canvas size to match container
    canvas.width = viewer.canvas.clientWidth;
    canvas.height = viewer.canvas.clientHeight;
    
    overlayDiv.appendChild(canvas);
    cesiumContainer.appendChild(overlayDiv);
    
    overlayRef.current = overlayDiv;
    canvasRef.current = canvas;

    return () => {
      if (overlayDiv && cesiumContainer.contains(overlayDiv)) {
        cesiumContainer.removeChild(overlayDiv);
      }
    };
  }, [viewer]);

  // Create stable reference to overlay elements for position updates
  const overlayElementsRef =
    useRef<Map<string, OverlayElement>>(overlayElements);
  overlayElementsRef.current = overlayElements;

  // Update overlay elements positions
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !overlayRef.current) return;

    const updatePositions = () => {
      const overlayContainer = overlayRef.current;
      const canvas = canvasRef.current;
      if (!overlayContainer || !canvas) return;

      // Clear canvas for fresh rendering
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      overlayElementsRef.current.forEach((element, id) => {
        const elementDiv = overlayContainer.querySelector(
          `[data-overlay-id="${id}"]`
        ) as HTMLElement;
        if (!elementDiv) return;

        // Check if element is hidden (outside viewport) - don't update position at all
        if (element.isHidden === true) {
          // Hidden elements: keep DOM element but don't update position, just hide
          elementDiv.style.display = "none";
          return; // Skip position updates for hidden elements
        }

        // For visible elements, get fresh screen coordinates via callback
        const canvasPosition = element.getCanvasPosition
          ? element.getCanvasPosition()
          : null;

        if (canvasPosition && element.visible !== false) {
          // Get local up vector if available
          const upVector = element.getLocalUpVector ? element.getLocalUpVector() : null;
          
          // Call custom rendering function if provided
          if (element.renderCustom && ctx) {
            element.renderCustom(ctx, canvasPosition, upVector || undefined);
          }
          
          // Calculate label position (default or from custom rendering)
          let labelPosition = canvasPosition;
          if (upVector && element.renderCustom) {
            // Position label using up vector + offset (matching the custom rendering logic)
            const labelOffset = {
              x: upVector.x * 30 + 20,
              y: upVector.y * 30 - 20
            };
            labelPosition = {
              x: canvasPosition.x + labelOffset.x,
              y: canvasPosition.y + labelOffset.y
            };
          }

          elementDiv.style.position = "absolute";
          elementDiv.style.left = `${labelPosition.x}px`;
          elementDiv.style.top = `${labelPosition.y}px`;
          elementDiv.style.transform = "translate(0%, -100%)";
          elementDiv.style.display = "block";
        } else {
          elementDiv.style.display = "none";
        }
      });
    };

    const removeListener =
      viewer.scene.preRender.addEventListener(updatePositions);

    return () => {
      if (removeListener) {
        removeListener();
      }
    };
  }, [viewer]); // Removed overlayElements dependency to prevent rerender loop

  // Keep track of React roots for proper cleanup
  const reactRootsRef = useRef<Map<string, Root>>(new Map());

  // Render overlay elements - only update what changed, don't recreate everything
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

      // Update content only if needed (check if content changed)
      const currentContent = elementDiv.getAttribute("data-content-hash");
      const newContentHash =
        typeof element.content === "string"
          ? element.content
          : JSON.stringify(element.content?.props || {});

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

  const contextValue: CesiumOverlayContextType = useMemo(
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
    <CesiumOverlayContext.Provider value={contextValue}>
      {children}
    </CesiumOverlayContext.Provider>
  );
};

export const useCesiumOverlay = (): CesiumOverlayContextType => {
  const context = useContext(CesiumOverlayContext);
  if (context === undefined) {
    throw new Error(
      "useCesiumOverlay must be used within a CesiumOverlayProvider"
    );
  }
  return context;
};
