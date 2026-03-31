import { faBorderNone, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Switch, Tooltip } from "antd";

import {
  LockToggleButton,
  VisibilityToggleButton,
} from "@carma-commons/ui/components";

import type { AnnotationToolbarSelectionProps } from "../../AnnotationModeToolbar.types";
import {
  INACTIVE_ICON_COLOR,
  optionsLabelStyle,
  toolButtonStyle,
} from "../../shared";
import { annotationTooltipProps } from "../../../shared/annotationTooltip";
import { ToolOptionsSection } from "./ToolOptionsSection";
type SelectionToolOptionsProps = {
  selection?: AnnotationToolbarSelectionProps;
};

export function SelectionToolOptions({ selection }: SelectionToolOptionsProps) {
  const {
    additiveMode = false,
    onAdditiveModeChange,
    rectangleMode = false,
    onRectangleModeChange,
    selectedMeasurementCount = 0,
    selectedLabelCount = 0,
    hasAnyAnnotations = false,
    hasDeletableSelection = false,
    selectedVisibilityHidden = false,
    selectedLocked = false,
    onClearAll,
    onDeleteSelected,
    onToggleSelectedVisibility,
    onToggleSelectedLock,
  } = selection ?? {};
  const hasSelection = selectedMeasurementCount + selectedLabelCount > 0;

  return (
    <ToolOptionsSection dataTestId="measurement-selection-options">
      <div
        style={{
          display: "inline-flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <span style={optionsLabelStyle}>Additiv</span>
        <Switch
          size="small"
          checked={additiveMode}
          onChange={(checked) => onAdditiveModeChange?.(checked)}
          aria-label="Additive Auswahl"
          data-test-id="measurement-selection-additive-toggle"
        />
      </div>
      <div
        style={{
          display: "inline-flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <Tooltip {...annotationTooltipProps} title="Rechteckauswahl">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: INACTIVE_ICON_COLOR,
              width: 14,
            }}
            aria-hidden="true"
          >
            <FontAwesomeIcon icon={faBorderNone} />
          </span>
        </Tooltip>
        <Switch
          size="small"
          checked={rectangleMode}
          onChange={(checked) => onRectangleModeChange?.(checked)}
          aria-label="Rechteckauswahl"
          data-test-id="measurement-selection-rectangle-toggle"
        />
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={optionsLabelStyle}
          data-test-id="measurement-selection-counts"
        >
          {selectedMeasurementCount} Messungen · {selectedLabelCount} Labels
        </span>
        {hasSelection && (
          <>
            <Tooltip
              {...annotationTooltipProps}
              title={
                selectedVisibilityHidden
                  ? "Auswahl einblenden"
                  : "Auswahl ausblenden"
              }
            >
              <VisibilityToggleButton
                isVisible={!selectedVisibilityHidden}
                onToggle={() => onToggleSelectedVisibility?.()}
                ariaLabel="Ausgewählte Messungen ein- oder ausblenden"
                dataTestId="measurement-selection-visibility-btn"
                iconSlotWidth={14}
                style={{
                  ...toolButtonStyle(false),
                  width: 28,
                  height: 28,
                }}
              />
            </Tooltip>
            <Tooltip
              {...annotationTooltipProps}
              title={selectedLocked ? "Auswahl entsperren" : "Auswahl sperren"}
            >
              <LockToggleButton
                isLocked={selectedLocked}
                onToggle={() => onToggleSelectedLock?.()}
                style={{
                  ...toolButtonStyle(false),
                  width: 28,
                  height: 28,
                }}
                ariaLabel="Ausgewählte Messungen sperren oder entsperren"
                dataTestId="measurement-selection-lock-btn"
                iconSlotWidth={14}
              />
            </Tooltip>
            <Tooltip {...annotationTooltipProps} title="Löschen">
              <button
                type="button"
                style={{
                  ...toolButtonStyle(false, !hasDeletableSelection),
                  width: 28,
                  height: 28,
                }}
                onClick={() => onDeleteSelected?.()}
                disabled={!hasDeletableSelection}
                aria-label="Ausgewählte Messungen löschen"
                data-test-id="measurement-selection-delete-btn"
              >
                <FontAwesomeIcon icon={faTrashCan} />
              </button>
            </Tooltip>
          </>
        )}
        <Tooltip {...annotationTooltipProps} title="Alle Messungen löschen">
          <button
            type="button"
            style={{
              ...toolButtonStyle(false, !hasAnyAnnotations),
              width: "auto",
              minWidth: 28,
              height: 28,
              padding: "0 8px",
              gap: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={() => onClearAll?.()}
            disabled={!hasAnyAnnotations}
            aria-label="Alle Messungen löschen"
            data-test-id="measurement-selection-clear-all-btn"
          >
            <FontAwesomeIcon icon={faTrashCan} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>Alle</span>
          </button>
        </Tooltip>
      </div>
    </ToolOptionsSection>
  );
}
