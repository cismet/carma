import type { ReactNode } from "react";

import {
  faObjectGroup,
  faSearchLocation,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip, type TooltipProps } from "antd";

export type AnnotationToolbarTool = {
  id: string;
  label: string;
  tooltip: string;
  tooltipContent?: ReactNode;
  icon?: ReactNode;
  annotationCount?: number;
  annotationIds?: readonly string[];
  isSelectionTool?: boolean;
  separatorAfter?: boolean;
  ariaLabel?: string;
};

export type AnnotationsToolbarClassNames = {
  wrapper: string;
  toolButtonBase: string;
  toolButtonActive: string;
  toolButtonInactive: string;
  toolGroup: string;
  toolButtonShell: string;
  actionGroup: string;
  toolButtonPrimaryAction: string;
  smallActionButton: string;
  toolButtonIcon: string;
  toolButtonBadge: string;
  separator: string;
};

export type AnnotationsToolbarMetrics = {
  toolButtonWidthPx: number;
  smallActionButtonWidthPx: number;
  selectionActionButtonCount?: number;
  actionGroupWidthTransitionMs: number;
};

export type AnnotationsToolbarActionLabels = {
  selectAll: string;
  focusAll: string;
  removeAll: string;
};

export type AnnotationsToolbarProps = {
  activeToolId: string | null;
  tools: readonly AnnotationToolbarTool[];
  onToolSelect: (toolId: string) => void;
  onSelectAnnotations?: (annotationIds: readonly string[]) => void;
  onFocusAllAnnotations?: () => void;
  onRemoveAnnotations?: (annotationIds: readonly string[]) => void;
  classNames?: Partial<AnnotationsToolbarClassNames>;
  metrics?: Partial<AnnotationsToolbarMetrics>;
  actionLabels?: Partial<AnnotationsToolbarActionLabels>;
  tooltipPlacement?: TooltipProps["placement"];
  getTooltipPopupContainer?: TooltipProps["getPopupContainer"];
  showToolTypeIndicators?: boolean;
};

const DEFAULT_TOOLBAR_METRICS = {
  toolButtonWidthPx: 48,
  smallActionButtonWidthPx: 32,
  actionGroupWidthTransitionMs: 180,
} satisfies AnnotationsToolbarMetrics;

const DEFAULT_TOOLBAR_CLASS_NAMES = {
  wrapper: "w-fit max-w-full flex items-start gap-2 overflow-visible",
  toolButtonBase:
    "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 text-gray-700 button-shadow transition-colors hover:text-gray-900",
  toolButtonActive: "text-[#1677ff]",
  toolButtonInactive: "",
  toolGroup: "relative flex min-w-12 items-center overflow-visible",
  toolButtonShell: "relative overflow-visible",
  actionGroup:
    "flex h-8 min-w-12 items-center justify-start overflow-hidden rounded-[10px] bg-white text-gray-700 button-shadow transition-[width] ease-in-out",
  toolButtonPrimaryAction:
    "flex h-8 w-12 min-w-12 items-center justify-center px-2 transition-colors hover:text-gray-900",
  smallActionButton:
    "flex h-8 w-8 min-w-8 items-center justify-center rounded-[10px] text-gray-600 transition-colors hover:text-gray-900",
  toolButtonIcon:
    "inline-flex items-center justify-center text-base leading-none",
  toolButtonBadge:
    "absolute right-0 top-0 z-10 inline-flex h-5 min-w-5 translate-x-1/3 -translate-y-1/3 items-center justify-center rounded-full bg-[#4b5563] px-1 text-[12px] font-medium leading-none text-white shadow-sm",
  separator: "inline-block h-[18px] w-px bg-gray-300",
} satisfies AnnotationsToolbarClassNames;

const DEFAULT_ACTION_LABELS = {
  selectAll: "Alle Messungen auswählen",
  focusAll: "Alle Messungen fokussieren",
  removeAll: "Alle Messungen löschen",
} satisfies AnnotationsToolbarActionLabels;

