import { Fragment, type ReactNode } from "react";
import { Tooltip } from "antd";
import {
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_LABEL,
} from "@carma-mapping/annotations/core";
import { resolveAnnotationToolText } from "../../../config/annotationToolText";
import { annotationToolManager as defaultAnnotationToolManager } from "../annotationToolManager";
import type { AnnotationModeToolbarProps } from "../AnnotationModeToolbar.types";
import { primaryToolbarSurfaceStyle, toolButtonStyle } from "../shared";

type AnnotationToolStripProps = Pick<
  AnnotationModeToolbarProps,
  "activeToolType" | "onToolTypeChange" | "toolCatalog"
> & {
  optionsToggleSlot?: ReactNode;
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
}: AnnotationToolStripProps) {
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

  return (
    <div style={primaryToolbarSurfaceStyle}>
      {selectTool && (
        <>
          <Tooltip
            title={resolveAnnotationToolText(selectTool.i18n.tooltipKey)}
            placement="top"
          >
            <button
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
            <Tooltip title={tooltip} placement="top">
              <button
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
