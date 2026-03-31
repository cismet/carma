import { clamp } from "@carma/math";
import type { CssPixelPosition } from "@carma/units/types";
import { useCallback, useEffect, useRef } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";

type DraggableDebugAnchorProps = {
  anchorId: string;
  position: CssPixelPosition;
  color: string;
  containerRef: RefObject<HTMLElement | null>;
  onChange: (nextPosition: CssPixelPosition) => void;
  sizePx?: number;
  zIndex?: number;
  lineOpacity?: number;
  blendMode?: CSSProperties["mixBlendMode"];
};

const DEFAULT_SIZE_PX = 20;
const DEFAULT_Z_INDEX = 20;
const DEFAULT_LINE_OPACITY = 0.5;

const baseAnchorStyle: CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  border: "none",
  outline: "none",
  backgroundColor: "transparent",
  cursor: "none",
  touchAction: "none",
  padding: 0,
};

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const resolveHairlinePx = (): number =>
  typeof window !== "undefined" && window.devicePixelRatio > 0
    ? 1 / window.devicePixelRatio
    : 1;

const resolveContainerPosition = (
  event: ReactPointerEvent<HTMLButtonElement>,
  container: HTMLElement
): CssPixelPosition => {
  const bounds = container.getBoundingClientRect();
  const nextX = clamp(event.clientX - bounds.left, 0, bounds.width);
  const nextY = clamp(event.clientY - bounds.top, 0, bounds.height);
  return toCssPixelPosition(nextX, nextY);
};

const DraggableDebugAnchor = ({
  anchorId,
  position,
  color,
  containerRef,
  onChange,
  sizePx = DEFAULT_SIZE_PX,
  zIndex = DEFAULT_Z_INDEX,
  lineOpacity = DEFAULT_LINE_OPACITY,
  blendMode,
}: DraggableDebugAnchorProps) => {
  const isDraggingRef = useRef(false);
  const previousDocumentCursorRef = useRef<string | null>(null);
  const hairlinePx = resolveHairlinePx();

  const hideNativeCursor = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    if (previousDocumentCursorRef.current === null) {
      previousDocumentCursorRef.current = root.style.cursor ?? "";
    }
    root.style.cursor = "none";
  }, []);

  const restoreNativeCursor = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (previousDocumentCursorRef.current === null) {
      return;
    }
    document.documentElement.style.cursor = previousDocumentCursorRef.current;
    previousDocumentCursorRef.current = null;
  }, []);

  useEffect(
    () => () => {
      restoreNativeCursor();
    },
    [restoreNativeCursor]
  );

  const updateFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onChange(resolveContainerPosition(event, container));
    },
    [containerRef, onChange]
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      isDraggingRef.current = false;
      restoreNativeCursor();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [restoreNativeCursor]
  );

  return (
    <button
      type="button"
      aria-label={`${anchorId} anchor`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        isDraggingRef.current = true;
        hideNativeCursor();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (!isDraggingRef.current) {
          return;
        }
        updateFromPointer(event);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={() => {
        isDraggingRef.current = false;
        restoreNativeCursor();
      }}
      style={{
        ...baseAnchorStyle,
        width: sizePx,
        height: sizePx,
        zIndex,
        left: position.x,
        top: position.y,
        mixBlendMode: blendMode,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: hairlinePx,
          height: "100%",
          transform: "translateX(-50%)",
          backgroundColor: color,
          opacity: lineOpacity,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 0,
          top: "50%",
          width: "100%",
          height: hairlinePx,
          transform: "translateY(-50%)",
          backgroundColor: color,
          opacity: lineOpacity,
        }}
      />
    </button>
  );
};

export type { DraggableDebugAnchorProps };
export { DraggableDebugAnchor };
