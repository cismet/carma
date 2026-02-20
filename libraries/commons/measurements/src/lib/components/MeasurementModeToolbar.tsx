import {
  CSSProperties,
  Fragment,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowPointer,
  faArrowsLeftRightToLine,
  faArrowsToCircle,
  faLocationDot,
  faMessage,
  faRuler,
  faRoute,
  faDrawPolygon,
  faBuilding,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { Switch, Tooltip } from "antd";
import {
  DismissibleHelpBox,
  EditableMetricValue,
  LockToggleButton,
  VisibilityToggleButton,
} from "@carma-commons/ui/components";

export type MeasurementToolType =
  | "select"
  | "label"
  | "point"
  | "distance"
  | "polyline"
  | "polygon";

export type PolygonSubType = "horizontal" | "vertical" | "oblique";

export interface MeasurementModeToolbarProps {
  activeToolType: MeasurementToolType;
  onToolTypeChange: (toolType: MeasurementToolType) => void;
  selectAdditiveMode?: boolean;
  onSelectAdditiveModeChange?: (enabled: boolean) => void;
  selectedMeasurementCount?: number;
  selectedLabelCount?: number;
  onDeleteSelectedPoints?: () => void;
  onToggleSelectedVisibility?: () => void;
  onToggleSelectedLock?: () => void;
  selectedVisibilityHidden?: boolean;
  selectedLocked?: boolean;
  hasDeletableSelection?: boolean;
  distanceLineVisibility?: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  onDistanceLineVisibilityChange?: (
    kind: "direct" | "vertical" | "horizontal",
    visible: boolean
  ) => void;
  distanceStickyToFirstPoint?: boolean;
  onDistanceStickyToFirstPointChange?: (enabled: boolean) => void;
  pointVerticalOffsetMeters?: number;
  onPointVerticalOffsetChange?: (offsetMeters: number) => void;
  pointSoloMode?: boolean;
  onPointSoloModeChange?: (enabled: boolean) => void;
  activePolygonSubType?: PolygonSubType;
  onPolygonSubTypeChange?: (subType: PolygonSubType) => void;
  pixelWidth?: number;
}

const TOOL_BUTTON_SIZE_PX = 32;

type ToolButtonDef = {
  type: MeasurementToolType;
  icon: ReactNode;
  tooltip: string;
};

const TOOL_BUTTONS: ToolButtonDef[] = [
  {
    type: "select",
    icon: (
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          width: 14,
          height: 14,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FontAwesomeIcon
          icon={faSquare}
          style={{
            position: "absolute",
            left: -2,
            top: -3,
            fontSize: 16,
            opacity: 0.5,
          }}
        />
        <FontAwesomeIcon
          icon={faArrowPointer}
          style={{
            position: "absolute",
            right: -1,
            bottom: -4,
            fontSize: 14,
          }}
        />
      </span>
    ),
    tooltip: "Messung auswählen",
  },
  {
    type: "point",
    icon: <FontAwesomeIcon icon={faLocationDot} />,
    tooltip: "Punkt messen",
  },
  {
    type: "label",
    icon: <FontAwesomeIcon icon={faMessage} />,
    tooltip: "Anmerkung",
  },
  {
    type: "distance",
    icon: <FontAwesomeIcon icon={faRuler} />,
    tooltip: "Strecke messen",
  },
  {
    type: "polyline",
    icon: <FontAwesomeIcon icon={faRoute} />,
    tooltip: "Polygonzug messen",
  },
  {
    type: "polygon",
    icon: <FontAwesomeIcon icon={faDrawPolygon} />,
    tooltip: "Fläche messen",
  },
];

const ACTIVE_ACCENT_COLOR = "#1677ff";
const INACTIVE_ICON_COLOR = "#4b5563";
const LAYER_BUTTON_SHADOW =
  "0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)";
const INFOBOX_SURFACE_BG = "rgba(245, 245, 245, 0.8)";
const INFOBOX_SURFACE_BLUR = "blur(2px)";
const DISTANCE_VERTICAL_COLOR = "rgba(111, 168, 255, 0.96)";
const DISTANCE_HORIZONTAL_COLOR = "rgba(188, 194, 102, 0.95)";

type PolygonSubButtonDef = {
  subType: PolygonSubType;
  icon: ReactNode;
  shortLabel: string;
  tooltip: string;
};

const POLYGON_SUB_BUTTONS: PolygonSubButtonDef[] = [
  {
    subType: "horizontal",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="1" y="1" width="8" height="4" rx="0.8" fill="currentColor" />
        <rect x="1" y="1" width="4" height="8" rx="0.8" fill="currentColor" />
        <rect
          x="7.6"
          y="6.6"
          width="5.4"
          height="5.4"
          rx="0.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    ),
    shortLabel: "Grundriss",
    tooltip: "Grundriss",
  },
  {
    subType: "vertical",
    icon: <FontAwesomeIcon icon={faBuilding} />,
    shortLabel: "Fassade",
    tooltip: "Fassade (vertikal)",
  },
  {
    subType: "oblique",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path
          d="M1 10.5 L7 2.3 L13 10.5 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <line
          x1="1.4"
          y1="10.5"
          x2="12.6"
          y2="10.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    ),
    shortLabel: "Dach",
    tooltip: "Dachfläche (schräg)",
  },
];

const toolButtonStyle = (
  isActive: boolean,
  disabled: boolean = false
): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: TOOL_BUTTON_SIZE_PX,
  height: TOOL_BUTTON_SIZE_PX,
  borderRadius: 8,
  border: isActive ? `1px solid rgba(22, 119, 255, 0.5)` : "1px solid #d1d5db",
  backgroundColor: isActive ? "#ffffff" : "#f9fafb",
  color: isActive ? ACTIVE_ACCENT_COLOR : INACTIVE_ICON_COLOR,
  cursor: disabled ? "not-allowed" : "pointer",
  boxShadow: isActive ? LAYER_BUTTON_SHADOW : "none",
  fontSize: 13,
  transition: "all 0.15s ease",
  flexShrink: 0,
  padding: 0,
  opacity: disabled ? 0.45 : 1,
});

