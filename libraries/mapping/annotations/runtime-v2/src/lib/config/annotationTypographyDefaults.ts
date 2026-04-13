export type AnnotationTypographyDefaults = Readonly<{
  fontFamily: string;
  remBasePx: number;
  rootFontSizeRem: string;
  rootFontSizePx: number;
  supportFontSizeRem: string;
  supportFontSizePx: number;
  headingFontSizeRem: string;
  headingFontSizePx: number;
  lineLabelFontWeight: number;
  badgeFontWeight: number;
  headingFontWeight: number;
  sectionTitleFontWeight: number;
}>;

const ANNOTATION_TYPOGRAPHY_REM_BASE_PX = 14;

const formatRem = (px: number, basePx = ANNOTATION_TYPOGRAPHY_REM_BASE_PX) =>
  `${Number.parseFloat((px / basePx).toFixed(4))}rem`;

const parseRemToPx = (
  rem: string,
  basePx = ANNOTATION_TYPOGRAPHY_REM_BASE_PX
): number => {
  const parsedRem = Number.parseFloat(rem);
  return Number.isFinite(parsedRem) ? parsedRem * basePx : basePx;
};

const ANNOTATION_ROOT_FONT_SIZE_REM = formatRem(14);
const ANNOTATION_SUPPORT_FONT_SIZE_REM = formatRem(12);
const ANNOTATION_HEADING_FONT_SIZE_REM = formatRem(14);

export const annotationTypographyDefaults: AnnotationTypographyDefaults =
  Object.freeze({
    fontFamily: '"Helvetica Neue", Arial, Helvetica, sans-serif',
    remBasePx: ANNOTATION_TYPOGRAPHY_REM_BASE_PX,
    rootFontSizeRem: ANNOTATION_ROOT_FONT_SIZE_REM,
    rootFontSizePx: parseRemToPx(ANNOTATION_ROOT_FONT_SIZE_REM),
    supportFontSizeRem: ANNOTATION_SUPPORT_FONT_SIZE_REM,
    supportFontSizePx: parseRemToPx(ANNOTATION_SUPPORT_FONT_SIZE_REM),
    headingFontSizeRem: ANNOTATION_HEADING_FONT_SIZE_REM,
    headingFontSizePx: parseRemToPx(ANNOTATION_HEADING_FONT_SIZE_REM),
    lineLabelFontWeight: 500,
    badgeFontWeight: 500,
    headingFontWeight: 600,
    sectionTitleFontWeight: 600,
  });
