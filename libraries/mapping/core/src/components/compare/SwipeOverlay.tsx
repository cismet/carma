import { useRef, useCallback } from "react";

/**
 * Controlled splitter overlay. Renders one draggable circular grabber
 * per split line between adjacent panels. The parent owns the
 * `positions` state (so it can also apply them to the grid template).
 *
 * `orientation` here refers to the LAYOUT of the panels, matching
 * `side-by-side.orientation`:
 *   - "horizontal": panels are in a row, the grabber slides left/right
 *   - "vertical":   panels are stacked, the grabber slides up/down
 */
interface SwipeOverlayProps {
  orientation?: "horizontal" | "vertical";
  positions: number[];
  onPositionsChange: (positions: number[]) => void;
}

const GRABBER_SIZE = 40;
const LINE_THICKNESS = 2;
const LINE_COLOR = "rgba(255, 255, 255, 0.9)";
const LINE_SHADOW = "0 0 0 1px rgba(0,0,0,0.25)";
const GRABBER_SHADOW =
  "0 1px 2px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.25)";
const ARROW_COLOR = "#3a3a3a";

export function SwipeOverlay({
  orientation = "horizontal",
  positions,
  onPositionsChange,
}: SwipeOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);

  // "horizontal" layout = grabber moves along X (the split is a vertical line).
  const isRowLayout = orientation === "horizontal";

  const handlePointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      draggingIndex.current = index;
      const handle = e.currentTarget as HTMLElement;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingIndex.current === null || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const pos = isRowLayout
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height;

      const clampedPos = Math.max(0.05, Math.min(0.95, pos));

      const next = [...positions];
      next[draggingIndex.current] = clampedPos;

      // Keep positions monotonically increasing so splits never cross.
      for (let i = 1; i < next.length; i++) {
        next[i] = Math.max(next[i], next[i - 1] + 0.02);
      }
      for (let i = next.length - 2; i >= 0; i--) {
        next[i] = Math.min(next[i], next[i + 1] - 0.02);
      }

      onPositionsChange(next);
    },
    [isRowLayout, positions, onPositionsChange]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    draggingIndex.current = null;
    const handle = e.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(e.pointerId)) {
      handle.releasePointerCapture(e.pointerId);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {positions.map((pos, index) => (
        <div key={index}>
          {/* Thin white divider line so the split is visible everywhere,
           *  not just where the grabber sits. */}
          <div
            style={{
              position: "absolute",
              pointerEvents: "none",
              backgroundColor: LINE_COLOR,
              boxShadow: LINE_SHADOW,
              ...(isRowLayout
                ? {
                    left: `${pos * 100}%`,
                    top: 0,
                    width: LINE_THICKNESS,
                    height: "100%",
                    transform: `translateX(-${LINE_THICKNESS / 2}px)`,
                  }
                : {
                    left: 0,
                    top: `${pos * 100}%`,
                    width: "100%",
                    height: LINE_THICKNESS,
                    transform: `translateY(-${LINE_THICKNESS / 2}px)`,
                  }),
            }}
          />
          {/* White circular grabber with neutral arrow glyphs. */}
          <div
            onPointerDown={handlePointerDown(index)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            role="slider"
            aria-orientation={isRowLayout ? "horizontal" : "vertical"}
            aria-valuenow={Math.round(pos * 100)}
            style={{
              position: "absolute",
              pointerEvents: "auto",
              cursor: isRowLayout ? "col-resize" : "row-resize",
              width: GRABBER_SIZE,
              height: GRABBER_SIZE,
              borderRadius: "50%",
              backgroundColor: "#ffffff",
              boxShadow: GRABBER_SHADOW,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: ARROW_COLOR,
              userSelect: "none",
              touchAction: "none",
              ...(isRowLayout
                ? {
                    left: `${pos * 100}%`,
                    top: "50%",
                    transform: `translate(-${GRABBER_SIZE / 2}px, -${
                      GRABBER_SIZE / 2
                    }px)`,
                  }
                : {
                    left: "50%",
                    top: `${pos * 100}%`,
                    transform: `translate(-${GRABBER_SIZE / 2}px, -${
                      GRABBER_SIZE / 2
                    }px)`,
                  }),
            }}
          >
            {isRowLayout ? (
              <svg
                width="20"
                height="14"
                viewBox="0 0 20 14"
                aria-hidden="true"
              >
                <path d="M5 7 L0 3.5 L0 10.5 Z" fill="currentColor" />
                <path d="M15 7 L20 3.5 L20 10.5 Z" fill="currentColor" />
              </svg>
            ) : (
              <svg
                width="14"
                height="20"
                viewBox="0 0 14 20"
                aria-hidden="true"
              >
                <path d="M7 5 L3.5 0 L10.5 0 Z" fill="currentColor" />
                <path d="M7 15 L3.5 20 L10.5 20 Z" fill="currentColor" />
              </svg>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
