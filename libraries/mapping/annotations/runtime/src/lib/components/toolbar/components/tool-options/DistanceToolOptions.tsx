import type { CSSProperties, ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsToCircle } from "@fortawesome/free-solid-svg-icons";
import { Switch, Tooltip } from "antd";
import {
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  type LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";
import type { AnnotationToolbarDistanceProps } from "../../AnnotationModeToolbar.types";
import { INACTIVE_ICON_COLOR, toolButtonStyle } from "../../shared";
import { ToolOptionsSection } from "./ToolOptionsSection";
import { renderHelpContent } from "./shared";

type DistanceLineModePreset = LinearSegmentLineMode | "componentsWithDirect";

type DistanceToolOptionsProps = {
  distance?: AnnotationToolbarDistanceProps;
  helpCollapsed: boolean;
  onHelpCollapsedChange: (collapsed: boolean) => void;
};

type DistanceLineModeOption = {
  mode: DistanceLineModePreset;
  label: string;
  tooltip: string;
  icon: ReactNode;
  dataTestId: string;
};

const CUSTOM_ICON_STROKE = "currentColor";
const CUSTOM_ICON_LINE_WIDTH = 1.35;
const CUSTOM_ICON_ARROW_WIDTH = 1.15;

const DISTANCE_DIRECT_MODE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M2 7H12"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M2 7L3.2 5.8M2 7L3.2 8.2"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M12 7L10.8 5.8M12 7L10.8 8.2"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
  </svg>
);

const DISTANCE_COMPONENTS_MODE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M11.5 12V2.3"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 12H1.8"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 2.3L10.3 3.5M11.5 2.3L12.7 3.5"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M1.8 12L3 10.8M1.8 12L3 13.2"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
  </svg>
);

const DISTANCE_COMPONENTS_WITH_DIRECT_MODE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M11.5 12V2.6"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 12H2.1"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 2.6L2.1 12"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH - 0.1}
      strokeLinecap="round"
    />
  </svg>
);

const DISTANCE_LINE_MODE_OPTIONS: DistanceLineModeOption[] = [
  {
    mode: LINEAR_SEGMENT_LINE_MODE_DIRECT,
    label: "Direkt",
    tooltip: "Nur Direktlinie anzeigen",
    icon: DISTANCE_DIRECT_MODE_ICON,
    dataTestId: "measurement-distance-mode-direct",
  },
  {
    mode: LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
    label: "Komponenten",
    tooltip: "Nur Komponenten anzeigen",
    icon: DISTANCE_COMPONENTS_MODE_ICON,
    dataTestId: "measurement-distance-mode-components",
  },
  {
    mode: "componentsWithDirect",
    label: "Komponenten + Direkt",
    tooltip: "Komponenten und Direktlinie anzeigen",
    icon: DISTANCE_COMPONENTS_WITH_DIRECT_MODE_ICON,
    dataTestId: "measurement-distance-components-direct-toggle",
  },
];

const distanceModeOptionButtonStyle = (active: boolean): CSSProperties => ({
  ...toolButtonStyle(active),
  width: 24,
  height: 24,
  padding: 0,
  borderRadius: 6,
  border: `1px solid ${
    active ? "rgba(75, 85, 99, 0.72)" : "rgba(107, 114, 128, 0.4)"
  }`,
  backgroundColor: active ? "rgba(75, 85, 99, 0.12)" : "transparent",
  boxShadow: "none",
  color: INACTIVE_ICON_COLOR,
});

export function DistanceToolOptions({
  distance,
  helpCollapsed,
  onHelpCollapsedChange,
}: DistanceToolOptionsProps) {
  const {
    lineVisibility,
    onLineVisibilityChange,
    stickyToFirstPoint = false,
    onStickyToFirstPointChange,
  } = distance ?? {};
  const distanceComponentsModeEnabled =
    Boolean(lineVisibility?.vertical ?? true) ||
    Boolean(lineVisibility?.horizontal ?? true);
  const distanceDirectLineEnabled = lineVisibility?.direct ?? true;
  const distanceLineMode: DistanceLineModePreset =
    !distanceComponentsModeEnabled
      ? LINEAR_SEGMENT_LINE_MODE_DIRECT
      : distanceDirectLineEnabled
      ? "componentsWithDirect"
      : LINEAR_SEGMENT_LINE_MODE_COMPONENTS;

  const setDistanceLineMode = (mode: DistanceLineModePreset) => {
    const nextComponentsEnabled = mode !== LINEAR_SEGMENT_LINE_MODE_DIRECT;
    const nextDirectEnabled = mode !== LINEAR_SEGMENT_LINE_MODE_COMPONENTS;
    onLineVisibilityChange?.("direct", nextDirectEnabled);
    onLineVisibilityChange?.("vertical", nextComponentsEnabled);
    onLineVisibilityChange?.("horizontal", nextComponentsEnabled);
  };

  return (
    <ToolOptionsSection
      dataTestId="measurement-distance-options"
      helpDataTestId="measurement-distance-help"
      helpCollapsed={helpCollapsed}
      onHelpCollapsedChange={onHelpCollapsedChange}
      optionsStyle={{ padding: "8px 6px" }}
      helpContent={renderHelpContent([
        "Erster Klick setzt den Startpunkt, zweiter Klick setzt den Zielpunkt.",
        "Doppelklick auf einen Punkt setzt die Referenzhöhe.",
        'Mit "An Referenzpunkt starten" beginnen Folgemessungen am Referenzpunkt.',
        "Distanzmodus schaltet zwischen Direktlinie, Komponenten oder beidem um.",
      ])}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          paddingLeft: 2,
        }}
      >
        <div
          role="radiogroup"
          aria-label="Distanz-Linienmodus auswählen"
          data-test-id="measurement-distance-mode-toggle"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {DISTANCE_LINE_MODE_OPTIONS.map(
            ({ mode, label, tooltip, icon, dataTestId }) => {
              const isActive = distanceLineMode === mode;
              return (
                <Tooltip key={mode} title={tooltip}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    aria-label={`${label} ${isActive ? "aktiv" : "aktivieren"}`}
                    onClick={() => setDistanceLineMode(mode)}
                    data-test-id={dataTestId}
                    style={distanceModeOptionButtonStyle(isActive)}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 14,
                        height: 14,
                      }}
                      aria-hidden="true"
                    >
                      {icon}
                    </span>
                  </button>
                </Tooltip>
              );
            }
          )}
        </div>
      </div>
      <span
        style={{
          width: 1,
          height: 22,
          backgroundColor: "rgba(0, 0, 0, 0.12)",
          margin: "0 2px",
        }}
        aria-hidden="true"
      />
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Tooltip title="An Referenzpunkt starten">
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
            <FontAwesomeIcon icon={faArrowsToCircle} />
          </span>
        </Tooltip>
        <Switch
          size="small"
          checked={stickyToFirstPoint}
          onChange={(checked) => onStickyToFirstPointChange?.(checked)}
          data-test-id="measurement-distance-sticky-first-toggle"
          aria-label="Distanzmessung am Referenzpunkt starten"
        />
      </div>
    </ToolOptionsSection>
  );
}
