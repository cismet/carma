import { useEffect, useState, type ReactNode } from "react";

import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  instructionSlotClosable?: boolean;
  instructionSlotInitiallyCollapsed?: boolean;
  instructionSlotStorageKey?: string;
  secondaryInfoBoxElements?: ReactNode[];
};

const readStoredInstructionSlotCollapsed = (
  storageKey: string | undefined,
  fallback: boolean
): boolean => {
  if (!storageKey || typeof window === "undefined") {
    return fallback;
  }

  const storedValue = window.localStorage.getItem(storageKey);
  if (storedValue === "collapsed") {
    return true;
  }
  if (storedValue === "expanded") {
    return false;
  }

  return fallback;
};

const writeStoredInstructionSlotCollapsed = (
  storageKey: string | undefined,
  collapsed: boolean
) => {
  if (!storageKey || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, collapsed ? "collapsed" : "expanded");
};

const useStoredInstructionSlotCollapsed = (
  storageKey: string | undefined,
  initiallyCollapsed: boolean
) => {
  const [collapsed, setCollapsed] = useState(() =>
    readStoredInstructionSlotCollapsed(storageKey, initiallyCollapsed)
  );

  useEffect(() => {
    setCollapsed(
      readStoredInstructionSlotCollapsed(storageKey, initiallyCollapsed)
    );
  }, [initiallyCollapsed, storageKey]);

  const updateCollapsed = (nextCollapsed: boolean) => {
    setCollapsed(nextCollapsed);
    writeStoredInstructionSlotCollapsed(storageKey, nextCollapsed);
  };

  return { collapsed, updateCollapsed };
};

const CismapAnnotationInstructionOpenButton = ({
  onClick,
}: {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) => (
  <button
    type="button"
    className="flex h-[32px] w-[32px] items-center justify-center rounded-full border-0 bg-white p-0 text-xl text-[#212529] shadow-sm transition-none hover:bg-white focus:bg-white"
    aria-label="Hinweise anzeigen"
    title="Hinweise anzeigen"
    onClick={onClick}
    data-test-id="annotation-instruction-slot-open"
  >
    <FontAwesomeIcon icon={faCircleQuestion} className="h-[24px] w-[24px]" />
  </button>
);

const CismapAnnotationInstructionSlot = ({
  collapsed: controlledCollapsed,
  closable = false,
  content,
  initiallyCollapsed = false,
  onCollapsedChange,
  storageKey,
}: {
  collapsed?: boolean;
  closable?: boolean;
  content: ReactNode;
  initiallyCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  storageKey?: string;
}) => {
  const { collapsed: storedCollapsed, updateCollapsed: updateStoredCollapsed } =
    useStoredInstructionSlotCollapsed(storageKey, initiallyCollapsed);
  const collapsed = controlledCollapsed ?? storedCollapsed;

  const updateCollapsed = (nextCollapsed: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(nextCollapsed);
      return;
    }
    updateStoredCollapsed(nextCollapsed);
  };

  if (collapsed) {
    return (
      <div className="mb-1 flex justify-end">
        <CismapAnnotationInstructionOpenButton
          onClick={(event) => {
            event.stopPropagation();
            updateCollapsed(false);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="relative"
      data-test-id="annotation-instruction-slot"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="min-w-0">{content}</div>
      {closable ? (
        <button
          type="button"
          className="absolute right-0 top-0 border-0 bg-transparent px-1 py-0 text-base leading-none text-[#212529]"
          aria-label="Hinweise ausblenden"
          title="Hinweise ausblenden"
          onClick={(event) => {
            event.stopPropagation();
            updateCollapsed(true);
          }}
          data-test-id="annotation-instruction-slot-close"
        >
          x
        </button>
      ) : null}
    </div>
  );
};

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
  instructionSlotClosable = false,
  instructionSlotInitiallyCollapsed = false,
  instructionSlotStorageKey,
  controlOrder,
  secondaryInfoBoxElements = [],
}: CismapAnnotationInfoBoxProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const headingTitle = slots.headingTitle?.trim() ?? "";
  const resolvedSecondaryInfoBoxElements = instructionContent
    ? [
        <CismapAnnotationInstructionSlot
          key="annotation-instruction-slot"
          closable={instructionSlotClosable}
          content={instructionContent}
          initiallyCollapsed={instructionSlotInitiallyCollapsed}
          storageKey={instructionSlotStorageKey}
        />,
        ...secondaryInfoBoxElements,
      ]
    : secondaryInfoBoxElements;

  return (
    <div data-test-id="annotation-info-box">
      <ResponsiveInfoBox
        pixelwidth={pixelWidth ?? resolvedVisualOptions.defaultPixelWidth}
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
  instructionSlotClosable?: boolean;
  instructionSlotInitiallyCollapsed?: boolean;
  instructionSlotStorageKey?: string;
  controlOrder?: number;
  secondaryInfoBoxElements?: ReactNode[];
};

export const CismapAnnotationInstructionInfoBox = ({
  content,
  pixelWidth = 350,
  instructionSlotClosable = false,
  instructionSlotInitiallyCollapsed = false,
  instructionSlotStorageKey,
  controlOrder,
  secondaryInfoBoxElements = [],
}: CismapAnnotationInstructionInfoBoxProps) => {
  const instructionControlOrder = controlOrder ?? 11;
  const { collapsed, updateCollapsed } = useStoredInstructionSlotCollapsed(
    instructionSlotStorageKey,
    instructionSlotInitiallyCollapsed
  );
  const contentClassName =
    "mt-2 w-[90%] p-2 text-xs font-normal leading-normal text-[#212529] [&_*]:font-normal";
  const instructionContentElement = (
    <div className={contentClassName} data-test-id="empty-annotation-info">
      {content}
    </div>
  );

  if (instructionSlotClosable && collapsed) {
    return (
      <div data-test-id="annotation-info-box">
        <Control position="bottomright" order={instructionControlOrder}>
          <div
            style={{
              opacity: 0.9,
              pointerEvents: "auto",
            }}
          >
            <CismapAnnotationInstructionOpenButton
              onClick={(event) => {
                event.stopPropagation();
                updateCollapsed(false);
              }}
            />
          </div>
        </Control>
        {renderSecondaryInfoBoxElements(
          secondaryInfoBoxElements,
          instructionControlOrder
        )}
      </div>
    );
  }

  return (
    <div data-test-id="annotation-info-box">
      <ResponsiveInfoBox
        pixelwidth={pixelWidth}
        panelClick={(event) => event.stopPropagation()}
        header=""
        isCollapsible={false}
        alwaysVisibleDiv={
          instructionSlotClosable ? (
            <CismapAnnotationInstructionSlot
              closable
              collapsed={collapsed}
              content={instructionContentElement}
              initiallyCollapsed={instructionSlotInitiallyCollapsed}
              onCollapsedChange={updateCollapsed}
              storageKey={instructionSlotStorageKey}
            />
          ) : (
            instructionContentElement
          )
        }
        collapsibleDiv={<div />}
        fixedRow={false}
        controlOrder={controlOrder}
        secondaryInfoBoxElements={secondaryInfoBoxElements}
      />
    </div>
  );
};
