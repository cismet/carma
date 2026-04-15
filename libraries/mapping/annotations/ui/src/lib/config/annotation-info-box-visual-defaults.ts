import { COLORS_HEX } from "@carma-commons/utils";

import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";

const annotationInfoBoxTypographyDefaults = (() => {
  const rootFontSizeRem = "1rem";
  const supportFontSizeRem = "0.8571rem"; // 12 / 14
  const headingFontSizeRem = "1rem";

  return Object.freeze({
    rootFontSizeRem,
    supportFontSizeRem,
    headingFontSizeRem,
    headingFontWeight: 600,
    headingTypographyClassName: `text-[${supportFontSizeRem}] font-semibold tracking-[0.03em]`,
    titleTypographyClassName: `text-[${headingFontSizeRem}] font-semibold leading-[1.25]`,
  });
})();

const annotationInfoBoxUiDefaults = Object.freeze({
  borderRadiusRem: "0.2143rem", // 3 / 14
  hairlineBorderWidthRem: "0.0357rem", // 0.5 / 14
  panelInsetShadowYOffsetRem: "0.0714rem", // 1 / 14
  panelInsetShadowBlurRem: "0.0714rem", // 1 / 14
  panelBackdropBlurRem: "0.1429rem", // 2 / 14
});

export const annotationInfoBoxVisualDefaults: AnnotationInfoBoxVisualOptions =
  Object.freeze({
    defaultPixelWidth: 430,
    headingColor: "#4b7ed1",
    bodyPanelStyle: {
      backgroundColor: "rgba(245, 245, 245, 0.9)",
      border: `${annotationInfoBoxUiDefaults.hairlineBorderWidthRem} solid rgba(227, 227, 227, 0.9)`,
      boxShadow: `rgba(0, 0, 0, 0.02) 0 ${annotationInfoBoxUiDefaults.panelInsetShadowYOffsetRem} ${annotationInfoBoxUiDefaults.panelInsetShadowBlurRem} inset`,
      backdropFilter: `blur(${annotationInfoBoxUiDefaults.panelBackdropBlurRem})`,
      WebkitBackdropFilter: `blur(${annotationInfoBoxUiDefaults.panelBackdropBlurRem})`,
    },
    headerForegroundClassName: "text-white/80",
    headerTitleClassName: `truncate ${annotationInfoBoxTypographyDefaults.headingTypographyClassName}`,
    subtitleContainerClassName: "mb-0 w-full px-3 pt-[0.28em]",
    subtitleTextStyle: {
      color: COLORS_HEX.ACCENT_NEUTRALS,
    },
    subtitleTextClassName: `px-3 text-[${annotationInfoBoxTypographyDefaults.supportFontSizeRem}] leading-[1.1] font-semibold`,
    subtitleMetaTextStyle: {
      color: COLORS_HEX.ACCENT_NEUTRALS,
    },
    subtitleMetaTextClassName: `mt-[0.08em] whitespace-nowrap text-[${annotationInfoBoxTypographyDefaults.supportFontSizeRem}] leading-[1.1] font-semibold`,
    bodyContainerClassName: "px-3 pb-2 pt-1",
    bodyTextStyle: {
      fontSize: annotationInfoBoxTypographyDefaults.rootFontSizeRem,
      lineHeight: 1.4,
      color: "#212529",
    },
    bodyTextClassName: `text-[${annotationInfoBoxTypographyDefaults.rootFontSizeRem}] leading-[1.4] text-[#212529]`,
    mutedTextClassName: "text-[#6b7280]",
    linkTextClassName: "text-[#0078a8]",
    actionIconClassName: "transition-colors",
    actionIconColor: COLORS_HEX.ACCENT_NEUTRALS,
    actionIconHoverColor: COLORS_HEX.ACCENT_NEUTRALS_HOVER,
    actionIconFontSize: "1rem",
    fieldTextClassName: "text-[#111827]",
    fieldBorderClassName: `border-[${annotationInfoBoxUiDefaults.hairlineBorderWidthRem}] border-[#d1d5db]`,
    fieldInputBorderClassName: `border-[${annotationInfoBoxUiDefaults.hairlineBorderWidthRem}] border-[#ced4da]`,
    fieldFocusBackgroundClassName: "focus:bg-[#fef3c7]",
    fieldFocusOutlineClassName:
      "focus:outline focus:outline-2 focus:outline-[#1677ff]",
    subtleFieldBackgroundClassName: "bg-white/85",
    titleTextStyle: {
      fontSize: annotationInfoBoxTypographyDefaults.headingFontSizeRem,
      fontWeight: annotationInfoBoxTypographyDefaults.headingFontWeight,
      lineHeight: 1.25,
    },
    titleTextClassName: `text-[#111827]/80 ${annotationInfoBoxTypographyDefaults.titleTypographyClassName}`,
    titleInputClassName: `min-w-0 w-auto max-w-full appearance-none [field-sizing:content] break-words rounded-[${annotationInfoBoxUiDefaults.borderRadiusRem}] border border-transparent bg-transparent pl-0 pr-[0.35em] py-[0.05em] text-[#111827]/80 placeholder:text-[#111827]/50 focus:bg-[#fef3c7] focus:outline focus:outline-2 focus:outline-[#1677ff] ${annotationInfoBoxTypographyDefaults.titleTypographyClassName}`,
    shortLabelInputClassName: `shrink-0 w-auto appearance-none [field-sizing:content] border-[${annotationInfoBoxUiDefaults.hairlineBorderWidthRem}] px-[0.5ex] py-0 text-center tabular-nums border-[#d1d5db] bg-white/85 text-[#111827]/80 placeholder:text-[#111827]/80 focus:bg-[#fef3c7] focus:outline focus:outline-2 focus:outline-[#1677ff] ${annotationInfoBoxTypographyDefaults.titleTypographyClassName}`,
    navigationInstructionContainerClassName:
      "mt-1 flex w-full items-center justify-center px-2 pt-1",
    navigationAvailabilityContainerClassName:
      "mt-1 flex w-full items-center justify-center px-2 pt-1",
    navigationSummaryContainerClassName:
      "mb-1 mt-0 flex w-full items-center justify-between px-2",
    navigationLinkFontSize:
      annotationInfoBoxTypographyDefaults.supportFontSizeRem,
    inlineFieldButtonClassName: `inline-flex h-5 w-5 items-center justify-center rounded border-[${annotationInfoBoxUiDefaults.hairlineBorderWidthRem}] border-[#ced4da]`,
    colorInputClassName: `h-6 w-8 cursor-pointer rounded border-[${annotationInfoBoxUiDefaults.hairlineBorderWidthRem}] border-[#ced4da] bg-transparent p-0`,
    inlineActionButtonClassName: `inline-flex items-center gap-1 rounded border-[${annotationInfoBoxUiDefaults.hairlineBorderWidthRem}] border-[#ced4da] px-2 py-1`,
  });

export const resolveAnnotationInfoBoxVisualOptions = (
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>
): AnnotationInfoBoxVisualOptions => ({
  ...annotationInfoBoxVisualDefaults,
  ...visualOptions,
});
