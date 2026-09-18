import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  getViewportPanelLayout,
  VIEWPORT_PANEL_SIDES as SIDES,
  type ViewportPanelSide as Side,
} from "@carma-commons/ui/components";

const GAP = 16;
const TEXT =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

/** UI occlusion goes only through MapLibre; no direct loader/camera updates. */
export const ViewportPaddingPanels = ({ map }: { map: MapLibreMap }) => {
  const [enabled, setEnabled] = useState<Record<Side, boolean>>({
    left: true,
    top: false,
    right: false,
    bottom: false,
  });
  const [sizes, setSizes] = useState<Record<Side, number>>({
    left: 288,
    right: 288,
    top: 160,
    bottom: 160,
  });
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const frame = useRef(0);
  const drag = useRef<{ side: Side; coordinate: number; size: number } | null>(
    null
  );
  useEffect(() => {
    const host = map.getContainer();
    const update = () =>
      setBounds({ width: host.clientWidth, height: host.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(host);
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [map]);
  const { extents, padding: insets } = getViewportPanelLayout({
    ...bounds,
    sizes,
    enabled,
    gap: GAP,
  });
  const extent = (side: Side) => extents[side];
  useEffect(() => {
    if (!bounds.width || !bounds.height) return;
    map.setPadding(insets);
  }, [
    map,
    bounds.width,
    bounds.height,
    insets.left,
    insets.right,
    insets.top,
    insets.bottom,
  ]);
  useEffect(
    () => () => {
      if (map.getCanvas().isConnected) {
        map.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
      }
    },
    [map]
  );

  return (
    <>
      <nav
        aria-label="Padding panels"
        style={{
          position: "absolute",
          left: "50%",
          bottom: GAP,
          transform: "translateX(-50%)",
          zIndex: 5,
          display: "flex",
          gap: 4,
          padding: 6,
          borderRadius: 10,
          background: "rgba(255,255,255,.9)",
          boxShadow: "0 1px 8px #0003",
        }}
      >
        {SIDES.map((side) => (
          <button
            key={side}
            data-test-id={`padding-toggle-${side}`}
            aria-pressed={enabled[side]}
            onClick={() =>
              setEnabled((value) => ({ ...value, [side]: !value[side] }))
            }
            style={{
              cursor: "pointer",
              border: "1px solid #9aa7b3",
              borderRadius: 6,
              padding: "5px 10px",
              background: enabled[side] ? "#164e63" : "#fff",
              color: enabled[side] ? "#fff" : "#172b3a",
              textTransform: "capitalize",
            }}
          >
            {side}
          </button>
        ))}
        <button
          onClick={() =>
            setEnabled({ left: false, top: false, right: false, bottom: false })
          }
        >
          Off
        </button>
      </nav>
      {SIDES.filter((side) => enabled[side]).map((side) => {
        const horizontal = side === "left" || side === "right";
        const inner = {
          left: "right",
          right: "left",
          top: "bottom",
          bottom: "top",
        }[side];
        const placement: CSSProperties = horizontal
          ? {
              [side]: GAP,
              top: insets.top + GAP,
              bottom: insets.bottom + GAP,
              width: extent(side),
            }
          : { [side]: GAP, left: GAP, right: GAP, height: extent(side) };
        return (
          <aside
            key={side}
            data-test-id={`padding-panel-${side}`}
            style={{
              ...placement,
              boxSizing: "border-box",
              position: "absolute",
              zIndex: 3,
              padding: 20,
              borderRadius: 16,
              background: "rgba(248,250,252,.78)",
              color: "#172b3a",
              boxShadow: "0 2px 12px #0003",
              font: "14px/1.6 system-ui",
            }}
          >
            <div style={{ height: "100%", overflow: "hidden" }}>
              <strong style={{ textTransform: "capitalize" }}>
                {side} sidebar
              </strong>
              <p>{TEXT}</p>
              <p>{TEXT}</p>
              <small>
                Drag the inner edge · MapLibre padding:{" "}
                {Math.round(insets[side])} px
              </small>
            </div>
            <div
              role="separator"
              tabIndex={0}
              aria-label={`Resize ${side} sidebar`}
              aria-orientation={horizontal ? "vertical" : "horizontal"}
              aria-valuenow={Math.round(extent(side))}
              data-test-id={`padding-resize-${side}`}
              style={{
                position: "absolute",
                [inner]: -4,
                ...(horizontal
                  ? { top: 14, bottom: 14, width: 10 }
                  : { left: 14, right: 14, height: 10 }),
                cursor: horizontal ? "ew-resize" : "ns-resize",
                touchAction: "none",
                borderRadius: 6,
                background: "rgba(22,78,99,.3)",
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  side,
                  coordinate: horizontal ? event.clientX : event.clientY,
                  size: extent(side),
                };
              }}
              onPointerMove={(event) => {
                const active = drag.current;
                if (!active || active.side !== side) return;
                const delta =
                  ((horizontal ? event.clientX : event.clientY) -
                    active.coordinate) *
                  (side === "right" || side === "bottom" ? -1 : 1);
                const size = Math.max(48, active.size + delta);
                cancelAnimationFrame(frame.current);
                frame.current = requestAnimationFrame(() =>
                  setSizes((value) => ({ ...value, [side]: size }))
                );
              }}
              onPointerUp={(event) => {
                drag.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key
                  )
                )
                  return;
                event.preventDefault();
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : -1;
                setSizes((value) => ({
                  ...value,
                  [side]: Math.max(
                    48,
                    extent(side) +
                      16 *
                        direction *
                        (side === "right" || side === "bottom" ? -1 : 1)
                  ),
                }));
              }}
            />
          </aside>
        );
      })}
    </>
  );
};
