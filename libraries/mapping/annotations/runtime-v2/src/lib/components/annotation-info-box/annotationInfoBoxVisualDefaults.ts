import { annotationTypographyDefaults } from "../../config/annotationTypographyDefaults";

export type RuntimeAnnotationInfoBoxVisualOptions = Readonly<{
  defaultPixelWidth: number;
  headingColor: string;
  headerForegroundClassName: string;
  headerTitleClassName: string;
  subtitleContainerClassName: string;
  subtitleTextClassName: string;
  subtitleMetaTextClassName: string;
  bodyContainerClassName: string;
  bodyTextClassName: string;
  mutedTextClassName: string;
  linkTextClassName: string;
  actionIconClassName: string;
  fieldTextClassName: string;
  fieldBorderClassName: string;
  fieldInputBorderClassName: string;
  fieldFocusBackgroundClassName: string;
  fieldFocusOutlineClassName: string;
  subtleFieldBackgroundClassName: string;
  titleInputClassName: string;
  shortLabelInputClassName: string;
  navigationInstructionContainerClassName: string;
  navigationAvailabilityContainerClassName: string;
  navigationSummaryContainerClassName: string;
  navigationLinkFontSizePx: number;
  inlineFieldButtonClassName: string;
  colorInputClassName: string;
  inlineActionButtonClassName: string;
}>;

const RUNTIME_INFO_BOX_HEADING_TYPOGRAPHY_CLASSNAME =
  `text-[${annotationTypographyDefaults.supportFontSizePx}px] font-semibold tracking-[0.03em]`;
const RUNTIME_INFO_BOX_EDITABLE_TITLE_TYPOGRAPHY_CLASSNAME =
  "text-[16px] font-semibold leading-[1.25]";

export const runtimeAnnotationInfoBoxVisualDefaults: RuntimeAnnotationInfoBoxVisualOptions =
  Object.freeze({
    defaultPixelWidth: 430,
    headingColor: "#4b7ed1",
    headerForegroundClassName: "text-white/80",
    headerTitleClassName: `truncate ${RUNTIME_INFO_BOX_HEADING_TYPOGRAPHY_CLASSNAME}`,
    subtitleContainerClassName: "mt-1 mb-0 w-full px-3",
    subtitleTextClassName:
      `px-3 text-[${annotationTypographyDefaults.supportFontSizePx}px] leading-normal font-semibold text-[#111827]/50`,
    subtitleMetaTextClassName:
      `whitespace-nowrap text-[${annotationTypographyDefaults.supportFontSizePx}px] leading-normal font-semibold text-[#111827]/50`,
    bodyContainerClassName: "px-3 pb-2 pt-1",
    bodyTextClassName:
      `text-[${annotationTypographyDefaults.rootFontSizePx}px] leading-[1.4] text-[#212529]`,
    mutedTextClassName: "text-[#6b7280]",
    linkTextClassName: "text-[#0078a8]",
    actionIconClassName: "cursor-pointer text-base text-[#7e7e7e] hover:text-[#7e7e7e]",
    fieldTextClassName: "text-[#111827]",
    fieldBorderClassName: "border-[#d1d5db]",
    fieldInputBorderClassName: "border-[#ced4da]",
    fieldFocusBackgroundClassName: "focus:bg-[#fef3c7]",
    fieldFocusOutlineClassName:
      "focus:outline focus:outline-2 focus:outline-[#1677ff]",
    subtleFieldBackgroundClassName: "bg-white/85",
    titleInputClassName:
      `min-w-0 w-auto max-w-full break-words rounded-[3px] bg-transparent text-[#111827]/80 placeholder:text-[#111827]/50 focus:bg-[#fef3c7] focus:outline focus:outline-2 focus:outline-[#1677ff] ${RUNTIME_INFO_BOX_EDITABLE_TITLE_TYPOGRAPHY_CLASSNAME}`,
    shortLabelInputClassName:
      `shrink-0 border px-[0.5ex] py-0 text-center tabular-nums border-[#d1d5db] bg-white/85 text-[#111827]/80 placeholder:text-[#111827]/80 focus:bg-[#fef3c7] focus:outline focus:outline-2 focus:outline-[#1677ff] ${RUNTIME_INFO_BOX_EDITABLE_TITLE_TYPOGRAPHY_CLASSNAME}`,
    navigationInstructionContainerClassName:
      "mt-1 flex w-full items-center justify-center px-2 pt-1",
    navigationAvailabilityContainerClassName:
      "mt-1 flex w-full items-center justify-center px-2 pt-1",
    navigationSummaryContainerClassName:
      "mb-1 mt-0 flex w-full items-center justify-between px-2",
    navigationLinkFontSizePx: annotationTypographyDefaults.supportFontSizePx,
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
