import type { CSSProperties } from "react";

import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";
import {
  PointLabel,
  POINT_LABEL_THEME_DEFAULTS,
} from "@carma-providers/label-overlay";
import {
  ANNOTATION_LINE_LABEL_BACKGROUND_STYLE,
  ANNOTATION_THEME_STYLE,
  typographyDefaults,
  type AnnotationThemeStyle,
  type TypographyDefaults,
} from "@carma-mapping/annotations/runtime";
import { formatLengthMeters, LENGTH_UNIT_MODE } from "@carma-units";

import { CenteredStoryFrame } from "../../common/ui/centered-story-frame";
import {
  LABEL_STORY_BACKGROUND_MODES,
  readStoryBackground,
  readStoryBackgroundStyle,
} from "./LabelMarkers.story-helpers";

const ROOT_BACKGROUND_STYLE: CSSProperties = {
  background: "linear-gradient(180deg, #edf1f4 0%, #f7f8fa 38%, #eef2f4 100%)",
};

const TYPOGRAPHY_OVERLAY_BACKGROUND_MODE = LABEL_STORY_BACKGROUND_MODES.URBAN;

const GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))",
  gap: 24,
  alignItems: "start",
};

const STACK_STYLE: CSSProperties = {
  display: "grid",
  gap: 18,
};

const PANEL_STYLE: CSSProperties = {
  display: "grid",
  gap: 12,
};

const PANEL_TITLE_STYLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#52606f",
};

const OVERLAY_CANVAS_STYLE: CSSProperties = {
  position: "relative",
  minHeight: 320,
  overflow: "hidden",
  background: readStoryBackground(TYPOGRAPHY_OVERLAY_BACKGROUND_MODE),
  ...(readStoryBackgroundStyle(TYPOGRAPHY_OVERLAY_BACKGROUND_MODE) ?? {}),
  border: "1px solid rgba(148, 163, 184, 0.22)",
};

const OVERLAY_LINE_STYLE: CSSProperties = {
  position: "absolute",
  left: 24,
  right: 24,
  top: 72,
  borderTop: "1px dashed rgba(71, 85, 105, 0.38)",
};

const OVERLAY_LINE_SECONDARY_STYLE: CSSProperties = {
  position: "absolute",
  left: 28,
  right: 28,
  top: 216,
  borderTop: "1px dashed rgba(71, 85, 105, 0.28)",
};

const METRICS_GRID_STYLE: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "minmax(140px, 0.9fr) minmax(180px, 1.2fr)",
  alignItems: "center",
  background: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  padding: 16,
};

const INFOBOX_CONTENT_STYLE: CSSProperties = {
  display: "grid",
  gap: 12,
  paddingTop: 2,
};

const INFOBOX_SECTION_STYLE: CSSProperties = {
  display: "grid",
  gap: 4,
};

const LENGTH_FORMAT_OPTIONS = {
  locale: "de-DE",
  unitMode: LENGTH_UNIT_MODE.METERS,
  maximumFractionDigitsMeters: 2,
} as const;

const FORMATTED_LINE_LENGTH = formatLengthMeters(168, LENGTH_FORMAT_OPTIONS);
const FORMATTED_ELEVATION = `NHN ${formatLengthMeters(
  179.27,
  LENGTH_FORMAT_OPTIONS
)}`;
const FORMATTED_RELATIVE_HEIGHT = `${formatLengthMeters(
  24.41,
  LENGTH_FORMAT_OPTIONS
)} relative Höhe über Bezugspunkt`;
const FORMATTED_RELATIVE_HEIGHT_SHORT = `${formatLengthMeters(
  24.41,
  LENGTH_FORMAT_OPTIONS
)} über Bezugspunkt`;

type TypographyClassSample = {
  className: string;
  role: string;
  example: string;
  sizePx: number;
  weight: number;
  lineHeight: number;
  opacity: number;
};

export type AnnotationTypographyStoryArgs = {
  typography: TypographyDefaults;
  lineLabelTheme: AnnotationThemeStyle;
};

const buildTypographyStyle = ({
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  color,
}: {
  fontFamily: string;
  fontSize: number | string;
  fontWeight: number;
  lineHeight: number;
  color: string;
}): CSSProperties => ({
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  color,
});

const buildNumericTypographyStyle = ({
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  color,
}: {
  fontFamily: string;
  fontSize: number | string;
  fontWeight: number;
  lineHeight: number;
  color: string;
}): CSSProperties => ({
  ...buildTypographyStyle({
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    color,
  }),
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum"',
});

