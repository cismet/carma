export type AnnotationTypographyDefaults = Readonly<{
  fontFamily: string;
  rootFontSizePx: number;
  supportFontSizePx: number;
  headingFontSizePx: number;
  lineLabelFontWeight: number;
  badgeFontWeight: number;
  headingFontWeight: number;
  sectionTitleFontWeight: number;
}>;

export const annotationTypographyDefaults: AnnotationTypographyDefaults =
  Object.freeze({
    fontFamily: '"Helvetica Neue", Arial, Helvetica, sans-serif',
    rootFontSizePx: 14,
    supportFontSizePx: 12,
    headingFontSizePx: 17,
    lineLabelFontWeight: 500,
    badgeFontWeight: 500,
    headingFontWeight: 600,
    sectionTitleFontWeight: 600,
  });
