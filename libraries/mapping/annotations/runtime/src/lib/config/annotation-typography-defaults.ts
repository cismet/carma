import { annotationTypographyTokens } from "@carma-mapping/annotations/core";

export type TypographyDefaults = Readonly<{
  fontFamily: string;
  rootFontSizeRem: string;
  supportFontSizeRem: string;
  headingFontSizeRem: string;
  lineLabelFontWeight: number;
  badgeFontWeight: number;
  headingFontWeight: number;
  sectionTitleFontWeight: number;
}>;

const annotationTypographyRootFontSizePx =
  annotationTypographyTokens.fontSizePx.pointLabel;

const formatRelativeRem = (fontSizePx: number): string =>
  `${fontSizePx / annotationTypographyRootFontSizePx}rem`;

export const typographyDefaults: TypographyDefaults =
  Object.freeze({
    fontFamily: annotationTypographyTokens.fontFamily,
    rootFontSizeRem: "1rem",
    supportFontSizeRem: formatRelativeRem(
      annotationTypographyTokens.fontSizePx.supportText
    ),
    headingFontSizeRem: "1rem",
    lineLabelFontWeight: annotationTypographyTokens.fontWeight.medium,
    badgeFontWeight: annotationTypographyTokens.fontWeight.medium,
    headingFontWeight: annotationTypographyTokens.fontWeight.semibold,
    sectionTitleFontWeight: annotationTypographyTokens.fontWeight.semibold,
  });
