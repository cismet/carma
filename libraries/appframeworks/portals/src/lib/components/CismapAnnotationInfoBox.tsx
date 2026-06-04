import type {
  CSSProperties,
  ReactNode,
} from "react";

import Icon from "react-cismap/commons/Icon";

import { Control } from "@carma-mapping/map-controls-layout";
import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
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

export const CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS = {
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
  bodyContainerClassName: "pb-0 pt-0",
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
  actionIconFontSize: "16px",
  hiddenActionIds: [
    ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT,
    ANNOTATION_INFO_BOX_ACTION_IDS.VISIBILITY,
    ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE,
    ANNOTATION_INFO_BOX_ACTION_IDS.LOCK,
  ],
  renderActionIcon: renderCismapAnnotationActionIcon,
  titleTextStyle: {
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1.25,
  },
  titleTextClassName: "text-[14px] font-bold leading-[1.25] text-[#212529]",
  titleInputClassName:
    "min-w-0 w-auto max-w-full appearance-none [field-sizing:content] break-words border-0 bg-transparent px-0 py-0 text-[14px] font-bold leading-[1.25] text-[#212529] placeholder:text-[#212529] focus:outline-none focus:ring-0",
  navigationInstructionContainerClassName:
    "mt-1 flex w-full items-center justify-center text-[12px]",
  navigationAvailabilityContainerClassName:
    "flex w-[96%] items-center justify-center pt-3 text-[12px]",
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

const renderSecondaryInfoBoxElements = (
  secondaryInfoBoxElements: ReactNode[],
  controlOrder: number
) =>
  secondaryInfoBoxElements.map((element, index) => (
    <Control
      position="bottomright"
      order={controlOrder - 1 - index}
      key={"secondaryElement_" + index}
    >
      <div
        style={{
          opacity: 0.9,
          pointerEvents: "auto",
        }}
      >
        {element}
      </div>
    </Control>
  ));

export const CismapAnnotationInfoBox = ({
  pixelWidth,
  slots,
  visualOptions,
  headerTitle = "Messungen",
  instructionContent,
  controlOrder,
  secondaryInfoBoxElements = [],
}: CismapAnnotationInfoBoxProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
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

  return (
    <div data-test-id="annotation-info-box">
      <ResponsiveInfoBox
        pixelwidth={resolvedInfoBoxPixelWidth}
        panelClick={(event) => event.stopPropagation()}
        header={
          <div
            className="w-full"
            style={{
              backgroundColor:
                slots.headingColor ?? resolvedVisualOptions.headingColor,
            }}
          >
            {headerTitle}
          </div>
        }
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
  pixelWidth?: number;
  shrinkToContent?: boolean;
  controlOrder?: number;
  secondaryInfoBoxElements?: ReactNode[];
};

export const CismapAnnotationInstructionInfoBox = ({
  content,
  pixelWidth = 350,
  controlOrder,
  secondaryInfoBoxElements = [],
}: CismapAnnotationInstructionInfoBoxProps) => {
  const contentClassName =
    "mt-2 w-[90%] p-2 text-xs font-normal leading-normal text-[#212529] [&_*]:font-normal";
  const instructionContentElement = (
    <div className={contentClassName} data-test-id="empty-annotation-info">
      {content}
    </div>
  );

  return (
    <div data-test-id="annotation-info-box">
      <ResponsiveInfoBox
        pixelwidth={pixelWidth}
        infoBoxDataAttributes={ANNOTATION_POINTER_QUERY_PRESERVE_ATTRIBUTES}
        panelClick={(event) => event.stopPropagation()}
        header=""
        isCollapsible={false}
        alwaysVisibleDiv={instructionContentElement}
        collapsibleDiv={<div />}
        fixedRow={false}
        controlOrder={controlOrder}
        secondaryInfoBoxElements={secondaryInfoBoxElements}
      />
    </div>
  );
};
