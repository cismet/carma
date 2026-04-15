export type AnnotationTypographyDefaults = Readonly<{
  fontFamily: string;
  rootFontSizeRem: string;
  supportFontSizeRem: string;
  headingFontSizeRem: string;
  lineLabelFontWeight: number;
  badgeFontWeight: number;
  headingFontWeight: number;
  sectionTitleFontWeight: number;
}>;

export const annotationTypographyDefaults: AnnotationTypographyDefaults =
  Object.freeze({
    fontFamily: '"Helvetica Neue", Arial, Helvetica, sans-serif',
    rootFontSizeRem: "1rem",
    supportFontSizeRem: "0.8571rem", // 12 / 14
    headingFontSizeRem: "1rem",
    lineLabelFontWeight: 500,
    badgeFontWeight: 500,
    headingFontWeight: 600,
    sectionTitleFontWeight: 600,
  });