const buildTypographyClassSamples = (
  args: AnnotationTypographyStoryArgs
): readonly TypographyClassSample[] => [
  {
    className: "Heading",
    role: "Infobox heading",
    example: "Punktmessung 3",
    sizePx: args.typography.headingFontSizePx,
    weight: args.typography.headingFontWeight,
    lineHeight: 1.25,
    opacity: 1,
  },
  {
    className: "Root / Medium",
    role: "Line labels, badge text",
    example: `${FORMATTED_LINE_LENGTH} · ${FORMATTED_ELEVATION}`,
    sizePx: args.typography.rootFontSizePx,
    weight: args.typography.badgeFontWeight,
    lineHeight: 1.2,
    opacity: 1,
  },
  {
    className: "Root / Regular",
    role: "Infobox content",
    example: FORMATTED_RELATIVE_HEIGHT,
    sizePx: args.typography.rootFontSizePx,
    weight: 400,
    lineHeight: 1.4,
    opacity: 1,
  },
  {
    className: "Support / Semibold",
    role: "Header, section title",
    example: "Punktmessung · Referenzhöhe",
    sizePx: args.typography.supportFontSizePx,
    weight: args.typography.sectionTitleFontWeight,
    lineHeight: 1.35,
    opacity: 0.8,
  },
  {
    className: "Support / Subtitle",
    role: "Weight/opacity tradeoff for metadata",
    example: `51,272102°N 7,200488°O • ${FORMATTED_ELEVATION}`,
    sizePx: args.typography.supportFontSizePx,
    weight: 600,
    lineHeight: 1.35,
    opacity: 0.5,
  },
  {
    className: "Support / Regular",
    role: "Navigation, secondary UI",
    example: "3 von 20 Messungen",
    sizePx: args.typography.supportFontSizePx,
    weight: 400,
    lineHeight: 1.35,
    opacity: 1,
  },
];

const LineLabelSpecimen = ({
  text,
  fontFamily,
  fontWeight,
  fontSizePx,
  theme,
}: {
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSizePx: number;
  theme: AnnotationThemeStyle;
}) => (
  <div
    className="carma-annotation-overlay-line-label"
    data-annotation-overlay-line-label-theme={theme}
    style={
      {
        position: "absolute",
        left: "clamp(170px, 52%, 300px)",
        top: 72,
        display: "block",
        transform: "translate(-50%, -50%)",
        "--carma-annotation-overlay-line-label-font-family": fontFamily,
        "--carma-annotation-overlay-line-label-font-size": `${fontSizePx}px`,
        "--carma-annotation-overlay-line-label-font-weight": `${fontWeight}`,
      } as CSSProperties
    }
  >
    <span className="carma-annotation-overlay-line-label__frame">
      <span
        className="carma-annotation-overlay-line-label__backdrop"
        data-annotation-overlay-line-label-background-style={
          ANNOTATION_LINE_LABEL_BACKGROUND_STYLE.SOFT_RECT_FADE
        }
      />
      <span
        className="carma-annotation-overlay-line-label__text"
        style={{ fontSize: fontSizePx }}
      >
        {text}
      </span>
    </span>
  </div>
);

const TypographyClassesPanel = ({
  args,
}: {
  args: AnnotationTypographyStoryArgs;
}) => {
  const samples = buildTypographyClassSamples(args);

  return (
    <div style={PANEL_STYLE}>
      <div style={PANEL_TITLE_STYLE}>Type Classes</div>
      <div style={METRICS_GRID_STYLE}>
        {samples.flatMap((sample) => {
          const sampleStyle = buildNumericTypographyStyle({
            fontFamily: args.typography.fontFamily,
            fontSize: sample.sizePx,
            fontWeight: sample.weight,
            lineHeight: sample.lineHeight,
            color: `rgba(17, 24, 39, ${sample.opacity})`,
          });
          return [
            <div
              key={`${sample.className}-label`}
              style={{
                ...buildTypographyStyle({
                  fontFamily: args.typography.fontFamily,
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  color: "#475569",
                }),
                letterSpacing: "0.03em",
              }}
            >
              {sample.className}
            </div>,
            <div
              key={`${sample.className}-value`}
              style={{ display: "grid", gap: 2 }}
            >
              <div style={sampleStyle}>{sample.example}</div>
              <div
                style={{
                  ...buildTypographyStyle({
                    fontFamily: args.typography.fontFamily,
                    fontSize: 11,
                    fontWeight: 500,
                    lineHeight: 1.35,
                    color: "#64748b",
                  }),
                }}
              >
                {sample.role} · {sample.sizePx}px / {sample.weight} /{" "}
                {Math.round(sample.opacity * 100)}%
              </div>
            </div>,
          ];
        })}
      </div>
    </div>
  );
};

