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
export type PolylineSegmentLineMode = "direct" | "components";

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
  polylineVerticalOffsetMeters?: number;
  onPolylineVerticalOffsetChange?: (offsetMeters: number) => void;
  polylineSegmentLineMode?: PolylineSegmentLineMode;
  onPolylineSegmentLineModeChange?: (mode: PolylineSegmentLineMode) => void;
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
const SECONDARY_TOOLBAR_HELP_STORAGE_KEY =
  "carma.measurements.secondary-toolbar-help-collapsed.v1";

type SecondaryToolbarHelpKey =
  | "selection"
  | "point"
  | "distance"
  | "polyline"
  | "polygon"
  | "label";

const SECONDARY_TOOLBAR_HELP_KEYS: SecondaryToolbarHelpKey[] = [
  "selection",
  "point",
  "distance",
  "polyline",
  "polygon",
  "label",
];

const DEFAULT_SECONDARY_TOOLBAR_HELP_COLLAPSED: Record<
  SecondaryToolbarHelpKey,
  boolean
> = {
  selection: false,
  point: false,
  distance: false,
  polyline: false,
  polygon: false,
  label: false,
};

type PolygonSubButtonDef = {
  subType: PolygonSubType;
  icon: ReactNode;
  shortLabel: string;
  tooltip: string;
};

