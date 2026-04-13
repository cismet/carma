import type { CSSProperties } from "react";
import { COLORS_HEX } from "@carma-commons/utils";

import { annotationTypographyDefaults } from "../../config/annotationTypographyDefaults";

export type RuntimeAnnotationInfoBoxVisualOptions = Readonly<{
  defaultPixelWidth: number;
  headingColor: string;
  bodyPanelStyle: CSSProperties;
  headerForegroundClassName: string;
  headerTitleClassName: string;
  subtitleContainerClassName: string;
  subtitleTextStyle: CSSProperties;
  subtitleTextClassName: string;
  subtitleMetaTextStyle: CSSProperties;
  subtitleMetaTextClassName: string;
  bodyContainerClassName: string;
  bodyTextStyle: CSSProperties;
  bodyTextClassName: string;
  mutedTextClassName: string;
  linkTextClassName: string;
  actionIconClassName: string;
  actionIconColor: string;
  actionIconHoverColor: string;
  actionIconFontSize: string;
  fieldTextClassName: string;
  fieldBorderClassName: string;
  fieldInputBorderClassName: string;
  fieldFocusBackgroundClassName: string;
  fieldFocusOutlineClassName: string;
  subtleFieldBackgroundClassName: string;
  titleTextStyle: CSSProperties;
  titleTextClassName: string;
  titleInputClassName: string;
  shortLabelInputClassName: string;
  navigationInstructionContainerClassName: string;
  navigationAvailabilityContainerClassName: string;
  navigationSummaryContainerClassName: string;
  navigationLinkFontSize: string;
  inlineFieldButtonClassName: string;
  colorInputClassName: string;
  inlineActionButtonClassName: string;
}>;

const RUNTIME_INFO_BOX_HEADING_TYPOGRAPHY_CLASSNAME = `text-[${annotationTypographyDefaults.supportFontSizeRem}] font-semibold tracking-[0.03em]`;
const RUNTIME_INFO_BOX_TITLE_TYPOGRAPHY_CLASSNAME = `text-[${annotationTypographyDefaults.headingFontSizeRem}] font-semibold leading-[1.25]`;

export const runtimeAnnotationInfoBoxVisualDefaults: RuntimeAnnotationInfoBoxVisualOptions =
  Object.freeze({
    defaultPixelWidth: 430,
    headingColor: "#4b7ed1",
    bodyPanelStyle: {
      backgroundColor: "rgba(245, 245, 245, 0.9)",
      border: "1px solid rgba(227, 227, 227, 0.9)",
      boxShadow: "rgba(0, 0, 0, 0.02) 0px 1px 1px inset",
      backdropFilter: "blur(2px)",
      WebkitBackdropFilter: "blur(2px)",
    },
    headerForegroundClassName: "text-white/80",
    headerTitleClassName: `truncate ${RUNTIME_INFO_BOX_HEADING_TYPOGRAPHY_CLASSNAME}`,
    subtitleContainerClassName: "mb-0 w-full px-3 pt-[0.28em]",
    subtitleTextStyle: {
      color: COLORS_HEX.ACCENT_NEUTRALS,
    },
    subtitleTextClassName: `px-3 text-[${annotationTypographyDefaults.supportFontSizeRem}] leading-[1.1] font-semibold`,
    subtitleMetaTextStyle: {
      color: COLORS_HEX.ACCENT_NEUTRALS,
    },
    subtitleMetaTextClassName: `mt-[0.08em] whitespace-nowrap text-[${annotationTypographyDefaults.supportFontSizeRem}] leading-[1.1] font-semibold`,
    bodyContainerClassName: "px-3 pb-2 pt-1",
    bodyTextStyle: {
      fontSize: annotationTypographyDefaults.rootFontSizeRem,
      lineHeight: 1.4,
      color: "#212529",
    },
    bodyTextClassName: `text-[${annotationTypographyDefaults.rootFontSizeRem}] leading-[1.4] text-[#212529]`,
    mutedTextClassName: "text-[#6b7280]",
    linkTextClassName: "text-[#0078a8]",
    actionIconClassName: "transition-colors",
    actionIconColor: COLORS_HEX.ACCENT_NEUTRALS,
    actionIconHoverColor: COLORS_HEX.ACCENT_NEUTRALS_HOVER,
    actionIconFontSize: "1rem",
    fieldTextClassName: "text-[#111827]",
    fieldBorderClassName: "border-[#d1d5db]",
    fieldInputBorderClassName: "border-[#ced4da]",
    fieldFocusBackgroundClassName: "focus:bg-[#fef3c7]",
    fieldFocusOutlineClassName:
      "focus:outline focus:outline-2 focus:outline-[#1677ff]",
    subtleFieldBackgroundClassName: "bg-white/85",
    titleTextStyle: {
      fontSize: annotationTypographyDefaults.headingFontSizeRem,
      fontWeight: annotationTypographyDefaults.headingFontWeight,
      lineHeight: 1.25,
    },
    titleTextClassName: `text-[#111827]/80 ${RUNTIME_INFO_BOX_TITLE_TYPOGRAPHY_CLASSNAME}`,
    titleInputClassName: `min-w-0 w-auto max-w-full break-words rounded-[3px] bg-transparent text-[#111827]/80 placeholder:text-[#111827]/50 focus:bg-[#fef3c7] focus:outline focus:outline-2 focus:outline-[#1677ff] ${RUNTIME_INFO_BOX_TITLE_TYPOGRAPHY_CLASSNAME}`,
    shortLabelInputClassName: `shrink-0 border px-[0.5ex] py-0 text-center tabular-nums border-[#d1d5db] bg-white/85 text-[#111827]/80 placeholder:text-[#111827]/80 focus:bg-[#fef3c7] focus:outline focus:outline-2 focus:outline-[#1677ff] ${RUNTIME_INFO_BOX_TITLE_TYPOGRAPHY_CLASSNAME}`,
    navigationInstructionContainerClassName:
      "mt-1 flex w-full items-center justify-center px-2 pt-1",
    navigationAvailabilityContainerClassName:
      "mt-1 flex w-full items-center justify-center px-2 pt-1",
    navigationSummaryContainerClassName:
      "mb-1 mt-0 flex w-full items-center justify-between px-2",
    navigationLinkFontSize: annotationTypographyDefaults.supportFontSizeRem,
    inlineFieldButtonClassName:
      "inline-flex h-5 w-5 items-center justify-center rounded border border-[#ced4da]",
    colorInputClassName:
      "h-6 w-8 cursor-pointer rounded border border-[#ced4da] bg-transparent p-0",
    inlineActionButtonClassName:
      "inline-flex items-center gap-1 rounded border border-[#ced4da] px-2 py-1",
  });

export const resolveRuntimeAnnotationInfoBoxVisualOptions = (
  visualOptions?: Partial<RuntimeAnnotationInfoBoxVisualOptions>
): RuntimeAnnotationInfoBoxVisualOptions => ({
  ...runtimeAnnotationInfoBoxVisualDefaults,
  ...visualOptions,
});
