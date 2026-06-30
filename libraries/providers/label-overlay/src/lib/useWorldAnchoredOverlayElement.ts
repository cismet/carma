import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { useLabelOverlay } from "./useLabelOverlay";
import type { LabelOverlayWorldAnchor } from "./types";

export type UseWorldAnchoredOverlayElementOptions = {
  id: string;
  // Live world anchor, projected to screen by the host each frame. Read it live
  // (e.g. from `liveAnchors`) so the element tracks a drag without a re-render.
  worldAnchor: () => LabelOverlayWorldAnchor | null;
  content: ReactNode;
  contentKey?: string;
  zIndex?: number;
  visible?: boolean;
  isHidden?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  cursor?: CSSProperties["cursor"];
  // Register only while true; unregisters when false / on unmount.
  enabled?: boolean;
};

/**
 * Register a label-overlay element anchored to a live world position, without
 * hand-writing the engine projection (`worldToWindowCoordinates`) or the
 * per-frame `updatePosition` plumbing. The provider projects the `worldAnchor`
 * via the host every frame, so the element stays pinned to the world point
 * (including mid-drag) with no React re-render. (cismet/wupp#4078)
 *
 * The `worldAnchor` getter is read through a ref, so passing a fresh closure
 * each render does not re-register the element; content/style changes do.
 */
export const useWorldAnchoredOverlayElement = ({
  id,
  worldAnchor,
  content,
  contentKey,
  zIndex,
  visible,
  isHidden,
  onClick,
  onDoubleClick,
  cursor,
  enabled = true,
}: UseWorldAnchoredOverlayElementOptions): void => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const worldAnchorRef = useRef(worldAnchor);
  worldAnchorRef.current = worldAnchor;

  useEffect(() => {
    if (!enabled) {
      removeLabelOverlayElement(id);
      return;
    }

    addLabelOverlayElement({
      id,
      worldAnchor: () => worldAnchorRef.current(),
      content,
      contentKey,
      zIndex,
      visible,
      isHidden,
      onClick,
      onDoubleClick,
      cursor,
    });

    return () => {
      removeLabelOverlayElement(id);
    };
  }, [
    addLabelOverlayElement,
    removeLabelOverlayElement,
    id,
    content,
    contentKey,
    zIndex,
    visible,
    isHidden,
    onClick,
    onDoubleClick,
    cursor,
    enabled,
  ]);
};
