import React from "react";
import Icon from "react-cismap/commons/Icon";

export interface CarmaCardProps {
  header?: React.ReactNode;
  headerColor?: string;
  /** Always-visible line below header (not collapsed). */
  subtitle?: React.ReactNode;
  /** Collapsible body content. */
  content?: React.ReactNode;
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
}

const CarmaCard = ({
  header,
  headerColor,
  subtitle,
  content,
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
}: CarmaCardProps) => {
  const transition =
    transitionDuration > 0
      ? `grid-template-rows ${transitionDuration}ms ${transitionEasing}`
      : undefined;

  return (
    <div onClick={onClick} style={style}>
      {header && (
        <div
          style={{
            borderRadius: "4px 4px 0 0",
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
            position: "relative",
            zIndex: 1,
            backgroundColor: headerColor,
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            padding: "3px 0px",
          }}
        >
          {header}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          backgroundColor: "rgba(245, 245, 245, 0.8)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          borderRadius: header ? "0 0 4px 4px" : "4px",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ paddingBottom: 2 }}>{subtitle}</div>
          <div
            style={{
              display: "grid",
              gridTemplateRows: collapsed && collapsible ? "0fr" : "1fr",
              transition,
            }}
          >
            <div style={{ overflow: "hidden" }}>{content}</div>
          </div>
        </div>
        {collapsible && (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onCollapsedChange?.(!collapsed);
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
              background: "#cccccc",
              ...collapseButtonAreaStyle,
            }}
          >
            {collapsed ? downButton : upButton}
          </div>
        )}
      </div>
    </div>
  );
};

export default CarmaCard;