const subButtonStyle = (isActive: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 70,
  height: 28,
  gap: 4,
  borderRadius: 8,
  border: isActive
    ? `1px solid rgba(22, 119, 255, 0.45)`
    : "1px solid rgba(0, 0, 0, 0.05)",
  backgroundColor: isActive ? "#ffffff" : "#f3f4f6",
  color: isActive ? ACTIVE_ACCENT_COLOR : INACTIVE_ICON_COLOR,
  cursor: "pointer",
  fontSize: 10,
  boxShadow: LAYER_BUTTON_SHADOW,
  padding: "0 8px",
  transition: "all 0.15s ease",
  flexShrink: 0,
});

const optionsContainerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  width: "100%",
  maxWidth: "100%",
  borderRadius: 8,
  backgroundColor: INFOBOX_SURFACE_BG,
  backdropFilter: INFOBOX_SURFACE_BLUR,
  WebkitBackdropFilter: INFOBOX_SURFACE_BLUR,
  border: "1px solid #d1d5db",
  padding: "4px 6px",
  boxSizing: "border-box",
};

const optionsLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#4b5563",
  whiteSpace: "nowrap",
};

const pointManualStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  fontSize: 10,
  color: "#6b7280",
  lineHeight: 1.3,
};

const distanceToggleButtonStyle: CSSProperties = {
  ...toolButtonStyle(false),
  width: 32,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "0 4px",
  border: "none",
  boxShadow: "none",
};

