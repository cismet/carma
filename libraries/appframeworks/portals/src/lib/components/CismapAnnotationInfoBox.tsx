import type { CSSProperties, ReactNode } from "react";

import Icon from "react-cismap/commons/Icon";

import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
  annotationInfoBoxVisualDefaults,
  type AnnotationInfoBoxActionIconRenderProps,
  type AnnotationInfoBoxLayoutProps,
  type AnnotationInfoBoxSlots,
  type AnnotationInfoBoxVisualOptions,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import { ResponsiveInfoBox } from "./ResponsiveInfoBox";

const ANNOTATION_POINTER_QUERY_PRESERVE_ATTRIBUTE =
  "data-carma-pointer-query-preserve";
const ANNOTATION_POINTER_QUERY_PRESERVE_ATTRIBUTES = {
  [ANNOTATION_POINTER_QUERY_PRESERVE_ATTRIBUTE]: "true",
};

const renderCismapAnnotationActionIcon = ({
  actionId,
  className,
  style,
  dataTestId,
  ariaLabel,
}: AnnotationInfoBoxActionIconRenderProps) => {
  if (actionId !== ANNOTATION_INFO_BOX_ACTION_IDS.FLY_TO) {
    return null;
  }

  return (
    <Icon
      name="search-location"
      className={className}
      style={style}
      data-test-id={dataTestId}
      aria-label={ariaLabel}
    />
  );
};

const CISMAP_ANNOTATION_INFO_BOX_ACTION_VISUAL_OPTIONS = {
  hiddenActionIds: [
    ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT,
    ANNOTATION_INFO_BOX_ACTION_IDS.VISIBILITY,
    ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE,
    ANNOTATION_INFO_BOX_ACTION_IDS.LOCK,
  ],
  renderActionIcon: renderCismapAnnotationActionIcon,
} satisfies Pick<
  AnnotationInfoBoxVisualOptions,
  "hiddenActionIds" | "renderActionIcon"
>;

export const CISMAP_ANNOTATION_INFO_BOX_GENERIC_VISUAL_OPTIONS = {
  ...annotationInfoBoxVisualDefaults,
  ...CISMAP_ANNOTATION_INFO_BOX_ACTION_VISUAL_OPTIONS,
} satisfies AnnotationInfoBoxVisualOptions;

export const CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS = {
  ...CISMAP_ANNOTATION_INFO_BOX_ACTION_VISUAL_OPTIONS,
  bodyPanelStyle: {
    minHeight: "20px",
    padding: "0px 0px 0px 0.5625rem",
    marginBottom: "0px",
    backgroundColor: "#f5f5f5",
    border: "1px solid #e3e3e3",
    borderRadius: "4px",
    boxShadow: "rgba(0, 0, 0, 0.05) 0px 1px 1px inset",
    pointerEvents: "auto",
  },
  subtitleContainerClassName: "mb-0 w-full pt-0",
  subtitleTextStyle: {
    color: "#212529",
  },
  subtitleTextClassName: "text-[12px] font-normal leading-normal",
  subtitleMetaTextStyle: {
    color: "#212529",
  },
  subtitleMetaTextClassName:
    "mt-0 whitespace-nowrap text-[12px] font-normal leading-normal",
  bodyContainerClassName: "pb-2 pt-0",
  bodyTextStyle: {
    color: "#212529",
    fontSize: "12px",
    fontWeight: 400,
    lineHeight: "normal",
  },
  bodyTextClassName: "text-[12px] font-normal leading-normal text-[#212529]",
  mutedTextClassName: "text-[#808080]",
  linkTextClassName: "text-[#0078a8]",
  actionIconColor: "#808080",
  actionIconHoverColor: "#a0a0a0",
  titleTextStyle: {
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1.5,
  },
  titleTextClassName: "text-[14px] font-bold leading-normal text-[#212529]",
  titleInputClassName:
    "min-w-0 w-auto max-w-full appearance-none [field-sizing:content] break-words border-0 bg-transparent px-0 py-0 text-[14px] font-bold leading-normal text-[#212529] placeholder:text-[#212529] focus:outline-none focus:ring-0",
  shortLabelInputClassName:
    "shrink-0 w-auto appearance-none [field-sizing:content] border-[0.0357rem] px-[0.5ex] py-0 text-center tabular-nums border-[#d1d5db] bg-white/85 text-[#111827]/80 placeholder:text-[#111827]/80 focus:bg-[#fef3c7] focus:outline focus:outline-2 focus:outline-[#1677ff] text-[1rem] font-semibold leading-normal",
  navigationInstructionContainerClassName:
    "flex w-full items-center justify-center text-[12px]",
  navigationAvailabilityContainerClassName:
    "mt-1 flex w-[96%] items-center justify-center pt-1 text-[12px]",
  navigationSummaryContainerClassName:
    "mb-2 mt-1 flex w-[96%] items-center justify-between text-[12px]",
  navigationLinkFontSize: "10.5px",
  navigationControlLabels: {
    previous: "<<",
    next: ">>",
  },
} satisfies Partial<AnnotationInfoBoxVisualOptions>;

export type CismapAnnotationInfoBoxProps = Pick<
  AnnotationInfoBoxLayoutProps,
  "controlOrder" | "pixelWidth" | "visualOptions"
> & {
  slots: AnnotationInfoBoxSlots;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  headerTitle?: ReactNode;
  instructionContent?: ReactNode;
  secondaryInfoBoxElements?: ReactNode[];
};

