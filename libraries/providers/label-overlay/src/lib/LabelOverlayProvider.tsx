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
  // Set whenever something the overlay loop depends on changes (element set/data
  // or an explicit invalidation). Together with the host's view-change
  // probe it lets the per-frame loop skip reprojection on otherwise-idle frames.
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
  const resolvedHasViewChanged = host.hasViewChanged;
  const forceLayoutOnPortalRender = host.forceLayoutOnPortalRender ?? true;

  const markPositionsDirty = useCallback(() => {
    positionsDirtyRef.current = true;
  }, []);

  // Create overlay container
  useLayoutEffect(() => {
    let cancelled = false;
    let attachFrameId = 0;
    let mountedContainer: HTMLElement | null = null;
    let createdOverlayDiv: HTMLDivElement | null = null;

    const attachOverlayContainer = () => {
      if (cancelled) {
        return;
      }

      const hostContainer = resolvedContainerRef.current;
      if (!hostContainer) {
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

    return () => {
      cancelled = true;
      if (attachFrameId !== 0) {
        window.cancelAnimationFrame(attachFrameId);
      }
      overlayElementNodeByIdRef.current.clear();
      if (createdOverlayDiv && mountedContainer?.contains(createdOverlayDiv)) {
        mountedContainer.removeChild(createdOverlayDiv);
      }
      overlayRef.current = null;
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

  // Update overlay positions (imperative, no React render). `force` bypasses the
  // idle gate for explicit/structural updates; the per-frame loop calls it
  // unforced so it can skip reprojection when neither the view nor any tracked
  // input changed (see positionsDirtyRef / host.hasViewChanged).
  const updatePositionsInternal = useCallback(
    (force = false) => {
      const overlayContainer = overlayRef.current;
      if (!overlayContainer) return;

      // Probe the view every frame even when forcing, so its cache stays current.
      const viewChanged = resolvedHasViewChanged
        ? resolvedHasViewChanged()
        : true;
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
    [resolvedHasViewChanged]
  );

  // Explicit, consumer-driven update — always runs (a caller asking for it has
  // changed something the loop's gate may not see this frame).
  const updatePositions = useCallback(() => {
    updatePositionsInternal(true);
  }, [updatePositionsInternal]);

  // Register update loop. The frame source passes its own args (e.g. Cesium's
  // (scene, time)); wrap so they never land in `force`.
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