export function MeasurementModeToolbar({
  activeToolType,
  onToolTypeChange,
  selectAdditiveMode = false,
  onSelectAdditiveModeChange,
  selectedMeasurementCount = 0,
  selectedLabelCount = 0,
  onDeleteSelectedPoints,
  onToggleSelectedVisibility,
  onToggleSelectedLock,
  selectedVisibilityHidden = false,
  selectedLocked = false,
  hasDeletableSelection = false,
  distanceLineVisibility,
  onDistanceLineVisibilityChange,
  distanceStickyToFirstPoint = false,
  onDistanceStickyToFirstPointChange,
  pointVerticalOffsetMeters = 0,
  onPointVerticalOffsetChange,
  pointSoloMode = false,
  onPointSoloModeChange,
  activePolygonSubType = "oblique",
  onPolygonSubTypeChange,
  pixelWidth,
}: MeasurementModeToolbarProps) {
  const showSelectionOptions = activeToolType === "select";
  const isSelectionModeActive = activeToolType === "select";
  const showPointOptions = activeToolType === "point";
  const showDistanceOptions = activeToolType === "distance";
  const showPolygonSubButtons = activeToolType === "polygon";
  const [pointOffsetForceCloseSignal, setPointOffsetForceCloseSignal] =
    useState(0);
  const lastPointVerticalOffsetRef = useRef(1);
  const pointVerticalOffsetEnabled = Math.abs(pointVerticalOffsetMeters) > 1e-9;
  const selectedTotalCount = selectedMeasurementCount + selectedLabelCount;
  const hasSelection = selectedTotalCount > 0;

  useEffect(() => {
    if (!pointVerticalOffsetEnabled) return;
    lastPointVerticalOffsetRef.current = pointVerticalOffsetMeters;
  }, [pointVerticalOffsetEnabled, pointVerticalOffsetMeters]);

  useEffect(() => {
    if (!showPointOptions) {
      setPointOffsetForceCloseSignal((prev) => prev + 1);
    }
  }, [showPointOptions]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        paddingBottom: 6,
        width: pixelWidth ?? "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "4px 6px",
          borderRadius: 8,
          backgroundColor: INFOBOX_SURFACE_BG,
          backdropFilter: INFOBOX_SURFACE_BLUR,
          WebkitBackdropFilter: INFOBOX_SURFACE_BLUR,
          border: "1px solid #d1d5db",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        {[
          { type: "point", disabled: false },
          { type: "distance", disabled: false },
          { type: "polyline", disabled: true },
          { type: "polygon", disabled: true },
          { type: "label", disabled: false },
        ]
          .map(({ type, disabled }) => {
            const btn = TOOL_BUTTONS.find((b) => b.type === type);
            return btn ? { ...btn, alwaysDisabled: disabled } : null;
          })
          .filter((button): button is NonNullable<typeof button> =>
            Boolean(button)
          )
          .map(({ type, icon, tooltip, alwaysDisabled }) => {
            const isDisabled = alwaysDisabled || isSelectionModeActive;
            return (
              <Fragment key={type}>
                {type === "label" && (
                  <span
                    style={{
                      width: 1,
                      height: 22,
                      backgroundColor: "rgba(0, 0, 0, 0.12)",
                      margin: "0 2px",
                    }}
                    aria-hidden="true"
                  />
                )}
                <Tooltip
                  title={alwaysDisabled ? `${tooltip} (demnächst)` : tooltip}
                  placement="top"
                >
                  <button
                    type="button"
                    style={toolButtonStyle(activeToolType === type, isDisabled)}
                    onClick={() => !isDisabled && onToolTypeChange(type)}
                    aria-pressed={activeToolType === type}
                    aria-label={tooltip}
                    data-test-id={`measurement-tool-${type}`}
                    disabled={isDisabled}
                  >
                    {icon}
                  </button>
                </Tooltip>
                {type === "label" && (
                  <span
                    style={{
                      width: 1,
                      height: 22,
                      backgroundColor: "rgba(0, 0, 0, 0.12)",
                      margin: "0 2px",
                    }}
                    aria-hidden="true"
                  />
                )}
              </Fragment>
            );
          })}
        <Tooltip title="Messung auswählen" placement="top">
          <button
            type="button"
            style={{
              ...toolButtonStyle(isSelectionModeActive),
              marginLeft: "auto",
            }}
            onClick={() => onToolTypeChange("select")}
            aria-pressed={isSelectionModeActive}
            aria-label="Messung auswählen"
            data-test-id="measurement-tool-select-toggle"
          >
            <FontAwesomeIcon icon={faArrowPointer} />
          </button>
        </Tooltip>
      </div>
      {showSelectionOptions && (
        <div
          style={optionsContainerStyle}
          data-test-id="measurement-selection-options"
        >
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <span style={optionsLabelStyle}>Additiv</span>
            <Switch
              size="small"
              checked={selectAdditiveMode}
              onChange={(checked) => onSelectAdditiveModeChange?.(checked)}
              aria-label="Additive Auswahl"
              data-test-id="measurement-selection-additive-toggle"
            />
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={optionsLabelStyle}
              data-test-id="measurement-selection-counts"
            >
              {selectedMeasurementCount} Messungen · {selectedLabelCount} Labels
            </span>
            {hasSelection && (
              <>
                <Tooltip
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
                  title={
                    selectedLocked ? "Auswahl entsperren" : "Auswahl sperren"
                  }
                >
                  <LockToggleButton
                    isLocked={selectedLocked}
                    onToggle={() => onToggleSelectedLock?.()}
                    style={{ ...toolButtonStyle(false), width: 28, height: 28 }}
                    ariaLabel="Ausgewählte Messungen sperren oder entsperren"
                    dataTestId="measurement-selection-lock-btn"
                    iconSlotWidth={14}
                  />
                </Tooltip>
                <Tooltip title="Löschen">
                  <button
                    type="button"
                    style={{
                      ...toolButtonStyle(false, !hasDeletableSelection),
                      width: 28,
                      height: 28,
                    }}
                    onClick={() => onDeleteSelectedPoints?.()}
                    disabled={!hasDeletableSelection}
                    aria-label="Ausgewählte Messungen löschen"
                    data-test-id="measurement-selection-delete-btn"
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </Tooltip>
              </>
            )}
          </div>
          <DismissibleHelpBox
            dataTestId="measurement-selection-help"
            onClose={() => {
              // collapse state is handled internally by DismissibleHelpBox
            }}
            content={
              <div style={pointManualStyle}>
                <span>Rechteck aufziehen, um Punkte zu selektieren.</span>
                <span>Shift oder „Additiv“ erweitert die Auswahl.</span>
                <span>Touch: „Additiv“ als Sekundäroption verwenden.</span>
              </div>
            }
          />
        </div>
      )}
      {showDistanceOptions && (
        <div
          style={{
            ...optionsContainerStyle,
            padding: "8px 6px",
          }}
          data-test-id="measurement-distance-options"
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              paddingLeft: 4,
            }}
          >
            {[
              {
                kind: "direct" as const,
                tooltip: "Direkte Distanzlinie",
                iconStyle: { transform: "rotate(135deg)" },
                iconColor: INACTIVE_ICON_COLOR,
                dataTestId: "measurement-distance-direct-toggle",
              },
              {
                kind: "vertical" as const,
                tooltip: "Vertikale Komponente",
                iconStyle: { transform: "rotate(90deg)" },
                iconColor: DISTANCE_VERTICAL_COLOR,
                dataTestId: "measurement-distance-vertical-toggle",
              },
              {
                kind: "horizontal" as const,
                tooltip: "Horizontale Komponente",
                iconStyle: undefined,
                iconColor: DISTANCE_HORIZONTAL_COLOR,
                dataTestId: "measurement-distance-horizontal-toggle",
              },
            ].map(({ kind, tooltip, iconStyle, iconColor, dataTestId }) => {
              const isVisible = distanceLineVisibility?.[kind] ?? true;
              return (
                <Tooltip
                  key={kind}
                  title={`${tooltip} ${
                    isVisible ? "ausblenden" : "einblenden"
                  }`}
                >
                  <VisibilityToggleButton
                    isVisible={isVisible}
                    onToggle={(nextVisible) =>
                      onDistanceLineVisibilityChange?.(kind, nextVisible)
                    }
                    leadingIcon={
                      <FontAwesomeIcon
                        icon={faArrowsLeftRightToLine}
                        style={{
                          ...iconStyle,
                          color: iconColor,
                        }}
                      />
                    }
                    fontSize={11}
                    stopPropagation
                    ariaLabel={`${tooltip} ${
                      isVisible ? "ausblenden" : "einblenden"
                    }`}
                    dataTestId={dataTestId}
                    iconSlotWidth={14}
                    iconSlotHeight={14}
                    style={{
                      ...distanceToggleButtonStyle,
                      backgroundColor: "transparent",
                      color: INACTIVE_ICON_COLOR,
                      border: "none",
                      boxShadow: "none",
                      padding: 0,
                    }}
                  />
                </Tooltip>
              );
            })}
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
              checked={distanceStickyToFirstPoint}
              onChange={(checked) =>
                onDistanceStickyToFirstPointChange?.(checked)
              }
              data-test-id="measurement-distance-sticky-first-toggle"
              aria-label="Distanzmessung am Referenzpunkt starten"
            />
          </div>
          <DismissibleHelpBox
            dataTestId="measurement-distance-help"
            onClose={() => {
              // collapse state is handled internally by DismissibleHelpBox
            }}
            content={
              <div style={pointManualStyle}>
                <span>
                  Erster Klick setzt den Startpunkt, zweiter Klick misst die
                  Distanz.
                </span>
                <span>
                  Mit „Ref.-Start“ bleiben Folgemessungen am Referenzpunkt
                  verankert.
                </span>
                <span>
                  Direkt/Vertikal/Horizontal steuern die Sichtbarkeit neuer
                  Distanzlinien.
                </span>
              </div>
            }
          />
        </div>
      )}
      {showPointOptions && (
        <>
          <div
            style={optionsContainerStyle}
            data-test-id="measurement-point-options"
          >
            <div
              style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
            >
              <span style={optionsLabelStyle}>Temporär/Solo</span>
              <Switch
                size="small"
                checked={pointSoloMode}
                onChange={(checked) => onPointSoloModeChange?.(checked)}
                aria-label="Temporär/Solo"
                data-test-id="measurement-point-solo-toggle"
              />
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span style={optionsLabelStyle}>Vertikalversatz</span>
              <Switch
                size="small"
                checked={pointVerticalOffsetEnabled}
                onChange={(checked) => {
                  if (!checked) {
                    if (Math.abs(pointVerticalOffsetMeters) > 1e-9) {
                      lastPointVerticalOffsetRef.current =
                        pointVerticalOffsetMeters;
                    }
                    onPointVerticalOffsetChange?.(0);
                    setPointOffsetForceCloseSignal((prev) => prev + 1);
                    return;
                  }
                  const restoredOffset =
                    Math.abs(lastPointVerticalOffsetRef.current) > 1e-9
                      ? lastPointVerticalOffsetRef.current
                      : 1;
                  onPointVerticalOffsetChange?.(restoredOffset);
                }}
                data-test-id="measurement-point-vertical-offset-enabled-toggle"
                aria-label="Vertikalversatz aktivieren"
              />
              {pointVerticalOffsetEnabled && (
                <EditableMetricValue
                  value={pointVerticalOffsetMeters}
                  onValueChange={(nextValue) =>
                    onPointVerticalOffsetChange?.(nextValue)
                  }
                  label="Vertikalversatz"
                  locale="de-DE"
                  decimalSeparator=","
                  min={-100}
                  max={100}
                  step={1}
                  precision={2}
                  inputWidth={88}
                  inputClassName="measurement-elevation-input"
                  dataTestIdPrefix="measurement-point-vertical-offset"
                  forceCloseSignal={pointOffsetForceCloseSignal}
                />
              )}
            </div>
            <DismissibleHelpBox
              dataTestId="measurement-point-help"
              onClose={() => {
                // collapse state is handled internally by DismissibleHelpBox
              }}
              content={
                <div style={pointManualStyle}>
                  <span>
                    Für Punktmessungen auf das Stadtmodell klicken. Die erste
                    Messung definiert die Referenzhöhe.
                  </span>
                  <span>Klicken um Höhenmessung zu setzen.</span>
                  <span>Doppelklick auf Punkt setzt Referenzhöhe.</span>
                  <span>Langer Klick startet Editiermodus.</span>
                  <span>Rückstelltaste löscht den letzten Punkt.</span>
                </div>
              }
            />
          </div>
        </>
      )}
      {showPolygonSubButtons && (
        <div
          style={optionsContainerStyle}
          data-test-id="measurement-polygon-options"
        >
          <span style={optionsLabelStyle}>Flächenmodus:</span>
          <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            {POLYGON_SUB_BUTTONS.map(
              ({ subType, icon, shortLabel, tooltip }) => (
                <Tooltip key={subType} title={tooltip} placement="bottom">
                  <button
                    type="button"
                    style={subButtonStyle(activePolygonSubType === subType)}
                    onClick={() => {
                      onToolTypeChange("polygon");
                      onPolygonSubTypeChange?.(subType);
                    }}
                    aria-pressed={activePolygonSubType === subType}
                    aria-label={tooltip}
                    data-test-id={`polygon-sub-${subType}`}
                  >
                    {icon}
                    <span>{shortLabel}</span>
                  </button>
                </Tooltip>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MeasurementModeToolbar;
