import { useRef, useState, type ReactNode } from "react";
import panelCss from "./TileLoadingDebugPanels.css?inline";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export type DiagnosticPanelProps = {
  title: ReactNode;
  /** Buttons for the header bar, beside the title. */
  actions?: ReactNode;
  defaultPosition?: { left: number; top: number };
  testId?: string;
  children: ReactNode;
};

/**
 * The window chrome the tile diagnostics use: a floating panel dragged by its
 * header, in the same style as the debugger's panels. Movement is compositor
 * only, with the bounds measured once at pointer down, so a drag costs no
 * layout read and no React render per move.
 */
export const DiagnosticPanel = ({
  title,
  actions,
  defaultPosition = { left: 8, top: 8 },
  testId,
  children,
}: DiagnosticPanelProps) => {
  const [position, setPosition] = useState(defaultPosition);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    maxLeft: number;
    maxTop: number;
    dx: number;
    dy: number;
    element: HTMLElement;
  } | null>(null);
  return (
    <div
      className="tile-debug-panel"
      data-test-id={testId}
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
        boxShadow: "0 2px 12px rgb(15 23 42 / 35%)",
        overflow: "hidden",
      }}
    >
      <style>{panelCss}</style>
      <header
        aria-label="Fenster verschieben"
        tabIndex={0}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 4px 2px 8px",
          height: 32,
          boxSizing: "border-box",
          background: "rgb(241 245 249 / 80%)",
          borderBottom: "1px solid rgb(100 116 139 / 16%)",
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
          font: "600 12px system-ui",
        }}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          const element = event.currentTarget.parentElement as HTMLElement;
          const rect = element.getBoundingClientRect();
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: rect.left,
            top: rect.top,
            maxLeft: Math.max(0, window.innerWidth - rect.width),
            maxTop: Math.max(44, window.innerHeight - 36),
            dx: 0,
            dy: 0,
            element,
          };
          element.style.willChange = "transform";
          // Selection would start on the title before a capture that throws,
          // so the drag stops the default first and captures afterwards.
          event.preventDefault();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* A pointer without capture still moves through the handlers. */
          }
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          current.dx =
            clamp(
              current.left + event.clientX - current.x,
              0,
              current.maxLeft
            ) - current.left;
          current.dy =
            clamp(current.top + event.clientY - current.y, 44, current.maxTop) -
            current.top;
          current.element.style.transform = `translate3d(${current.dx}px, ${current.dy}px, 0)`;
        }}
        onLostPointerCapture={() => {
          const current = drag.current;
          if (!current) return;
          const parent = current.element.offsetParent?.getBoundingClientRect();
          current.element.style.transform = "";
          current.element.style.willChange = "";
          setPosition({
            left: current.left + current.dx - (parent?.left ?? 0),
            top: current.top + current.dy - (parent?.top ?? 0),
          });
          drag.current = null;
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <span style={{ marginRight: "auto" }}>{title}</span>
        <span
          className="tile-debug-window-controls"
          style={{ display: "flex", alignItems: "center", gap: 2 }}
        >
          {actions}
        </span>
      </header>
      {children}
    </div>
  );
};