const OverlayTypographyPanel = ({
  args,
}: {
  args: AnnotationTypographyStoryArgs;
}) => (
  <div style={PANEL_STYLE}>
    <div style={PANEL_TITLE_STYLE}>Overlay Labels</div>
    <div style={OVERLAY_CANVAS_STYLE}>
      <div style={OVERLAY_LINE_STYLE} />
      <LineLabelSpecimen
        text={FORMATTED_LINE_LENGTH}
        fontFamily={args.typography.fontFamily}
        fontWeight={args.typography.lineLabelFontWeight}
        fontSizePx={args.typography.rootFontSizePx}
        theme={args.lineLabelTheme}
      />
      <div style={OVERLAY_LINE_SECONDARY_STYLE} />
      <div
        style={{
          position: "absolute",
          left: "clamp(56px, 22%, 132px)",
          top: 226,
        }}
      >
        <PointLabel
          content={FORMATTED_ELEVATION}
          badgeContent="8"
          textBackgroundColor={POINT_LABEL_THEME_DEFAULTS.textBackgroundColor}
          markerBackgroundColor="rgba(230, 231, 235, 0.94)"
          markerTextColor="#111827"
          lineColor="rgba(230, 231, 235, 0.94)"
          lineWidth={1}
          markerSize={14}
          labelAttach="left"
          labelDistance={34}
          selected={false}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: "clamp(210px, 66%, 432px)",
          top: 140,
        }}
      >
        <PointLabel
          content={FORMATTED_RELATIVE_HEIGHT_SHORT}
          badgeContent="11111"
          textBackgroundColor="rgba(255, 248, 204, 0.75)"
          markerBackgroundColor="rgba(252, 211, 77, 0.96)"
          markerTextColor="#111827"
          lineColor="rgba(252, 211, 77, 0.96)"
          lineWidth={1}
          markerSize={14}
          labelAttach="right"
          labelDistance={42}
          selected
        />
      </div>
    </div>
  </div>
);

const InfoboxTypographyPanel = ({
  args,
}: {
  args: AnnotationTypographyStoryArgs;
}) => {
  const headerStyle = buildTypographyStyle({
    fontFamily: args.typography.fontFamily,
    fontSize: args.typography.supportFontSizePx,
    fontWeight: args.typography.sectionTitleFontWeight,
    lineHeight: 1.2,
    color: "rgba(255, 255, 255, 0.8)",
  });
  const headingStyle = buildTypographyStyle({
    fontFamily: args.typography.fontFamily,
    fontSize: args.typography.headingFontSizeRem,
    fontWeight: args.typography.headingFontWeight,
    lineHeight: 1.25,
    color: "rgba(17, 24, 39, 0.9)",
  });
  const subtitleStyle = buildNumericTypographyStyle({
    fontFamily: args.typography.fontFamily,
    fontSize: args.typography.supportFontSizePx,
    fontWeight: 600,
    lineHeight: 1.35,
    color: "rgba(17, 24, 39, 0.5)",
  });
  const sectionTitleStyle = buildTypographyStyle({
    fontFamily: args.typography.fontFamily,
    fontSize: args.typography.supportFontSizePx,
    fontWeight: args.typography.sectionTitleFontWeight,
    lineHeight: 1.35,
    color: "rgba(71, 85, 105, 0.8)",
  });
  const bodyStyle = buildNumericTypographyStyle({
    fontFamily: args.typography.fontFamily,
    fontSize: args.typography.rootFontSizeRem,
    fontWeight: 400,
    lineHeight: 1.4,
    color: "#212529",
  });
  const footerStyle = buildTypographyStyle({
    fontFamily: args.typography.fontFamily,
    fontSize: args.typography.supportFontSizePx,
    fontWeight: 400,
    lineHeight: 1.35,
    color: "#6b7280",
  });

  return (
    <div style={PANEL_STYLE}>
      <div style={PANEL_TITLE_STYLE}>Info Box</div>
      <CarmaResponsiveInfoBox
        width={360}
        useControlLayout={false}
        headingColor="#4b7ed1"
        heading={<span style={headerStyle}>Punktmessung</span>}
        subtitle={<span style={subtitleStyle}>51,272102°N 7,200488°O</span>}
        content={
          <div style={INFOBOX_CONTENT_STYLE}>
            <div style={headingStyle}>Punktmessung 3</div>
            <div style={subtitleStyle}>{FORMATTED_ELEVATION}</div>
            <div style={INFOBOX_SECTION_STYLE}>
              <div style={sectionTitleStyle}>Referenzhöhe</div>
              <div style={bodyStyle}>{FORMATTED_RELATIVE_HEIGHT}</div>
            </div>
          </div>
        }
        footer={<span style={footerStyle}>3 von 20 Messungen</span>}
      />
    </div>
  );
};

export const ANNOTATION_TYPOGRAPHY_ARGS: AnnotationTypographyStoryArgs = {
  typography: { ...typographyDefaults },
  lineLabelTheme: ANNOTATION_THEME_STYLE.BRIGHT_ON_DARK,
};

export const ANNOTATION_TYPOGRAPHY_ARG_TYPES = {
  typography: { control: "object" },
  lineLabelTheme: {
    control: "inline-radio",
    options: Object.values(ANNOTATION_THEME_STYLE),
  },
} as const;

export const AnnotationTypographyStory = (
  args: AnnotationTypographyStoryArgs
) => (
  <CenteredStoryFrame
    label="typography"
    values={[
      `${args.typography.rootFontSizePx}px root`,
      `${args.typography.headingFontSizePx}px heading`,
      `${args.typography.supportFontSizePx}px support`,
      args.typography.fontFamily,
    ]}
    background="#eef2f7"
    backgroundStyle={ROOT_BACKGROUND_STYLE}
    maxWidthPx={1400}
  >
    <div style={STACK_STYLE}>
      <TypographyClassesPanel args={args} />
      <div style={GRID_STYLE}>
        <OverlayTypographyPanel args={args} />
        <InfoboxTypographyPanel args={args} />
      </div>
    </div>
  </CenteredStoryFrame>
);
