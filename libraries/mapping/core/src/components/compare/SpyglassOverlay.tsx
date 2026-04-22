import { useRef } from "react";

interface SpyglassOverlayProps {
  /** Pixel coords of the circle center, relative to the compare container.
   *  When null (e.g. before the first seed) the ring is not drawn. */
  position: { x: number; y: number } | null;
  /** Circle radius in pixels. Default: 150. */
  radius?: number;
  /** Called while the user drags the ring. The parent owns the position
   *  state so the clip-path on the overlay panel stays in sync. */
  onPositionChange: (position: { x: number; y: number }) => void;
}

/**
 * Draggable spyglass ring.
 *
 * The ring is an SVG with two concentric circles:
 *   1. A thin (2 px) visible stroke that paints the Lupe outline.
 *   2. A wide (16 px) fully-transparent hit circle on top, with
 *      `pointer-events: all` so BOTH the interior and the edge band
 *      act as a drag handle.
 *
 * The SVG itself is `pointer-events: none`. The hit circle opts back
 * in via `pointer-events: all`. That means:
 *   - clicks / drags anywhere on or inside the ring: grab and drag
 *     the Lupe (i.e. the Lupe moves, the maps stay still),
 *   - clicks / drags outside the ring: pass through to the base map.
 *
 * Trade-off: because the interior of the ring now consumes pointer
 * events, panning or click-selecting the overlay map *through* the
 * Lupe is no longer possible. To restore click-through while keeping
 * drag-to-move, we'd need a movement-threshold guard in onPointerMove
 * and only `setPointerCapture` once the threshold is exceeded.
 *
 * We deliberately do NOT track the mouse pointer. An earlier version
 * installed a follow-mouse listener, but that made panning the map
 * impossible (the Lupe kept racing ahead of the cursor). Drag-based
 * positioning is the standard cartographic Lupe UX.
 */
export function SpyglassOverlay({
  position,
  radius = 150,
  onPositionChange,
}: SpyglassOverlayProps) {
  // Delta-based drag: record pointer clientX / Y and the Lupe position
  // at pointerDown, then translate by the raw delta on every move. We
  // don't need the container's bounding rect; clientX is in viewport
  // coords on both sides of the subtraction and cancels out.
  const dragStart = useRef<{
    clientX: number;
    clientY: number;
    spyX: number;
    spyY: number;
  } | null>(null);

  if (!position) return null;

  const onPointerDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      spyX: position.x,
      spyY: position.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.clientX;
    const dy = e.clientY - dragStart.current.clientY;
    onPositionChange({
      x: dragStart.current.spyX + dx,
      y: dragStart.current.spyY + dy,
    });
  };

  const onPointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    dragStart.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Give the SVG a bit of extra room around the radius so the 16 px
  // hit-stroke isn't clipped by the SVG's own viewport.
  const PAD = 12;
  const svgSize = (radius + PAD) * 2;
  const center = svgSize / 2;

  return (
    <svg
      style={{
        position: "absolute",
        left: position.x - center,
        top: position.y - center,
        width: svgSize,
        height: svgSize,
        overflow: "visible",
        // SVG itself is transparent to pointer events; only the wide
        // hit-stroke below opts in. That way clicks inside the ring
        // reach the overlay map underneath.
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {/* Visible ring. */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.9)"
        strokeWidth={2}
        style={{
          filter:
            "drop-shadow(0 0 1px rgba(0,0,0,0.5)) drop-shadow(0 4px 16px rgba(0,0,0,0.4))",
        }}
      />
      {/* Wide transparent hit circle. pointerEvents: all makes BOTH the
       *  interior (fill) and the edge band (16 px stroke) into drag
       *  handles, so the user can grab the Lupe from anywhere on or
       *  inside the ring. */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{
          pointerEvents: "all",
          cursor: "grab",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </svg>
  );
}