export const AnnotationsToolbar = ({
  activeToolId,
  tools,
  onToolSelect,
  onSelectAnnotations,
  onFocusAllAnnotations,
  onRemoveAnnotations,
  classNames,
  metrics,
  actionLabels,
  tooltipPlacement = "top",
  getTooltipPopupContainer,
  showToolTypeIndicators = false,
}: AnnotationsToolbarProps) => {
  const toolbarClassNames = {
    ...DEFAULT_TOOLBAR_CLASS_NAMES,
    ...classNames,
  };
  const toolbarMetrics = {
    ...DEFAULT_TOOLBAR_METRICS,
    ...metrics,
  };
  const labels = {
    ...DEFAULT_ACTION_LABELS,
    ...actionLabels,
  };
  const selectionActionGroupCollapsedWidthPx = toolbarMetrics.toolButtonWidthPx;

  return (
    <div
      className={toolbarClassNames.wrapper}
      onClick={(event) => event.stopPropagation()}
    >
      {tools.map((tool) => {
        const isActive = tool.id === activeToolId;
        const annotationCount = tool.annotationCount ?? 0;
        const annotationIds = tool.annotationIds ?? [];
        const visibleSelectionActionCount = [
          onSelectAnnotations,
          onFocusAllAnnotations,
          onRemoveAnnotations,
        ].filter(Boolean).length;
        const hasToolActions =
          tool.isSelectionTool &&
          isActive &&
          annotationIds.length > 0 &&
          visibleSelectionActionCount > 0;
        const usesSelectionActionGroup = tool.isSelectionTool && isActive;
        const selectionActionButtonCount =
          toolbarMetrics.selectionActionButtonCount ??
          visibleSelectionActionCount;
        const selectionActionGroupExpandedWidthPx =
          toolbarMetrics.toolButtonWidthPx +
          toolbarMetrics.smallActionButtonWidthPx * selectionActionButtonCount;
        const actionGroupWidthPx = hasToolActions
          ? selectionActionGroupExpandedWidthPx
          : selectionActionGroupCollapsedWidthPx;
        const tooltipTitle = tool.tooltipContent ?? tool.tooltip;
        const ariaLabel = tool.ariaLabel ?? tool.tooltip;

        return (
          <div key={tool.id} className={toolbarClassNames.toolGroup}>
            <div className={toolbarClassNames.toolButtonShell}>
              {showToolTypeIndicators && annotationCount > 0 ? (
                <span className={toolbarClassNames.toolButtonBadge}>
                  {annotationCount}
                </span>
              ) : null}
              {usesSelectionActionGroup ? (
                <div
                  className={toolbarClassNames.actionGroup}
                  role={hasToolActions ? "group" : undefined}
                  aria-label={
                    hasToolActions ? `${tool.label} Aktionen` : undefined
                  }
                  style={{
                    width: actionGroupWidthPx,
                    transitionDuration: `${toolbarMetrics.actionGroupWidthTransitionMs}ms`,
                    willChange: "width",
                  }}
                >
                  <Tooltip
                    title={tooltipTitle}
                    placement={tooltipPlacement}
                    getPopupContainer={getTooltipPopupContainer}
                  >
                    <button
                      type="button"
                      onClick={() => onToolSelect(tool.id)}
                      aria-pressed={isActive}
                      aria-label={ariaLabel}
                      className={[
                        toolbarClassNames.toolButtonPrimaryAction,
                        toolbarClassNames.toolButtonActive,
                      ].join(" ")}
                    >
                      <span className={toolbarClassNames.toolButtonIcon}>
                        {tool.icon}
                      </span>
                    </button>
                  </Tooltip>
                  {hasToolActions ? (
                    <>
                      {onSelectAnnotations ? (
                        <Tooltip title={labels.selectAll} placement="bottom">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectAnnotations(annotationIds);
                            }}
                            aria-label={labels.selectAll}
                            className={toolbarClassNames.smallActionButton}
                          >
                            <FontAwesomeIcon
                              icon={faObjectGroup}
                              className={toolbarClassNames.toolButtonIcon}
                            />
                          </button>
                        </Tooltip>
                      ) : null}
                      {onFocusAllAnnotations ? (
                        <Tooltip title={labels.focusAll} placement="bottom">
                          <button
                            type="button"
                            onClick={onFocusAllAnnotations}
                            aria-label={labels.focusAll}
                            className={toolbarClassNames.smallActionButton}
                          >
                            <FontAwesomeIcon
                              icon={faSearchLocation}
                              className={toolbarClassNames.toolButtonIcon}
                            />
                          </button>
                        </Tooltip>
                      ) : null}
                      {onRemoveAnnotations ? (
                        <Tooltip title={labels.removeAll} placement="bottom">
                          <button
                            type="button"
                            onClick={() => {
                              onRemoveAnnotations(annotationIds);
                            }}
                            aria-label={labels.removeAll}
                            className={toolbarClassNames.smallActionButton}
                          >
                            <FontAwesomeIcon
                              icon={faTrashCan}
                              className={toolbarClassNames.toolButtonIcon}
                            />
                          </button>
                        </Tooltip>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : (
                <Tooltip
                  title={tooltipTitle}
                  placement={tooltipPlacement}
                  getPopupContainer={getTooltipPopupContainer}
                >
                  <button
                    type="button"
                    onClick={() => onToolSelect(tool.id)}
                    aria-pressed={isActive}
                    aria-label={ariaLabel}
                    className={[
                      toolbarClassNames.toolButtonBase,
                      isActive
                        ? toolbarClassNames.toolButtonActive
                        : toolbarClassNames.toolButtonInactive,
                    ].join(" ")}
                  >
                    <span className={toolbarClassNames.toolButtonIcon}>
                      {tool.icon}
                    </span>
                  </button>
                </Tooltip>
              )}
            </div>
            {tool.separatorAfter ? (
              <span
                className={toolbarClassNames.separator}
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
