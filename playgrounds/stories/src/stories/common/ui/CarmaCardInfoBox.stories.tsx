import { useState, type CSSProperties } from "react";

import type { Meta, StoryObj } from "@storybook/react";

import {
  CarmaCard,
  CarmaResponsiveInfoBox,
  ResponsiveStatusBar,
} from "@carma-commons/ui/components";
const bodyTextStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: "#1f2937",
};

const surfaceStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  padding: 12,
  boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
};

const sectionStyle: CSSProperties = {
  ...surfaceStyle,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 360,
};

const STICKY_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1200,
  pointerEvents: "none",
};

type VariantProps = {
  title: string;
  subtitle?: string;
  content: string;
  footer?: string;
  draggable?: boolean;
  dragGripPlacement?: "left" | "auto";
  defaultCollapsed?: boolean;
  headerText?: string;
  panelWidth?: number;
};

const VariantLabel = ({ title }: { title: string }) => (
  <div
    style={{
      marginBottom: 8,
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.2,
      color: "#334155",
    }}
  >
    {title}
  </div>
);

const CardVariant = ({
  title,
  subtitle,
  content,
  footer,
  draggable = false,
  dragGripPlacement = "auto",
  defaultCollapsed = false,
  headerText = "CarmaCard",
  panelWidth,
}: VariantProps) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div style={surfaceStyle}>
      <VariantLabel title={title} />
      <div
        style={
          panelWidth
            ? { width: panelWidth, maxWidth: "100%" }
            : { display: "inline-block", maxWidth: "100%" }
        }
      >
        <CarmaCard
          draggable={draggable}
          dragGripPlacement={dragGripPlacement}
          dragHandleTitle="drag area"
          onDragHandlePointerDown={
            draggable
              ? (event) => {
                  event.preventDefault();
                }
              : undefined
          }
          header={
            <span style={{ color: "#ffffff", fontWeight: 600 }}>
              {headerText}
            </span>
          }
          headerColor="rgba(15, 23, 42, 0.9)"
          subtitle={
            subtitle ? <div style={bodyTextStyle}>{subtitle}</div> : undefined
          }
          content={<div style={bodyTextStyle}>{content}</div>}
          footer={
            footer ? <div style={bodyTextStyle}>{footer}</div> : undefined
          }
          collapsible
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          style={{ pointerEvents: "auto" }}
        />
      </div>
    </div>
  );
};

const InfoBoxVariant = ({
  title,
  subtitle,
  content,
  footer,
  draggable = false,
  dragGripPlacement = "auto",
  defaultCollapsed = false,
  headerText = "InfoBox",
  panelWidth,
}: VariantProps) => (
  <div style={surfaceStyle}>
    <VariantLabel title={title} />
    <div
      style={
        panelWidth
          ? { width: panelWidth, maxWidth: "100%" }
          : { display: "inline-block", maxWidth: "100%" }
      }
    >
      <CarmaResponsiveInfoBox
        useControlLayout={false}
        draggable={draggable}
        dragGripPlacement={dragGripPlacement}
        defaultCollapsed={defaultCollapsed}
        collapsible
        heading={
          <span style={{ color: "#ffffff", fontWeight: 600 }}>
            {headerText}
          </span>
        }
        headingColor="rgba(15, 23, 42, 0.9)"
        subtitle={
          subtitle ? <div style={bodyTextStyle}>{subtitle}</div> : undefined
        }
        content={<div style={bodyTextStyle}>{content}</div>}
        footer={footer ? <div style={bodyTextStyle}>{footer}</div> : undefined}
      />
    </div>
  </div>
);

const Showcase = () => {
  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        minHeight: "100vh",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        background: "linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)",
      }}
    >
      <div style={{ minHeight: "100vh" }}>
        <div style={STICKY_STATUS_BAR_OVERLAY_STYLE}>
          <ResponsiveStatusBar text="CarmaCard + CarmaResponsiveInfoBox variants" />
        </div>
        <div style={{ padding: 16 }}>
          <div
            style={{
              margin: "0 auto",
              maxWidth: 1320,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <section style={sectionStyle}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#334155",
                }}
              >
                CarmaCard
              </h2>
              <CardVariant
                title="expanded • static"
                subtitle="Subtitle row"
                content="Card body styles with collapsible content."
                footer="Footer row"
              />
              <CardVariant
                title="collapsed • static (subtitle/footer visible)"
                subtitle="Subtitle row"
                content="Collapsed body content."
                footer="Footer row"
                defaultCollapsed
              />
              <CardVariant
                title="totally collapsed • static (header only)"
                content="Collapsed body content."
                defaultCollapsed
              />
              <CardVariant
                title="expanded • draggable (auto grip)"
                subtitle="Subtitle row"
                content="Drag anywhere on the title bar."
                footer="Footer row"
                draggable
              />
              <CardVariant
                title="expanded • draggable (auto fallback, narrow width)"
                subtitle="Subtitle row"
                content="Long title + narrow width forces non-overlap fallback."
                footer="Footer row"
                draggable
                headerText="CarmaCard very long title for fallback"
                panelWidth={300}
              />
            </section>
            <section style={sectionStyle}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#334155",
                }}
              >
                CarmaResponsiveInfoBox
              </h2>
              <InfoBoxVariant
                title="expanded • static"
                subtitle="ResponsiveInfoBox"
                content="Uses CarmaCard internally."
                footer="Footer row"
              />
              <InfoBoxVariant
                title="collapsed • static (subtitle/footer visible)"
                subtitle="ResponsiveInfoBox"
                content="Collapsed body content."
                footer="Footer row"
                defaultCollapsed
              />
              <InfoBoxVariant
                title="totally collapsed • static (header only)"
                content="Collapsed body content."
                defaultCollapsed
              />
              <InfoBoxVariant
                title="expanded • draggable (auto grip)"
                subtitle="ResponsiveInfoBox"
                content="Drag anywhere on the title bar."
                footer="Footer row"
                draggable
              />
              <InfoBoxVariant
                title="expanded • draggable (auto fallback, narrow width)"
                subtitle="ResponsiveInfoBox"
                content="Long title + narrow width forces non-overlap fallback."
                footer="Footer row"
                draggable
                headerText="InfoBox very long title for fallback"
                panelWidth={300}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

const meta: Meta = {
  title: "Common/UI",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const CarmaCardAndInfoBox: StoryObj = {
  name: "Carma Card + InfoBox",
  render: () => <Showcase />,
};
