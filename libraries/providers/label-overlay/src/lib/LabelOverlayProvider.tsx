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

import type { LabelOverlayHostBinding } from "./host";
import { LabelOverlayContext } from "./LabelOverlayContext";
import {
  LABEL_OVERLAY_CONTAINER_ATTRIBUTE,
  LABEL_OVERLAY_CONTAINER_SELECTOR,
} from "./constants";
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

const resolveExistingLabelOverlayContainer = (container: HTMLElement) => {
  if (container.getAttribute(LABEL_OVERLAY_CONTAINER_ATTRIBUTE) === "true") {
    return container;
  }

  const explicitOverlayContainer = container.querySelector(
    LABEL_OVERLAY_CONTAINER_SELECTOR
  );
  if (explicitOverlayContainer instanceof HTMLElement) {
    return explicitOverlayContainer;
  }

  return null;
};

const createLabelOverlayContainerElement = () => {
  const overlayDiv = document.createElement("div");
  overlayDiv.setAttribute(LABEL_OVERLAY_CONTAINER_ATTRIBUTE, "true");
  overlayDiv.style.position = "absolute";
  overlayDiv.style.top = "0";
  overlayDiv.style.left = "0";
  overlayDiv.style.width = "100%";
  overlayDiv.style.height = "100%";
  overlayDiv.style.pointerEvents = "none";
  overlayDiv.style.zIndex = "auto";
  overlayDiv.style.overflow = "hidden";
  return overlayDiv;
};

export const LabelOverlayProvider: React.FC<LabelOverlayProviderProps> = ({
  children,
  host,
}) => {
  const overlayRef = useRef<HTMLElement | null>(null);
  const overlayElementNodeByIdRef = useRef<Map<string, HTMLDivElement>>(
    new Map()
  );
  const overlayElementsRef = useRef<Map<string, LabelOverlayElement>>(
    new Map()
  );
  const renderScheduledRef = useRef(false);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const positionsDirtyRef = useRef(true);
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
  const probeViewChange = host.probeViewChange;
  const forceLayoutOnPortalRender = host.forceLayoutOnPortalRender ?? true;

  const markPositionsDirty = useCallback(() => {
    positionsDirtyRef.current = true;
  }, []);

  const reattachOverlayContainerRef = useRef<(() => void) | null>(null);

  // Create overlay container
  useLayoutEffect(() => {
    let cancelled = false;
    let attachFrameId = 0;
    let mountedContainer: HTMLElement | null = null;
    let createdOverlayDiv: HTMLDivElement | null = null;

    const detachOverlayContainer = () => {
      if (createdOverlayDiv && mountedContainer?.contains(createdOverlayDiv)) {
        mountedContainer.removeChild(createdOverlayDiv);
      }
      createdOverlayDiv = null;
      mountedContainer = null;
      overlayRef.current = null;
    };

    const attachOverlayContainer = () => {
      attachFrameId = 0;
      if (cancelled) {
        return;
      }

      const hostContainer = resolvedContainerRef.current;
      // A host root that left the document (remounted by its host) is not a
      // place to attach to; wait for the host to resolve the new one.
      if (!hostContainer || !hostContainer.isConnected) {
        attachFrameId = window.requestAnimationFrame(attachOverlayContainer);
        return;
      }

      const existingOverlayContainer =
        resolveExistingLabelOverlayContainer(hostContainer);
      if (existingOverlayContainer) {
        overlayRef.current = existingOverlayContainer;
        forceRender();
        return;
      }

      mountedContainer = hostContainer;
      const overlayDiv = createLabelOverlayContainerElement();
      mountedContainer.appendChild(overlayDiv);
      createdOverlayDiv = overlayDiv;
      overlayRef.current = overlayDiv;
      // Trigger render to ensure portals can mount to the new container
      forceRender();
    };

    attachOverlayContainer();

    // The host may replace its root while this provider stays mounted; the
    // portals then sit in a detached node and nothing shows. Move over.
    reattachOverlayContainerRef.current = () => {
      if (cancelled || attachFrameId !== 0) {
        return;
      }
      detachOverlayContainer();
      attachOverlayContainer();
    };

    return () => {
      cancelled = true;
      reattachOverlayContainerRef.current = null;
      if (attachFrameId !== 0) {
        window.cancelAnimationFrame(attachFrameId);
      }
      overlayElementNodeByIdRef.current.clear();
      detachOverlayContainer();
    };
  }, [forceRender, resolvedContainerRef]);

  const setLabelOverlayElement = useCallback(
    (element: LabelOverlayElement) => {
      markPositionsDirty();
      const existing = overlayElementsRef.current.get(element.id);
      if (existing && shouldReuseOverlayPortal(existing, element)) {
        overlayElementsRef.current.set(element.id, element);
        return;
      }

      overlayElementsRef.current.set(element.id, element);
      forceRender();
    },
    [forceRender, markPositionsDirty]
  );

  const removeLabelOverlayElement = useCallback(
    (id: string) => {
      if (!overlayElementsRef.current.has(id)) return;
      overlayElementsRef.current.delete(id);
      overlayElementNodeByIdRef.current.delete(id);
      markPositionsDirty();
      forceRender();
    },
    [forceRender, markPositionsDirty]
  );

  const updatePositionsInternal = useCallback(
    (force = false) => {
      const overlayContainer = overlayRef.current;
      if (!overlayContainer) return;
      if (!overlayContainer.isConnected) {
        reattachOverlayContainerRef.current?.();
        return;
      }

      // Keep the stateful probe current even when a forced update bypasses it.
      const viewChanged = probeViewChange ? probeViewChange() : true;
      if (!force && !viewChanged && !positionsDirtyRef.current) return;
      positionsDirtyRef.current = false;

      overlayElementsRef.current.forEach((element, id) => {
        const elementDiv = overlayElementNodeByIdRef.current.get(id);
        if (!elementDiv) return;

        if (element.updatePosition) {
          const hasPosition = element.updatePosition(elementDiv);
          elementDiv.style.display =
            hasPosition && element.visible !== false ? "block" : "none";
          return;
        }

        elementDiv.style.display = "none";
      });
    },
    [probeViewChange]
  );

  const updatePositions = useCallback(() => {
    updatePositionsInternal(true);
  }, [updatePositionsInternal]);

  useEffect(() => {
    const runFrame = () => updatePositionsInternal();
    const cleanup = resolvedFrameSubscription(runFrame);
    return () => {
      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, [resolvedFrameSubscription, updatePositionsInternal]);

  useLayoutEffect(() => {
    if (!forceLayoutOnPortalRender) {
      return;
    }

    // Portals (re)mounted — newly attached nodes must be positioned now.
    updatePositionsInternal(true);
  }, [forceLayoutOnPortalRender, renderCounter, updatePositionsInternal]);

  const contextValue: LabelOverlayContextType = useMemo(
    () => ({
      setLabelOverlayElement,
      removeLabelOverlayElement,
      updatePositions,
      invalidatePositions: markPositionsDirty,
    }),
    [
      setLabelOverlayElement,
      removeLabelOverlayElement,
      updatePositions,
      markPositionsDirty,
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