const POLYGON_SUB_BUTTONS: PolygonSubButtonDef[] = [
  {
    subType: "vertical",
    icon: <FontAwesomeIcon icon={faBuilding} />,
    shortLabel: "Fassade",
    tooltip: "Fassade (vertikal)",
  },
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

type SecondaryToolbarSectionProps = {
  dataTestId: string;
  helpDataTestId: string;
  helpContent: ReactNode;
  helpCollapsed: boolean;
  onHelpCollapsedChange: (collapsed: boolean) => void;
  helpItemSlot?: ReactNode;
  optionsStyle?: CSSProperties;
  children: ReactNode;
};

const SecondaryToolbarSection = ({
  dataTestId,
  helpDataTestId,
  helpContent,
  helpCollapsed,
  onHelpCollapsedChange,
  helpItemSlot,
  optionsStyle,
  children,
}: SecondaryToolbarSectionProps) => {
  return (
    <div
      style={
        optionsStyle
          ? { ...optionsContainerStyle, ...optionsStyle }
          : optionsContainerStyle
      }
      data-test-id={dataTestId}
    >
      {children}
      {helpItemSlot ?? (
        <DismissibleHelpBox
          dataTestId={helpDataTestId}
          content={helpContent}
          collapsed={helpCollapsed}
          onCollapsedChange={onHelpCollapsedChange}
        />
      )}
    </div>
  );
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
  polylineVerticalOffsetMeters = 0,
  onPolylineVerticalOffsetChange,
  polylineSegmentLineMode = "components",
  onPolylineSegmentLineModeChange,
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
  const showPolylineOptions = activeToolType === "polyline";
  const showPolygonSubButtons = activeToolType === "polygon";
  const showLabelOptions = activeToolType === "label";
  const [pointOffsetForceCloseSignal, setPointOffsetForceCloseSignal] =
    useState(0);
  const lastPointVerticalOffsetRef = useRef(1);
  const pointVerticalOffsetEnabled = Math.abs(pointVerticalOffsetMeters) > 1e-9;
  const [polylineOffsetForceCloseSignal, setPolylineOffsetForceCloseSignal] =
    useState(0);
  const lastPolylineVerticalOffsetRef = useRef(1);
  const polylineVerticalOffsetEnabled =
    Math.abs(polylineVerticalOffsetMeters) > 1e-9;
  const selectedTotalCount = selectedMeasurementCount + selectedLabelCount;
  const hasSelection = selectedTotalCount > 0;
  const [
    secondaryToolbarHelpCollapsedByKey,
    setSecondaryToolbarHelpCollapsedByKey,
  ] = useState<Record<SecondaryToolbarHelpKey, boolean>>(
    DEFAULT_SECONDARY_TOOLBAR_HELP_COLLAPSED
  );

  const setSecondaryToolbarHelpCollapsed = (
    key: SecondaryToolbarHelpKey,
    collapsed: boolean
  ) => {
    setSecondaryToolbarHelpCollapsedByKey((prev) =>
      prev[key] === collapsed ? prev : { ...prev, [key]: collapsed }
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedRaw = window.localStorage.getItem(
        SECONDARY_TOOLBAR_HELP_STORAGE_KEY
      );
      if (!storedRaw) return;
      const parsed = JSON.parse(storedRaw) as Partial<
        Record<SecondaryToolbarHelpKey, unknown>
      >;
      if (!parsed || typeof parsed !== "object") return;

      setSecondaryToolbarHelpCollapsedByKey((prev) => {
        const next = { ...prev };
        SECONDARY_TOOLBAR_HELP_KEYS.forEach((key) => {
          if (typeof parsed[key] === "boolean") {
            next[key] = parsed[key] as boolean;
          }
        });
        return next;
      });
    } catch {
      // ignore invalid persisted data
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        SECONDARY_TOOLBAR_HELP_STORAGE_KEY,
        JSON.stringify(secondaryToolbarHelpCollapsedByKey)
      );
    } catch {
      // ignore storage write errors
    }
  }, [secondaryToolbarHelpCollapsedByKey]);

  const buildHelpContent = (lines: string[]) => (
    <div style={pointManualStyle}>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );

  useEffect(() => {
    if (!pointVerticalOffsetEnabled) return;
    lastPointVerticalOffsetRef.current = pointVerticalOffsetMeters;
  }, [pointVerticalOffsetEnabled, pointVerticalOffsetMeters]);

  useEffect(() => {
    if (!polylineVerticalOffsetEnabled) return;
    lastPolylineVerticalOffsetRef.current = polylineVerticalOffsetMeters;
  }, [polylineVerticalOffsetEnabled, polylineVerticalOffsetMeters]);

  useEffect(() => {
    if (!showPointOptions) {
      setPointOffsetForceCloseSignal((prev) => prev + 1);
    }
  }, [showPointOptions]);

  useEffect(() => {
    if (!showPolylineOptions) {
      setPolylineOffsetForceCloseSignal((prev) => prev + 1);
    }
  }, [showPolylineOptions]);

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
          { type: "polyline", disabled: false },
          { type: "polygon", disabled: false },
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
        <SecondaryToolbarSection
          dataTestId="measurement-selection-options"
          helpDataTestId="measurement-selection-help"
          helpCollapsed={secondaryToolbarHelpCollapsedByKey.selection}
          onHelpCollapsedChange={(collapsed) =>
            setSecondaryToolbarHelpCollapsed("selection", collapsed)
          }
          helpContent={buildHelpContent([
            "Rechteck aufziehen, um Punkte zu selektieren.",
            'Shift oder "Additiv" erweitert die Auswahl.',
            "Ausgewählte Messungen können ein-/ausgeblendet, gesperrt und gelöscht werden.",
          ])}
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
        </SecondaryToolbarSection>
      )}
      {showDistanceOptions && (
        <SecondaryToolbarSection
          dataTestId="measurement-distance-options"
          helpDataTestId="measurement-distance-help"
          helpCollapsed={secondaryToolbarHelpCollapsedByKey.distance}
          onHelpCollapsedChange={(collapsed) =>
            setSecondaryToolbarHelpCollapsed("distance", collapsed)
          }
          optionsStyle={{
            padding: "8px 6px",
          }}
          helpContent={buildHelpContent([
            "Erster Klick setzt den Startpunkt, zweiter Klick setzt den Zielpunkt.",
            "Doppelklick auf einen Punkt setzt die Referenzhöhe.",
            'Mit "An Referenzpunkt starten" beginnen Folgemessungen am Referenzpunkt.',
            "Direkt/Vertikal/Horizontal steuern die Sichtbarkeit der Distanzkomponenten.",
          ])}
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
        </SecondaryToolbarSection>
      )}
      {showPointOptions && (
        <SecondaryToolbarSection
          dataTestId="measurement-point-options"
          helpDataTestId="measurement-point-help"
          helpCollapsed={secondaryToolbarHelpCollapsedByKey.point}
          onHelpCollapsedChange={(collapsed) =>
            setSecondaryToolbarHelpCollapsed("point", collapsed)
          }
          helpContent={buildHelpContent([
            "Für Punktmessungen auf das Stadtmodell klicken. Die erste Messung definiert die Referenzhöhe.",
            "Klicken um Höhenmessung zu setzen.",
            "Doppelklick auf Punkt setzt Referenzhöhe.",
            "Langer Klick startet Editiermodus.",
            "Rückstelltaste löscht den letzten Punkt.",
          ])}
        >
          <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
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
        </SecondaryToolbarSection>
      )}
      {showLabelOptions && (
        <SecondaryToolbarSection
          dataTestId="measurement-label-options"
          helpDataTestId="measurement-label-help"
          helpCollapsed={secondaryToolbarHelpCollapsedByKey.label}
          onHelpCollapsedChange={(collapsed) =>
            setSecondaryToolbarHelpCollapsed("label", collapsed)
          }
          helpContent={buildHelpContent([
            "Im Anmerkungsmodus setzt ein Klick eine Beschriftung am Punkt.",
            "Die Beschriftung kann danach in der Infobox bearbeitet werden.",
            "Über den Auswahlmodus lassen sich Anmerkungen gemeinsam ein-/ausblenden, sperren und löschen.",
          ])}
        >
          <span style={optionsLabelStyle}>Anmerkungsmodus aktiv</span>
        </SecondaryToolbarSection>
      )}
      {showPolylineOptions && (
        <SecondaryToolbarSection
          dataTestId="measurement-polyline-options"
          helpDataTestId="measurement-polyline-help"
          helpCollapsed={secondaryToolbarHelpCollapsedByKey.polyline}
          onHelpCollapsedChange={(collapsed) =>
            setSecondaryToolbarHelpCollapsed("polyline", collapsed)
          }
          helpContent={buildHelpContent([
            "Klicken setzt Stützpunkte des Polygonzugs.",
            "Doppelklick beendet den aktuellen Polygonzug.",
            "Vertikalversatz verschiebt die Darstellung entlang der lokalen Up-Achse.",
            "Segmentdarstellung wechselt zwischen Direktlinie und Komponenten.",
          ])}
        >
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
              checked={polylineVerticalOffsetEnabled}
              onChange={(checked) => {
                if (!checked) {
                  if (Math.abs(polylineVerticalOffsetMeters) > 1e-9) {
                    lastPolylineVerticalOffsetRef.current =
                      polylineVerticalOffsetMeters;
                  }
                  onPolylineVerticalOffsetChange?.(0);
                  setPolylineOffsetForceCloseSignal((prev) => prev + 1);
                  return;
                }
                const restoredOffset =
                  Math.abs(lastPolylineVerticalOffsetRef.current) > 1e-9
                    ? lastPolylineVerticalOffsetRef.current
                    : 1;
                onPolylineVerticalOffsetChange?.(restoredOffset);
              }}
              data-test-id="measurement-polyline-vertical-offset-enabled-toggle"
              aria-label="Polyline-Vertikalversatz aktivieren"
            />
            {polylineVerticalOffsetEnabled && (
              <EditableMetricValue
                value={polylineVerticalOffsetMeters}
                onValueChange={(nextValue) =>
                  onPolylineVerticalOffsetChange?.(nextValue)
                }
                label="Polyline-Vertikalversatz"
                locale="de-DE"
                decimalSeparator=","
                min={-100}
                max={100}
                step={1}
                precision={2}
                inputWidth={88}
                inputClassName="measurement-elevation-input"
                dataTestIdPrefix="measurement-polyline-vertical-offset"
                forceCloseSignal={polylineOffsetForceCloseSignal}
              />
            )}
          </div>
          <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span style={optionsLabelStyle}>Segmentdarstellung</span>
            <span style={optionsLabelStyle}>Direkt</span>
            <Switch
              size="small"
              checked={polylineSegmentLineMode === "components"}
              onChange={(checked) =>
                onPolylineSegmentLineModeChange?.(
                  checked ? "components" : "direct"
                )
              }
              aria-label="Polyline-Segmentdarstellung umschalten"
              data-test-id="measurement-polyline-line-mode-toggle"
            />
            <span style={optionsLabelStyle}>Komponenten</span>
          </div>
        </SecondaryToolbarSection>
      )}
      {showPolygonSubButtons && (
        <SecondaryToolbarSection
          dataTestId="measurement-polygon-options"
          helpDataTestId="measurement-polygon-help"
          helpCollapsed={secondaryToolbarHelpCollapsedByKey.polygon}
          onHelpCollapsedChange={(collapsed) =>
            setSecondaryToolbarHelpCollapsed("polygon", collapsed)
          }
          helpContent={buildHelpContent([
            "Flächenmodus bestimmt den Typ: Grundriss, Fassade oder Dach.",
            "Klicken setzt Eckpunkte; Klick auf den Startpunkt oder Doppelklick schließt die Fläche.",
            "Bei Fassaden entsteht aus zwei Punkten eine rechteckige Fläche mit Live-Vorschau.",
          ])}
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
        </SecondaryToolbarSection>
      )}
    </div>
  );
}

export default MeasurementModeToolbar;
