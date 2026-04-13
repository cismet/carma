import CarmaCard from "./CarmaCard";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Control } from "@carma-mapping/map-controls-layout";

type DragOffset = {
  x: number;
  y: number;
};

type ControlPosition =
  | "topleft"
  | "topright"
  | "topcenter"
  | "bottomleft"
  | "bottomright"
  | "bottomcenter";

const INFO_BOX_MIN_WIDTH_REM = "24rem";
const CONTROL_LAYOUT_EDGE_MARGIN_PX = 25;

export interface CarmaResponsiveInfoBoxProps {
  onPanelClick?: (event: React.MouseEvent) => void;
  width?: number;
  fitContentWidth?: boolean;
  header?: React.ReactNode;
  heading?: React.ReactNode;
  headingColor?: string;
  bodyStyle?: CSSProperties;
  subtitle?: React.ReactNode;
  hideSubtitleWhenCollapsed?: boolean;
  content?: React.ReactNode;
  footer?: React.ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (value: boolean) => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  useControlLayout?: boolean;
  controlPosition?: ControlPosition;
  controlOrder?: number;
  style?: CSSProperties;
  draggable?: boolean;
  initialDragOffset?: DragOffset;
  dragHandleTitle?: string;
  dragGripPlacement?: "left" | "auto";
}

export const CarmaResponsiveInfoBox = ({
  onPanelClick = () => {},
  width,
  fitContentWidth = false,
  header,
  heading,
  headingColor,
  bodyStyle,
  subtitle,
  hideSubtitleWhenCollapsed = false,
  content,
  footer,
  collapsed,
  onCollapsedChange,
  collapsible = false,
  defaultCollapsed = false,
  useControlLayout = true,
  controlPosition = "bottomright",
  controlOrder = 11,
  style,
  draggable = false,
  initialDragOffset = { x: 0, y: 0 },
  dragHandleTitle,
  dragGripPlacement = "auto",
}: CarmaResponsiveInfoBoxProps) => {
  const resolvedWidth = width ?? 350;
  const [dragOffset, setDragOffset] = useState<DragOffset>(initialDragOffset);
  const dragStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);

  const actualCollapsed =
    collapsed !== undefined ? collapsed : internalCollapsed;
  const actualSetCollapsed =
    onCollapsedChange !== undefined ? onCollapsedChange : setInternalCollapsed;

  const fallbackWindowWidth =
    typeof window !== "undefined" ? window.innerWidth : resolvedWidth;

  const resolvedExpandedWidth =
    typeof window !== "undefined" &&
    useControlLayout &&
    fallbackWindowWidth - CONTROL_LAYOUT_EDGE_MARGIN_PX - resolvedWidth - 300 <=
      0
      ? fallbackWindowWidth - CONTROL_LAYOUT_EDGE_MARGIN_PX
      : resolvedWidth;

  const infoBoxStyle: CSSProperties = actualCollapsed
    ? {
        width: "fit-content",
        minWidth: INFO_BOX_MIN_WIDTH_REM,
        maxWidth: useControlLayout
          ? `max(${INFO_BOX_MIN_WIDTH_REM}, calc(100vw - ${CONTROL_LAYOUT_EDGE_MARGIN_PX}px))`
          : resolvedExpandedWidth,
        marginLeft: "auto",
        display: "inline-block",
      }
    : fitContentWidth
    ? {
        width: "fit-content",
        minWidth: INFO_BOX_MIN_WIDTH_REM,
        maxWidth: resolvedExpandedWidth,
        display: "inline-block",
      }
    : {
        width: resolvedExpandedWidth,
      };

  useEffect(() => {
    if (!draggable) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      setDragOffset({
        x: dragState.startOffsetX + (event.clientX - dragState.startClientX),
        y: dragState.startOffsetY + (event.clientY - dragState.startClientY),
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
  }, [draggable]);

  const box = (
    <div
      data-test-id="info-box"
      style={{
        ...infoBoxStyle,
        fontFamily: "Helvetica Neue, Arial, Helvetica, sans-serif",
        fontSize: "0.75rem",
        pointerEvents: "auto",
        ...style,
        ...(draggable
          ? {
              transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
            }
          : null),
      }}
    >
      {header}
      <CarmaCard
        header={heading}
        headerColor={headingColor}
        bodyStyle={bodyStyle}
        subtitle={subtitle}
        hideSubtitleWhenCollapsed={hideSubtitleWhenCollapsed}
        content={content}
        footer={footer}
        collapsed={actualCollapsed}
        onCollapsedChange={actualSetCollapsed}
        style={{ pointerEvents: "auto" }}
        collapseButtonAreaStyle={{ opacity: "0.9", width: 25 }}
        onClick={onPanelClick}
        collapsible={collapsible}
        draggable={draggable}
        dragHandleTitle={dragHandleTitle}
        dragGripPlacement={dragGripPlacement}
        onDragHandlePointerDown={
          draggable
            ? (event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                dragStateRef.current = {
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startOffsetX: dragOffset.x,
                  startOffsetY: dragOffset.y,
                };
              }
            : undefined
        }
      />
    </div>
  );

  if (!useControlLayout) {
    return box;
  }

  return (
    <div>
      <Control position={controlPosition} order={controlOrder}>
        {box}
      </Control>
    </div>
  );
};

export default CarmaResponsiveInfoBox;
