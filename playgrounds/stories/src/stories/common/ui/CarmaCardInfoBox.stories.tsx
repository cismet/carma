import { useState, type CSSProperties } from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { typographyDefaults } from "@carma-mapping/annotations/runtime";
import { annotationInfoBoxVisualDefaults } from "@carma-mapping/annotations/ui";

import {
  CarmaCard,
  CarmaResponsiveInfoBox,
} from "@carma-commons/ui/components";
import { CenteredStoryFrame } from "./centered-story-frame";
import {
  STORY_MASONRY_BACKGROUND_MODES,
  STORY_MASONRY_PAGE_STYLE,
  StoryMasonrySection,
  buildStoryMasonryGridStyle,
  buildStoryMasonryPanelStyle,
  readStoryMasonryBackground,
  readStoryMasonryBackgroundStyle,
} from "./story-masonry-layout";

const infoBoxHeaderTextStyle: CSSProperties = {
  color: "rgba(255, 255, 255, 0.8)",
  fontFamily: typographyDefaults.fontFamily,
  fontSize: typographyDefaults.supportFontSizePx,
  fontWeight: typographyDefaults.headingFontWeight,
  letterSpacing: "0.03em",
};

const infoBoxSupportTextStyle: CSSProperties = {
  fontFamily: typographyDefaults.fontFamily,
  fontSize: typographyDefaults.supportFontSizePx,
  fontWeight: typographyDefaults.sectionTitleFontWeight,
  lineHeight: 1.35,
  color: "rgba(17, 24, 39, 0.5)",
};

const infoBoxBodyTextStyle: CSSProperties = {
  fontFamily: typographyDefaults.fontFamily,
  fontSize: typographyDefaults.rootFontSizePx,
  lineHeight: 1.4,
  color: "#212529",
};

const surfaceStyle: CSSProperties = buildStoryMasonryPanelStyle({
  padding: 12,
  gap: 8,
});

const sectionStackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const showcaseGridStyle = buildStoryMasonryGridStyle({
  columnWidthPx: 420,
  gapPx: 16,
  maxWidthPx: 1320,
});

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
  panelWidth = annotationInfoBoxVisualDefaults.defaultPixelWidth,
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
          header={<span style={infoBoxHeaderTextStyle}>{headerText}</span>}
          headerColor={annotationInfoBoxVisualDefaults.headingColor}
          subtitle={
            subtitle ? (
              <div style={infoBoxSupportTextStyle}>{subtitle}</div>
            ) : undefined
          }
          content={<div style={infoBoxBodyTextStyle}>{content}</div>}
          footer={
            footer ? (
              <div style={infoBoxSupportTextStyle}>{footer}</div>
            ) : undefined
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
  panelWidth = annotationInfoBoxVisualDefaults.defaultPixelWidth,
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
        width={panelWidth}
        useControlLayout={false}
        draggable={draggable}
        dragGripPlacement={dragGripPlacement}
        defaultCollapsed={defaultCollapsed}
        collapsible
        heading={<span style={infoBoxHeaderTextStyle}>{headerText}</span>}
        headingColor={annotationInfoBoxVisualDefaults.headingColor}
        subtitle={
          subtitle ? (
            <div style={infoBoxSupportTextStyle}>{subtitle}</div>
          ) : undefined
        }
        content={<div style={infoBoxBodyTextStyle}>{content}</div>}
        footer={
          footer ? (
            <div style={infoBoxSupportTextStyle}>{footer}</div>
          ) : undefined
        }
      />
    </div>
  </div>
);

const Showcase = () => {
  return (
    <CenteredStoryFrame
      label="carma card and infobox"
      values={[
        "checkerboard backdrop",
        "frosted masonry sections",
        "drag handled by card header grips",
      ]}
      contentStyle={STORY_MASONRY_PAGE_STYLE}
      background={readStoryMasonryBackground(
        STORY_MASONRY_BACKGROUND_MODES.CHECKERBOARD
      )}
      backgroundStyle={readStoryMasonryBackgroundStyle(
        STORY_MASONRY_BACKGROUND_MODES.CHECKERBOARD
      )}
    >
      <div style={showcaseGridStyle}>
        <StoryMasonrySection
          title="CarmaCard"
          meta="Dieselbe checkerboard-basierte Masonry-Hülle wie in den Label-Stories, mit den bestehenden Drag-Header-Varianten im Inhalt."
        >
          <div style={sectionStackStyle}>
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
          </div>
        </StoryMasonrySection>
        <StoryMasonrySection
          title="CarmaResponsiveInfoBox"
          meta="Gleiche Masonry-Hülle, die eigentlichen Komponenten bleiben unverändert und behalten ihr bestehendes Drag-Verhalten."
        >
          <div style={sectionStackStyle}>
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
          </div>
        </StoryMasonrySection>
      </div>
    </CenteredStoryFrame>
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
