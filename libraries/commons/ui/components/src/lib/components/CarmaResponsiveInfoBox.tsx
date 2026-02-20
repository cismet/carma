import CarmaCard from "./CarmaCard";
import { useState } from "react";
import { Control } from "@carma-mapping/map-controls-layout";

export interface CarmaResponsiveInfoBoxProps {
  onPanelClick?: (event: React.MouseEvent) => void;
  width?: number;
  header?: React.ReactNode;
  heading?: React.ReactNode;
  headingColor?: string;
  subtitle?: React.ReactNode;
  content?: React.ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (value: boolean) => void;
  collapsible?: boolean;
}

export const CarmaResponsiveInfoBox = ({
  onPanelClick = () => {},
  width,
  header,
  heading,
  headingColor,
  subtitle,
  content,
  collapsed,
  onCollapsedChange,
  collapsible = false,
}: CarmaResponsiveInfoBoxProps) => {
  const resolvedWidth = width ?? 350;

  const [internalCollapsed, setInternalCollapsed] = useState(false);

  const actualCollapsed =
    collapsed !== undefined ? collapsed : internalCollapsed;
  const actualSetCollapsed =
    onCollapsedChange !== undefined ? onCollapsedChange : setInternalCollapsed;

  const fallbackWindowWidth =
    typeof window !== "undefined" ? window.innerWidth : resolvedWidth;

  const infoBoxStyle = {
    width:
      typeof window !== "undefined" &&
      fallbackWindowWidth - 25 - resolvedWidth - 300 <= 0
        ? fallbackWindowWidth - 25
        : resolvedWidth,
  };

  return (
    <div>
      <Control position="bottomright" order={11}>
        <div
          data-test-id="info-box"
          style={{
            ...infoBoxStyle,
            fontFamily: "Helvetica Neue, Arial, Helvetica, sans-serif",
            fontSize: "0.75rem",
            pointerEvents: "auto",
          }}
        >
          {header}
          <CarmaCard
            header={heading}
            headerColor={headingColor}
            subtitle={subtitle}
            content={content}
            collapsed={actualCollapsed}
            onCollapsedChange={actualSetCollapsed}
            style={{ pointerEvents: "auto" }}
            collapseButtonAreaStyle={{ opacity: "0.9", width: 25 }}
            onClick={onPanelClick}
            collapsible={collapsible}
          />
        </div>
      </Control>
    </div>
  );
};

export default CarmaResponsiveInfoBox;
