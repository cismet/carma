import {
  Fragment,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefCallback,
} from "react";
import { Tooltip } from "antd";
import {
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_LABEL,
} from "@carma-mapping/annotations/core";
import { resolveAnnotationToolText } from "../../../config/annotationToolText";
import { annotationTooltipProps } from "../../shared/annotationTooltip";
import { annotationToolManager as defaultAnnotationToolManager } from "../annotationToolManager";
import type { AnnotationModeToolbarProps } from "../AnnotationModeToolbar.types";
import { primaryToolbarSurfaceStyle, toolButtonStyle } from "../shared";

type AnnotationToolStripProps = Pick<
  AnnotationModeToolbarProps,
  "activeToolType" | "onToolTypeChange" | "toolCatalog"
> & {
  optionsToggleSlot?: ReactNode;
  onActiveToolAnchorChange?: (offset: number | null) => void;
};

const Divider = () => (
  <span
    style={{
      width: 1,
      height: 22,
      backgroundColor: "rgba(0, 0, 0, 0.12)",
      margin: "0 2px",
    }}
    aria-hidden="true"
  />
);

export function AnnotationToolStrip({
  activeToolType,
  onToolTypeChange,
  toolCatalog,
  optionsToggleSlot,
  onActiveToolAnchorChange,
}: AnnotationToolStripProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const {
    manager: toolManager = defaultAnnotationToolManager,
    managerContext: toolManagerContext,
  } = toolCatalog ?? {};
  const availableTools = toolManager.listTools(
    toolManagerContext ?? { modeActive: true }
  );
  const primaryTools = availableTools.filter(
    ({ id }) => id !== SELECT_TOOL_TYPE
  );
  const selectTool =
    availableTools.find(({ id }) => id === SELECT_TOOL_TYPE) ?? null;
  const isSelectionModeActive = activeToolType === SELECT_TOOL_TYPE;
  const activeToolButtonRef: RefCallback<HTMLButtonElement> = (node) => {
    activeButtonRef.current = node;
  };

  useLayoutEffect(() => {
    const stripElement = stripRef.current;
    const buttonElement = activeButtonRef.current;

    if (!stripElement || !buttonElement) {
      onActiveToolAnchorChange?.(null);
      return;
    }

    const updateAnchor = () => {
      const stripRect = stripElement.getBoundingClientRect();
      const buttonRect = buttonElement.getBoundingClientRect();
      onActiveToolAnchorChange?.(
        buttonRect.left - stripRect.left + buttonRect.width / 2
      );
    };

    updateAnchor();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(updateAnchor);
    resizeObserver.observe(stripElement);
    resizeObserver.observe(buttonElement);
    window.addEventListener("resize", updateAnchor);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateAnchor);
    };
  }, [
    activeToolType,
    availableTools,
    onActiveToolAnchorChange,
    optionsToggleSlot,
  ]);

  return (
    <div ref={stripRef} style={primaryToolbarSurfaceStyle}>
      {selectTool && (
        <>
          <Tooltip
            {...annotationTooltipProps}
            title={resolveAnnotationToolText(selectTool.i18n.tooltipKey)}
          >
            <button
              ref={isSelectionModeActive ? activeToolButtonRef : undefined}
              type="button"
              style={toolButtonStyle(isSelectionModeActive, false)}
              onClick={() => onToolTypeChange(SELECT_TOOL_TYPE)}
              aria-pressed={isSelectionModeActive}
              aria-label={resolveAnnotationToolText(selectTool.i18n.tooltipKey)}
              data-test-id="measurement-tool-select-toggle"
            >
              {selectTool.icon}
            </button>
          </Tooltip>
          <Divider />
        </>
      )}
      {primaryTools.map((tool) => {
        const tooltip = resolveAnnotationToolText(tool.i18n.tooltipKey);
        return (
          <Fragment key={tool.id}>
            {tool.id === ANNOTATION_TYPE_LABEL && <Divider />}
            <Tooltip {...annotationTooltipProps} title={tooltip}>
              <button
                ref={
                  activeToolType === tool.id ? activeToolButtonRef : undefined
                }
                type="button"
                style={toolButtonStyle(activeToolType === tool.id, false)}
                onClick={() => onToolTypeChange(tool.id)}
                aria-pressed={activeToolType === tool.id}
                aria-label={tooltip}
                data-test-id={`measurement-tool-${tool.id}`}
              >
                {tool.icon}
              </button>
            </Tooltip>
            {tool.id === ANNOTATION_TYPE_LABEL && <Divider />}
          </Fragment>
        );
      })}
      {optionsToggleSlot ? (
        <span
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {optionsToggleSlot}
        </span>
      ) : null}
    </div>
  );
}