const CismapAnnotationInstructionSlot = ({
  content,
  style,
}: {
  content: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    className="relative w-full rounded bg-white px-3 py-2 text-[#212529] shadow-sm"
    data-test-id="annotation-instruction-slot"
    style={style}
    {...ANNOTATION_POINTER_QUERY_PRESERVE_ATTRIBUTES}
  >
    <div className="min-w-0">{content}</div>
  </div>
);

const renderCismapInfoBoxHeader = ({
  backgroundColor,
  headerStyle,
  textColor,
  title,
}: {
  backgroundColor?: string;
  headerStyle?: CSSProperties;
  textColor?: string;
  title: ReactNode;
}) => (
  <div
    className="w-full"
    style={{
      backgroundColor,
      ...headerStyle,
      ...(textColor ? { color: textColor } : {}),
    }}
  >
    {title}
  </div>
);

export const CismapAnnotationInfoBox = ({
  pixelWidth,
  slots,
  visualOptions,
  headerBackgroundColor,
  headerTextColor,
  headerTitle = "Messungen",
  instructionContent,
  controlOrder,
  secondaryInfoBoxElements = [],
}: CismapAnnotationInfoBoxProps) => {
  const resolvedVisualOptions = resolveAnnotationInfoBoxVisualOptions({
    ...CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
    ...visualOptions,
  });
  const resolvedInfoBoxPixelWidth =
    pixelWidth ?? resolvedVisualOptions.defaultPixelWidth;
  const stackedInstructionMaxWidth =
    typeof window !== "undefined" &&
    window.innerWidth - 25 - resolvedInfoBoxPixelWidth - 300 <= 0
      ? window.innerWidth - 25
      : resolvedInfoBoxPixelWidth;
  const headingTitle = slots.headingTitle?.trim() ?? "";
  const resolvedSecondaryInfoBoxElements = instructionContent
    ? [
        <CismapAnnotationInstructionSlot
          key="annotation-instruction-slot"
          content={instructionContent}
          style={{
            marginBottom: 12,
            maxWidth: stackedInstructionMaxWidth,
            minWidth: stackedInstructionMaxWidth,
            width: stackedInstructionMaxWidth,
          }}
        />,
        ...secondaryInfoBoxElements,
      ]
    : secondaryInfoBoxElements;
  const resolvedHeaderBackgroundColor =
    headerBackgroundColor ??
    slots.headingColor ??
    resolvedVisualOptions.headingColor;

  return (
    <div data-test-id="annotation-info-box">
      <ResponsiveInfoBox
        pixelwidth={resolvedInfoBoxPixelWidth}
        panelClick={(event) => event.stopPropagation()}
        header={renderCismapInfoBoxHeader({
          backgroundColor: resolvedHeaderBackgroundColor,
          headerStyle: resolvedVisualOptions.headerStyle,
          textColor: headerTextColor,
          title: headerTitle,
        })}
        alwaysVisibleDiv={
          <div className="mb-2 mt-2 w-[96%]">
            {slots.subtitle ?? (
              <span className="text-base font-semibold">{headingTitle}</span>
            )}
          </div>
        }
        collapsibleDiv={
          <div>
            {slots.content}
            {slots.footer}
          </div>
        }
        collapsibleStyle={resolvedVisualOptions.bodyPanelStyle}
        isCollapsible={slots.collapsible ?? true}
        fixedRow={true}
        controlOrder={controlOrder}
        secondaryInfoBoxElements={resolvedSecondaryInfoBoxElements}
      />
    </div>
  );
};

export type CismapAnnotationInstructionInfoBoxProps = {
  content: ReactNode;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  headerTitle?: ReactNode;
  pixelWidth?: number;
  controlOrder?: number;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
  secondaryInfoBoxElements?: ReactNode[];
};

export const CismapAnnotationInstructionInfoBox = ({
  content,
  headerBackgroundColor,
  headerTextColor,
  headerTitle,
  pixelWidth = 350,
  controlOrder,
  visualOptions,
  secondaryInfoBoxElements = [],
}: CismapAnnotationInstructionInfoBoxProps) => {
  const resolvedVisualOptions = resolveAnnotationInfoBoxVisualOptions({
    ...CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
    ...visualOptions,
  });
  // Keep the instruction inset on the sides and at the top. The surrounding
  // body already provides the bottom panel inset.
  const contentClassName =
    "mt-0 w-[94%] pl-2 pr-0 pt-1 text-xs font-normal leading-normal text-[#212529] [&_*]:font-normal";
  const hasHeaderTitle =
    headerTitle !== undefined && headerTitle !== null && headerTitle !== false;
  const instructionContentElement = (
    <div className={contentClassName} data-test-id="empty-annotation-info">
      {content}
    </div>
  );
  const resolvedHeaderBackgroundColor =
    headerBackgroundColor ?? resolvedVisualOptions.headingColor;

  return (
    <div data-test-id="annotation-info-box">
      <ResponsiveInfoBox
        pixelwidth={pixelWidth}
        infoBoxDataAttributes={ANNOTATION_POINTER_QUERY_PRESERVE_ATTRIBUTES}
        panelClick={(event) => event.stopPropagation()}
        header={
          hasHeaderTitle
            ? renderCismapInfoBoxHeader({
                backgroundColor: resolvedHeaderBackgroundColor,
                headerStyle: resolvedVisualOptions.headerStyle,
                textColor: headerTextColor,
                title: headerTitle,
              })
            : ""
        }
        isCollapsible={false}
        alwaysVisibleDiv={instructionContentElement}
        collapsibleDiv={<div />}
        collapsibleStyle={resolvedVisualOptions.bodyPanelStyle}
        fixedRow={false}
        controlOrder={controlOrder}
        secondaryInfoBoxElements={secondaryInfoBoxElements}
      />
    </div>
  );
};
