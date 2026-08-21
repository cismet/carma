import { useRef, useCallback } from "react";

/**
 * Controlled splitter overlay. For each split between adjacent panels,
 * renders a thin visible white divider line plus an invisible wider
 * hit strip sitting on top of it, so the user can grab the line
 * directly, no visible knob required. The cursor changes to
 * col-resize / row-resize on hover over the hit strip so the
 * interaction is discoverable.
 *
 * `orientation` here refers to the LAYOUT of the panels, matching
 * `side-by-side.orientation`:
 *   - "horizontal": panels are in a row, the split is a vertical line
 *     that slides left/right
 *   - "vertical":   panels are stacked, the split is a horizontal line
 *     that slides up/down
 */
interface SwipeOverlayProps {
  orientation?: "horizontal" | "vertical";
  positions: number[];
  onPositionsChange: (positions: number[]) => void;
}

const LINE_THICKNESS = 2;
const LINE_COLOR = "rgba(255, 255, 255, 0.9)";
const LINE_SHADOW = "0 0 0 1px rgba(0,0,0,0.25)";
// Invisible hit target centered on the visible line; wide enough that
// grabbing the 2 px line is comfortable on both mouse and touch.
const HIT_THICKNESS = 16;

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
          {/* Invisible wide hit strip centered on the line. This is
           *  the actual drag target; the visible line above is purely
           *  cosmetic. Cursor changes to col-/row-resize on hover so
           *  the interaction is discoverable. */}
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
              backgroundColor: "transparent",
              userSelect: "none",
              touchAction: "none",
              ...(isRowLayout
                ? {
                    left: `${pos * 100}%`,
                    top: 0,
                    width: HIT_THICKNESS,
                    height: "100%",
                    transform: `translateX(-${HIT_THICKNESS / 2}px)`,
                  }
                : {
                    left: 0,
                    top: `${pos * 100}%`,
                    width: "100%",
                    height: HIT_THICKNESS,
                    transform: `translateY(-${HIT_THICKNESS / 2}px)`,
                  }),
            }}
          />
        </div>
      ))}
    </div>
  );
}
