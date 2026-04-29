import type { ReactNode } from "react";

import { Tooltip, type TooltipProps } from "antd";

export type AnnotationToolbarTool = {
  id: string;
  label: string;
  tooltip: string;
  tooltipContent?: ReactNode;
  icon?: ReactNode;
  annotationCount?: number;
  disabled?: boolean;
  separatorAfter?: boolean;
  ariaLabel?: string;
};

export type AnnotationsToolbarClassNames = {
  wrapper: string;
  toolButtonBase: string;
  toolButtonActive: string;
  toolButtonInactive: string;
  toolButtonDisabled: string;
  toolGroup: string;
  toolButtonShell: string;
  toolButtonIcon: string;
  toolButtonBadge: string;
  separator: string;
};

export type AnnotationsToolbarMetrics = {
  toolButtonWidthPx: number;
};

export type AnnotationsToolbarProps = {
  activeToolId: string | null;
  tools: readonly AnnotationToolbarTool[];
  onToolSelect: (toolId: string) => void;
  classNames?: Partial<AnnotationsToolbarClassNames>;
  metrics?: Partial<AnnotationsToolbarMetrics>;
  tooltipPlacement?: TooltipProps["placement"];
  getTooltipPopupContainer?: TooltipProps["getPopupContainer"];
  showToolTypeIndicators?: boolean;
};

const DEFAULT_TOOLBAR_METRICS = {
  toolButtonWidthPx: 48,
} satisfies AnnotationsToolbarMetrics;

const DEFAULT_TOOLBAR_CLASS_NAMES = {
  wrapper: "w-fit max-w-full flex items-start gap-2 overflow-visible",
  toolButtonBase:
    "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 text-gray-700 button-shadow transition-colors hover:text-gray-900",
  toolButtonActive: "text-[#1677ff]",
  toolButtonInactive: "",
  toolButtonDisabled: "cursor-not-allowed opacity-45 hover:text-gray-700",
  toolGroup: "relative flex min-w-12 items-center overflow-visible",
  toolButtonShell: "relative overflow-visible",
  toolButtonIcon:
    "inline-flex items-center justify-center text-base leading-none",
  toolButtonBadge:
    "absolute right-0 top-0 z-10 inline-flex h-5 min-w-5 translate-x-1/3 -translate-y-1/3 items-center justify-center rounded-full bg-[#4b5563] px-1 text-[12px] font-medium leading-none text-white shadow-sm",
  separator: "inline-block h-[18px] w-px bg-gray-300",
} satisfies AnnotationsToolbarClassNames;

export const AnnotationsToolbar = ({
  activeToolId,
  tools,
  onToolSelect,
  classNames,
  metrics,
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

  return (
    <div
      className={toolbarClassNames.wrapper}
      onClick={(event) => event.stopPropagation()}
    >
      {tools.map((tool) => {
        const isActive = tool.id === activeToolId;
        const annotationCount = tool.annotationCount ?? 0;
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
                  disabled={tool.disabled}
                  className={[
                    toolbarClassNames.toolButtonBase,
                    isActive
                      ? toolbarClassNames.toolButtonActive
                      : toolbarClassNames.toolButtonInactive,
                    tool.disabled ? toolbarClassNames.toolButtonDisabled : "",
                  ].join(" ")}
                  style={{
                    width: toolbarMetrics.toolButtonWidthPx,
                  }}
                >
                  <span className={toolbarClassNames.toolButtonIcon}>
                    {tool.icon}
                  </span>
                </button>
              </Tooltip>
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
