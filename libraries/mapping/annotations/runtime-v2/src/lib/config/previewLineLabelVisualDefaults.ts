import { annotationTypographyDefaults } from "./annotationTypographyDefaults";

export const PREVIEW_LINE_LABEL_BACKGROUND_STYLE = {
  SOFT_RECT_FADE: "soft-rect-fade",
  TEXT_ECHO_DARKEN: "text-echo-darken",
} as const;

export const PREVIEW_LINE_LABEL_THEME = {
  DARK_ON_BRIGHT: "dark-on-bright",
  BRIGHT_ON_DARK: "bright-on-dark",
} as const;

export type PreviewLineLabelBackgroundStyle =
  (typeof PREVIEW_LINE_LABEL_BACKGROUND_STYLE)[keyof typeof PREVIEW_LINE_LABEL_BACKGROUND_STYLE];
export type PreviewLineLabelTheme =
  (typeof PREVIEW_LINE_LABEL_THEME)[keyof typeof PREVIEW_LINE_LABEL_THEME];

export type PreviewLineLabelVisualOptions = Readonly<{
  fontFamily: string;
  fontWeight: string | number;
  backgroundStyle: PreviewLineLabelBackgroundStyle;
  theme: PreviewLineLabelTheme;
  shortEdgeOffsetPx: number;
  showBackdrop?: boolean;
  textColor?: string;
  textBlendMode?: string;
  backdropBackgroundColor?: string;
  backdropBlendMode?: string;
  surfaceBlendMode?: string;
  textEchoColor?: string;
  textEchoBlurPx?: number;
  textEchoOpacity?: number;
  textEchoBlendMode?: string;
  backdropBlurPx?: number;
  backdropBrightnessPct?: number;
  backdropSaturatePct?: number;
  backdropSurfaceAlpha?: number;
  backdropRadiusEx?: number;
  backdropEdgeBlurPx?: number;
  backdropInsetBlockEx?: number;
  backdropInsetInlineEx?: number;
  framePaddingBlockEx?: number;
  framePaddingInlineEx?: number;
}>;

export const previewLineLabelVisualDefaults: PreviewLineLabelVisualOptions =
  Object.freeze({
    fontFamily: annotationTypographyDefaults.fontFamily,
    fontWeight: annotationTypographyDefaults.lineLabelFontWeight,
    backgroundStyle: PREVIEW_LINE_LABEL_BACKGROUND_STYLE.SOFT_RECT_FADE,
    theme: PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK,
    shortEdgeOffsetPx: -2,
  });

export const resolvePreviewLineLabelVisualOptions = (
  visualOptions?: Partial<PreviewLineLabelVisualOptions>
): PreviewLineLabelVisualOptions => ({
  ...previewLineLabelVisualDefaults,
  ...visualOptions,
});
