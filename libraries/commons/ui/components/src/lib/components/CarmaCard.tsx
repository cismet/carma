import React from "react";
import Icon from "react-cismap/commons/Icon";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical } from "@fortawesome/free-solid-svg-icons";

const parseCssRgb = (colorValue: string): [number, number, number] | null => {
  const match = colorValue.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return null;
  }
  const channels = match[1]
    .split(",")
    .slice(0, 3)
    .map((channel) => Number.parseFloat(channel.trim()));
  if (
    channels.length !== 3 ||
    channels.some((channel) => Number.isNaN(channel))
  ) {
    return null;
  }
  return [channels[0], channels[1], channels[2]];
};

const srgbToLinear = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const isPerceptuallyDark = ([r, g, b]: [number, number, number]): boolean => {
  const luminance =
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b);
  return luminance < 0.45;
};

export interface CarmaCardProps {
  header?: React.ReactNode;
  headerColor?: string;
  bodyStyle?: React.CSSProperties;
  /** Always-visible line below header (not collapsed). */
  subtitle?: React.ReactNode;
  /** Collapsible body content. */
  content?: React.ReactNode;
  /** Always-visible line below collapsible content. */
  footer?: React.ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  collapsible?: boolean;
  /** Collapse animation duration in ms. 0 to disable. */
  transitionDuration?: number;
  /** CSS easing function, e.g. "ease-in-out", "cubic-bezier(0.4, 0, 0.2, 1)" */
  transitionEasing?: string;
  style?: React.CSSProperties;
  collapseButtonAreaStyle?: React.CSSProperties;
  onClick?: (event: React.MouseEvent) => void;
  upButton?: React.ReactNode;
  downButton?: React.ReactNode;
  draggable?: boolean;
  onDragHandlePointerDown?: React.PointerEventHandler<HTMLDivElement>;
  dragHandleTitle?: string;
  dragGripPlacement?: "left" | "auto";
}

