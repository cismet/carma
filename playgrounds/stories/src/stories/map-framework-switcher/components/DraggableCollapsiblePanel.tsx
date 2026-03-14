import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type DraggableCollapsiblePanelProps = {
  title: string;
  top?: number;
  right?: number;
  left?: number;
  bottom?: number;
  defaultCollapsed?: boolean;
  children: ReactNode;
};

export const DraggableCollapsiblePanel = ({
  title,
  top,
  right,
  left,
  bottom,
  defaultCollapsed = false,
  children,
}: DraggableCollapsiblePanelProps) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      setOffset({
        x: dragState.startOffsetX + (event.clientX - dragState.startX),
        y: dragState.startOffsetY + (event.clientY - dragState.startY),
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const panelStyle: CSSProperties = {
    position: "absolute",
    top,
    right,
    left,
    bottom,
    zIndex: 1100,
    pointerEvents: "auto",
    transform: `translate(${offset.x}px, ${offset.y}px)`,
    minWidth: 220,
    maxWidth: "min(520px, calc(100vw - 32px))",
  };

  return (
    <section style={panelStyle}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          background: "rgba(15, 23, 42, 0.88)",
          color: "#f8fafc",
          fontSize: 12,
          fontWeight: 600,
          cursor: "grab",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          userSelect: "none",
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            startOffsetX: offset.x,
            startOffsetY: offset.y,
          };
        }}
      >
        <span>{title}</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setCollapsed((prev) => !prev);
          }}
          style={{
            border: "none",
            background: "transparent",
            color: "#cbd5e1",
            fontSize: 12,
            cursor: "pointer",
            padding: "0 2px",
          }}
        >
          {collapsed ? "expand" : "collapse"}
        </button>
      </header>
      {!collapsed ? (
        <div
          style={{
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 8,
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.22)",
          }}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
};

