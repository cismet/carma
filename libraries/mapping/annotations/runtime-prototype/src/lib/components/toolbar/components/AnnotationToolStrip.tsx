import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefCallback,
} from "react";
import { Tooltip } from "antd";
import {
  isManagedAnnotationKeyboardEvent,
  listAnnotationToolShortcuts,
  renderAnnotationShortcutGlyph,
  resolveAnnotationToolShortcutTarget,
  ANNOTATION_TOOL_TYPES,
} from "@carma-mapping/annotations/core";
import type { AnnotationModeToolbarProps } from "../annotation-mode-toolbar.types";
import { annotationToolManager as defaultAnnotationToolManager } from "../annotation-tool-manager";
import { primaryToolbarSurfaceStyle, toolButtonStyle } from "../shared";
import { annotationTooltipProps } from "../../shared/annotation-tooltip";
import { resolveAnnotationToolText } from "../../../config/annotation-tool-text";
const { LABEL: ANNOTATION_TYPE_LABEL, SELECT: SELECT_TOOL_TYPE } =
  ANNOTATION_TOOL_TYPES;

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

const renderShortcutBadges = (shortcuts: readonly string[]) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      whiteSpace: "nowrap",
    }}
  >
    {shortcuts.map((shortcut) => (
      <span
        key={shortcut}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1,
          color: "#f8f9fa",
        }}
      >
        {renderAnnotationShortcutGlyph(shortcut)}
      </span>
    ))}
  </span>
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
  const orderedToolTypes = availableTools.map((tool) => tool.id);
  const isSelectionModeActive = activeToolType === SELECT_TOOL_TYPE;
  const activeToolButtonRef: RefCallback<HTMLButtonElement> = (node) => {
    activeButtonRef.current = node;
  };

  useEffect(() => {
    const handleToolShortcutKeyDown = (event: KeyboardEvent) => {
      if (!isManagedAnnotationKeyboardEvent(event)) return;

      const targetToolType = resolveAnnotationToolShortcutTarget(
        event.key,
        orderedToolTypes
      );
      if (!targetToolType || targetToolType === activeToolType) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onToolTypeChange(targetToolType as typeof activeToolType);
    };

    window.addEventListener("keydown", handleToolShortcutKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleToolShortcutKeyDown, true);
    };
  }, [activeToolType, onToolTypeChange, orderedToolTypes]);

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
          {(() => {
            const tooltip = resolveAnnotationToolText(
              selectTool.i18n.tooltipKey
            );
            const shortcuts = listAnnotationToolShortcuts(
              selectTool.id,
              orderedToolTypes
            );

            return (
              <Tooltip
                {...annotationTooltipProps}
                title={
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 8,
                      alignItems: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>{tooltip}</span>
                    {renderShortcutBadges(shortcuts)}
                  </span>
                }
              >
                <button
                  ref={isSelectionModeActive ? activeToolButtonRef : undefined}
                  type="button"
                  style={toolButtonStyle(isSelectionModeActive, false)}
                  onClick={() => onToolTypeChange(SELECT_TOOL_TYPE)}
                  aria-pressed={isSelectionModeActive}
                  aria-label={`${tooltip} (${shortcuts.join(", ")})`}
                  data-test-id="measurement-tool-select-toggle"
                >
                  {selectTool.icon}
                </button>
              </Tooltip>
            );
          })()}
          <Divider />
        </>
      )}
      {primaryTools.map((tool) => {
        const tooltip = resolveAnnotationToolText(tool.i18n.tooltipKey);
        const shortcuts = listAnnotationToolShortcuts(
          tool.id,
          orderedToolTypes
        );
        return (
          <Fragment key={tool.id}>
            {tool.id === ANNOTATION_TYPE_LABEL && <Divider />}
            <Tooltip
              {...annotationTooltipProps}
              title={
                <span
                  style={{
                    display: "inline-flex",
                    gap: 8,
                    alignItems: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>{tooltip}</span>
                  {renderShortcutBadges(shortcuts)}
                </span>
              }
            >
              <button
                ref={
                  activeToolType === tool.id ? activeToolButtonRef : undefined
                }
                type="button"
                style={toolButtonStyle(activeToolType === tool.id, false)}
                onClick={() => onToolTypeChange(tool.id)}
                aria-pressed={activeToolType === tool.id}
                aria-label={`${tooltip} (${shortcuts.join(", ")})`}
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