const CarmaCard = ({
  header,
  headerColor,
  bodyStyle,
  subtitle,
  content,
  footer,
  collapsed,
  onCollapsedChange,
  collapsible = false,
  transitionDuration = 300,
  transitionEasing = "ease-in-out",
  style,
  collapseButtonAreaStyle = {},
  onClick,
  upButton = (
    <h4 style={{ margin: 2, fontSize: "18px" }}>
      <Icon
        title="kompakte Info-Box"
        style={{ color: "#7e7e7e" }}
        name="chevron-circle-up"
      />
    </h4>
  ),
  downButton = (
    <h4 style={{ margin: 2, fontSize: "18px" }}>
      <Icon
        title="vollständige info-Box"
        style={{ color: "#7e7e7e" }}
        name="chevron-circle-down"
      />
    </h4>
  ),
  draggable = false,
  onDragHandlePointerDown,
  dragHandleTitle = "Drag panel",
  dragGripPlacement = "auto",
}: CarmaCardProps) => {
  const headerContainerRef = React.useRef<HTMLDivElement | null>(null);
  const headerRowRef = React.useRef<HTMLDivElement | null>(null);
  const headerContentRef = React.useRef<HTMLDivElement | null>(null);
  const collapsibleContentRef = React.useRef<HTMLDivElement | null>(null);
  const headerCollapseToggleRef = React.useRef<HTMLDivElement | null>(null);
  const [computedHeaderColor, setComputedHeaderColor] = React.useState<
    string | null
  >(null);
  const [isHeaderBackgroundDark, setIsHeaderBackgroundDark] =
    React.useState<boolean>(true);
  const [collapsibleContentHeight, setCollapsibleContentHeight] =
    React.useState<number>(0);
  const [showCenteredGrip, setShowCenteredGrip] =
    React.useState<boolean>(false);
  const hasNode = (node: React.ReactNode): boolean =>
    node !== undefined && node !== null && node !== false;
  const hasCollapsibleBodyContent = hasNode(content);
  const hasStaticBodyContent = hasNode(subtitle) || hasNode(footer);
  const headerTextColor =
    React.isValidElement(header) &&
    (header.props as { style?: React.CSSProperties })?.style?.color
      ? (header.props as { style?: React.CSSProperties }).style?.color
      : undefined;
  const shouldRenderCollapseInHeader =
    collapsible &&
    Boolean(collapsed) &&
    hasNode(header) &&
    !hasStaticBodyContent;
  const isHeaderOnlyCollapsed =
    collapsible && Boolean(collapsed) && !hasStaticBodyContent;
  const shouldRenderBody =
    hasStaticBodyContent ||
    (hasCollapsibleBodyContent && !isHeaderOnlyCollapsed);
  const hasBodySideCollapseToggle =
    collapsible && !shouldRenderCollapseInHeader;
  const bodyContentAreaBorderRadius = hasBodySideCollapseToggle
    ? header
      ? "0 0 0 4px"
      : "4px 0 0 4px"
    : header
    ? "0 0 4px 4px"
    : "4px";
  const collapseAreaWidth = collapseButtonAreaStyle.width;
  const resolvedHeaderToggleSlotWidthPx =
    typeof collapseAreaWidth === "number" ? collapseAreaWidth : 25;
  const headerToggleSlotStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    right: 0,
    transform: "translateY(-50%)",
    marginLeft: 0,
    marginRight: 0,
    width: resolvedHeaderToggleSlotWidthPx,
    minWidth: resolvedHeaderToggleSlotWidthPx,
  };
  const useLegacyHeaderRowLayout = !draggable && !shouldRenderCollapseInHeader;

  React.useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const contentElement = headerContentRef.current;
    const containerElement = headerContainerRef.current;
    if (!contentElement) {
      return;
    }
    const color = window.getComputedStyle(contentElement).color;
    setComputedHeaderColor(color || null);
    const backgroundColor = containerElement
      ? window.getComputedStyle(containerElement).backgroundColor
      : "";
    const rgb = parseCssRgb(backgroundColor);
    setIsHeaderBackgroundDark(rgb ? isPerceptuallyDark(rgb) : true);

    if (!draggable || dragGripPlacement !== "auto") {
      setShowCenteredGrip(false);
      return;
    }

    const computeGripPlacement = () => {
      const rowElement = headerRowRef.current;
      if (!rowElement) {
        setShowCenteredGrip(false);
        return;
      }
      const rowRect = rowElement.getBoundingClientRect();
      const titleRect = contentElement.getBoundingClientRect();
      const toggleRect =
        shouldRenderCollapseInHeader && headerCollapseToggleRef.current
          ? headerCollapseToggleRef.current.getBoundingClientRect()
          : null;

      const gripHalfWidthPx = 8;
      const gripClearancePx = 8;
      const centerX = rowRect.left + rowRect.width / 2;
      const gripLeft = centerX - gripHalfWidthPx - gripClearancePx;
      const gripRight = centerX + gripHalfWidthPx + gripClearancePx;

      const overlapsTitle =
        gripRight > titleRect.left && gripLeft < titleRect.right;
      const overlapsToggle = toggleRect
        ? gripRight > toggleRect.left - 4 && gripLeft < toggleRect.right + 4
        : false;
      const insideRowBounds =
        gripLeft >= rowRect.left + 6 && gripRight <= rowRect.right - 6;

      setShowCenteredGrip(insideRowBounds && !overlapsTitle && !overlapsToggle);
    };

    computeGripPlacement();

    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      computeGripPlacement();
    });
    if (headerRowRef.current) {
      resizeObserver.observe(headerRowRef.current);
    }
    if (headerCollapseToggleRef.current) {
      resizeObserver.observe(headerCollapseToggleRef.current);
    }
    return () => {
      resizeObserver.disconnect();
    };
  }, [
    header,
    collapsed,
    shouldRenderBody,
    draggable,
    dragGripPlacement,
    shouldRenderCollapseInHeader,
  ]);

  React.useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const element = collapsibleContentRef.current;
    if (!element) {
      setCollapsibleContentHeight(0);
      return;
    }
    const updateHeight = () => {
      setCollapsibleContentHeight(element.scrollHeight);
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, [content, collapsed, shouldRenderBody]);

  const renderCollapseToggle = (inHeader: boolean) => (
    <div
      ref={inHeader ? headerCollapseToggleRef : undefined}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onCollapsedChange?.(!collapsed);
      }}
      onPointerDown={(e) => {
        // Prevent header drag from starting when clicking the collapse toggle.
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onCollapsedChange?.(!collapsed);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        ...(inHeader
          ? headerToggleSlotStyle
          : {
              background: "#cccccc",
              borderRadius: header ? "0 0 4px 0" : "0 4px 4px 0",
              ...collapseButtonAreaStyle,
            }),
      }}
    >
      {collapsed ? downButton : upButton}
    </div>
  );

  const dragGripSharedStyle: React.CSSProperties = {
    color: headerTextColor ?? computedHeaderColor ?? "inherit",
  };
  const dragGripShellStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    padding: 0,
    background: "transparent",
    boxShadow: "none",
  };

  const inlineDragGrip =
    draggable && (dragGripPlacement !== "auto" || !showCenteredGrip) ? (
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 8,
          marginLeft: 2,
          flexShrink: 0,
          ...dragGripSharedStyle,
        }}
      >
        <span style={dragGripShellStyle}>
          <FontAwesomeIcon
            icon={faGripVertical}
            style={{
              opacity: 0.9,
            }}
          />
        </span>
      </span>
    ) : null;

  const centeredDragGrip =
    draggable && dragGripPlacement === "auto" && showCenteredGrip ? (
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 2,
          ...dragGripSharedStyle,
        }}
      >
        <span style={dragGripShellStyle}>
          <FontAwesomeIcon
            icon={faGripVertical}
            style={{
              opacity: 0.9,
            }}
          />
        </span>
      </span>
    ) : null;

  return (
    <div
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick(event as unknown as React.MouseEvent);
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        ...(collapsible && collapsed
          ? {
              width: "fit-content",
              minWidth: 0,
              maxWidth: "100%",
            }
          : null),
        ...style,
      }}
    >
      {header && (
        <div
          ref={headerContainerRef}
          style={{
            borderRadius: shouldRenderBody ? "4px 4px 0 0" : "4px",
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
            position: "relative",
            zIndex: 1,
            backgroundColor: headerColor,
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            padding: "3px 0px",
            ...(draggable
              ? {
                  cursor: "grab",
                  userSelect: "none",
                  touchAction: "none",
                }
              : null),
          }}
          title={draggable ? dragHandleTitle : undefined}
          onPointerDown={draggable ? onDragHandlePointerDown : undefined}
        >
          {useLegacyHeaderRowLayout ? (
            <div style={{ minWidth: 0, padding: "0 8px" }}>
              <div
                ref={headerContentRef}
                style={{
                  minWidth: 0,
                  maxWidth: "100%",
                  overflow: collapsible && collapsed ? "hidden" : undefined,
                  textOverflow:
                    collapsible && collapsed ? "ellipsis" : undefined,
                  whiteSpace: collapsible && collapsed ? "nowrap" : undefined,
                }}
              >
                {header}
              </div>
            </div>
          ) : (
            <div
              ref={headerRowRef}
              style={{
                position: "relative",
                minWidth: 0,
                padding: shouldRenderCollapseInHeader
                  ? `0 ${resolvedHeaderToggleSlotWidthPx + 8}px 0 8px`
                  : "0 8px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {centeredDragGrip}
              {inlineDragGrip}
              <div
                style={{
                  minWidth: 0,
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <div
                  ref={headerContentRef}
                  style={{
                    minWidth: 0,
                    maxWidth: "100%",
                    display: "inline-flex",
                    overflow: collapsible && collapsed ? "hidden" : undefined,
                    textOverflow:
                      collapsible && collapsed ? "ellipsis" : undefined,
                    whiteSpace: collapsible && collapsed ? "nowrap" : undefined,
                  }}
                >
                  {header}
                </div>
              </div>
              {shouldRenderCollapseInHeader ? renderCollapseToggle(true) : null}
            </div>
          )}
        </div>
      )}
      {shouldRenderBody ? (
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            backgroundColor: "rgba(245, 245, 245, 0.8)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            borderRadius: header ? "0 0 4px 4px" : "4px",
            overflow: "hidden",
            ...bodyStyle,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: bodyContentAreaBorderRadius,
            }}
          >
            {hasNode(subtitle) ? (
              <div style={{ paddingBottom: 2 }}>{subtitle}</div>
            ) : null}
            <div
              style={{
                maxHeight:
                  collapsed && collapsible ? 0 : collapsibleContentHeight,
                opacity: collapsed && collapsible ? 0 : 1,
                overflow: "hidden",
                transition:
                  transitionDuration > 0
                    ? `max-height ${transitionDuration}ms ${transitionEasing}, opacity ${Math.min(
                        220,
                        transitionDuration
                      )}ms ${transitionEasing}`
                    : undefined,
              }}
            >
              <div ref={collapsibleContentRef}>{content}</div>
            </div>
            {footer ? <div style={{ paddingTop: 2 }}>{footer}</div> : null}
          </div>
          {collapsible && !shouldRenderCollapseInHeader
            ? renderCollapseToggle(false)
            : null}
          {collapsible && shouldRenderCollapseInHeader ? (
            <div
              aria-hidden
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: "#cccccc",
                borderRadius: header ? "0 0 4px 0" : "0 4px 4px 0",
                visibility: "hidden",
                pointerEvents: "none",
                ...collapseButtonAreaStyle,
              }}
            >
              {collapsed ? downButton : upButton}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default CarmaCard;
