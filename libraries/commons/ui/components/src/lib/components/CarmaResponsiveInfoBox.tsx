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
  headingStyle?: CSSProperties;
  bodyStyle?: CSSProperties;
  subtitle?: React.ReactNode;
  hideSubtitleWhenCollapsed?: boolean;
  content?: React.ReactNode;
  footer?: React.ReactNode;
  hideFooterWhenCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (value: boolean) => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapsedHorizontalAnchor?: "control-edge" | "expanded-left";
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
  headingStyle,
  bodyStyle,
  subtitle,
  hideSubtitleWhenCollapsed = false,
  content,
  footer,
  hideFooterWhenCollapsed = false,
  collapsed,
  onCollapsedChange,
  collapsible = false,
  defaultCollapsed = false,
  collapsedHorizontalAnchor = "control-edge",
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
  const infoBoxRef = useRef<HTMLDivElement | null>(null);
  const [expandedAnchorWidth, setExpandedAnchorWidth] = useState<number | null>(
    null
  );
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
  const isRightAnchoredControl =
    useControlLayout &&
    (controlPosition === "topright" || controlPosition === "bottomright");
  const shouldAnchorCollapsedToExpandedLeft =
    actualCollapsed && collapsedHorizontalAnchor === "expanded-left";
  const shouldAnchorCollapsedCardToControlEdge =
    actualCollapsed &&
    collapsedHorizontalAnchor === "control-edge" &&
    isRightAnchoredControl;

  const infoBoxStyle: CSSProperties = actualCollapsed
    ? shouldAnchorCollapsedToExpandedLeft
      ? {
          width: expandedAnchorWidth ?? resolvedExpandedWidth,
          maxWidth: useControlLayout
            ? `calc(100vw - ${CONTROL_LAYOUT_EDGE_MARGIN_PX}px)`
            : resolvedExpandedWidth,
          display: "block",
        }
      : {
          width: "fit-content",
          minWidth: INFO_BOX_MIN_WIDTH_REM,
          maxWidth: useControlLayout
            ? `max(${INFO_BOX_MIN_WIDTH_REM}, calc(100vw - ${CONTROL_LAYOUT_EDGE_MARGIN_PX}px))`
            : resolvedExpandedWidth,
          display: "block",
        }
    : fitContentWidth
    ? {
        width: "fit-content",
        minWidth: INFO_BOX_MIN_WIDTH_REM,
        maxWidth: resolvedExpandedWidth,
        display: "block",
      }
    : {
        width: resolvedExpandedWidth,
      };

  useEffect(() => {
    if (
      collapsedHorizontalAnchor !== "expanded-left" ||
      actualCollapsed ||
      typeof window === "undefined"
    ) {
      return;
    }

    const element = infoBoxRef.current;
    if (!element) {
      return;
    }

    const updateExpandedAnchorWidth = () => {
      const nextWidth = element.getBoundingClientRect().width;
      if (Number.isFinite(nextWidth) && nextWidth > 0) {
        setExpandedAnchorWidth(nextWidth);
      }
    };

    updateExpandedAnchorWidth();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(updateExpandedAnchorWidth);
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, [actualCollapsed, collapsedHorizontalAnchor, resolvedExpandedWidth]);

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
      ref={infoBoxRef}
      data-test-id="info-box"
      style={{
        ...infoBoxStyle,
        ...(isRightAnchoredControl ? { marginLeft: "auto" } : null),
        fontFamily: "Helvetica Neue, Arial, Helvetica, sans-serif",
        fontSize: "0.75rem",
        pointerEvents: shouldAnchorCollapsedToExpandedLeft ? "none" : "auto",
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
        headerStyle={headingStyle}
        bodyStyle={bodyStyle}
        subtitle={subtitle}
        hideSubtitleWhenCollapsed={hideSubtitleWhenCollapsed}
        content={content}
        footer={footer}
        hideFooterWhenCollapsed={hideFooterWhenCollapsed}
        collapsed={actualCollapsed}
        onCollapsedChange={actualSetCollapsed}
        style={{
          pointerEvents: "auto",
          ...(shouldAnchorCollapsedCardToControlEdge
            ? { marginLeft: "auto" }
            : null),
        }}
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
