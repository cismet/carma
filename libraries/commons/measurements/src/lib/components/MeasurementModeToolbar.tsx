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
type DistanceLineModePreset = "direct" | "components" | "componentsWithDirect";

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

const POLYGON_HELP_CONTENT_BY_SUB_TYPE: Record<PolygonSubType, string[]> = {
  horizontal: [
    "Grundriss: Jeder Klick setzt einen Bodenpunkt; die Vorschau folgt dem Cursor auf dem Gelände.",
    "Klick auf Startpunkt oder Doppelklick schließt die Fläche.",
  ],
  vertical: [
    "Fassade: Der 1. Punkt startet die Fläche, der 2. Punkt erzeugt eine rechteckige Fassade mit Auto-Ecken.",
    "Klick auf Startpunkt oder Doppelklick schließt die Fläche.",
  ],
  oblique: [
    "Dach: 1.+2. Punkt definieren eine horizontale Kante, der 3. Punkt spannt die Dach-Ebene auf; weitere Punkte werden auf diese Ebene projiziert.",
    "Klick auf Startpunkt oder Doppelklick schließt die Fläche.",
  ],
};

const POLYGON_SUB_TYPE_LABEL_BY_SUB_TYPE: Record<PolygonSubType, string> = {
  horizontal: "Grundriss",
  vertical: "Fassade",
  oblique: "Dach",
};

const DISABLED_POLYGON_SUB_TYPES = new Set<PolygonSubType>([]);

const ACTIVE_ACCENT_COLOR = "#1677ff";
const INACTIVE_ICON_COLOR = "#4b5563";
const CUSTOM_ICON_STROKE = "currentColor";
const CUSTOM_ICON_LINE_WIDTH = 1.35;
const CUSTOM_ICON_ARROW_WIDTH = 1.15;
const DISTANCE_MODE_ICON_STROKE = CUSTOM_ICON_STROKE;
const DISTANCE_MODE_ICON_LINE_WIDTH = CUSTOM_ICON_LINE_WIDTH;
const DISTANCE_MODE_ICON_ARROW_WIDTH = CUSTOM_ICON_ARROW_WIDTH;
const LAYER_BUTTON_SHADOW =
  "0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)";
const INFOBOX_SURFACE_BG = "rgba(245, 245, 245, 0.8)";
const INFOBOX_SURFACE_BLUR = "blur(2px)";
const TOOLBOX_SURFACE_RADIUS_PX = 4;
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

type RoofTrapezoidIconProps = {
  fontSize?: number | string;
};

const RoofTrapezoidIcon = ({ fontSize = "1em" }: RoofTrapezoidIconProps) => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 14 14"
    aria-hidden="true"
    style={{ display: "block", fontSize }}
  >
    <path
      d="M5 3 L9 3 L12 6 L2 6 Z"
      fill="none"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH}
      strokeLinejoin="round"
    />
  </svg>
);

const POLYGON_SUB_BUTTONS: PolygonSubButtonDef[] = [
  {
    subType: "horizontal",
    icon: <FontAwesomeIcon icon={faDrawPolygon} />,
    shortLabel: "Grundriss",
    tooltip: "Grundriss",
  },
  {
    subType: "oblique",
    icon: <RoofTrapezoidIcon fontSize="1.33em" />,
    shortLabel: "Dach",
    tooltip: "Dachfläche (schräg)",
  },
  {
    subType: "vertical",
    icon: <FontAwesomeIcon icon={faBuilding} />,
    shortLabel: "Fassade",
    tooltip: "Fassade (vertikal)",
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

const optionsContainerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  width: "100%",
  maxWidth: "100%",
  borderRadius: TOOLBOX_SURFACE_RADIUS_PX,
  backgroundColor: INFOBOX_SURFACE_BG,
  backdropFilter: INFOBOX_SURFACE_BLUR,
  WebkitBackdropFilter: INFOBOX_SURFACE_BLUR,
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

const DISTANCE_DIRECT_MODE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M2 7H12"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M2 7L3.2 5.8M2 7L3.2 8.2"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M12 7L10.8 5.8M12 7L10.8 8.2"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
  </svg>
);

const DISTANCE_COMPONENTS_MODE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M11.5 12V2.3"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 12H1.8"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 2.3L10.3 3.5M11.5 2.3L12.7 3.5"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M1.8 12L3 10.8M1.8 12L3 13.2"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
  </svg>
);

const DISTANCE_COMPONENTS_WITH_DIRECT_MODE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M11.5 12V2.6"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 12H2.1"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 2.6L2.1 12"
      stroke={DISTANCE_MODE_ICON_STROKE}
      strokeWidth={DISTANCE_MODE_ICON_LINE_WIDTH - 0.1}
      strokeLinecap="round"
    />
  </svg>
);

type DistanceLineModeOption = {
  mode: DistanceLineModePreset;
  label: string;
  tooltip: string;
  icon: ReactNode;
  dataTestId: string;
};

const DISTANCE_LINE_MODE_OPTIONS: DistanceLineModeOption[] = [
  {
    mode: "direct",
    label: "Direkt",
    tooltip: "Nur Direktlinie anzeigen",
    icon: DISTANCE_DIRECT_MODE_ICON,
    dataTestId: "measurement-distance-mode-direct",
  },
  {
    mode: "components",
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
  const distanceComponentsModeEnabled =
    Boolean(distanceLineVisibility?.vertical ?? true) ||
    Boolean(distanceLineVisibility?.horizontal ?? true);
  const distanceDirectLineEnabled = distanceLineVisibility?.direct ?? true;
  const distanceLineMode: DistanceLineModePreset =
    !distanceComponentsModeEnabled
      ? "direct"
      : distanceDirectLineEnabled
      ? "componentsWithDirect"
      : "components";
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

  const setDistanceLineMode = (mode: DistanceLineModePreset) => {
    const nextComponentsEnabled = mode !== "direct";
    const nextDirectEnabled = mode !== "components";
    onDistanceLineVisibilityChange?.("direct", nextDirectEnabled);
    onDistanceLineVisibilityChange?.("vertical", nextComponentsEnabled);
    onDistanceLineVisibilityChange?.("horizontal", nextComponentsEnabled);
  };

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
          borderRadius: TOOLBOX_SURFACE_RADIUS_PX,
          backgroundColor: INFOBOX_SURFACE_BG,
          backdropFilter: INFOBOX_SURFACE_BLUR,
          WebkitBackdropFilter: INFOBOX_SURFACE_BLUR,
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
            if (type === "polygon") {
              return (
                <Fragment key={type}>
                  {POLYGON_SUB_BUTTONS.map(
                    ({
                      subType,
                      icon: subIcon,
                      shortLabel,
                      tooltip: subTooltip,
                    }) => {
                      const isSubTypeDisabled =
                        isDisabled || DISABLED_POLYGON_SUB_TYPES.has(subType);
                      const isSubTypeActive =
                        activeToolType === "polygon" &&
                        activePolygonSubType === subType;

                      return (
                        <Tooltip
                          key={subType}
                          title={
                            isSubTypeDisabled
                              ? `${subTooltip} (demnächst)`
                              : `${subTooltip} (Flächenmodus)`
                          }
                          placement="top"
                        >
                          <button
                            type="button"
                            style={toolButtonStyle(
                              isSubTypeActive,
                              isSubTypeDisabled
                            )}
                            onClick={() => {
                              if (isSubTypeDisabled) {
                                return;
                              }
                              onToolTypeChange("polygon");
                              onPolygonSubTypeChange?.(subType);
                            }}
                            aria-pressed={isSubTypeActive}
                            aria-label={`Flächenmodus ${shortLabel}`}
                            data-test-id={`measurement-tool-polygon-${subType}`}
                            disabled={isSubTypeDisabled}
                          >
                            {subIcon}
                          </button>
                        </Tooltip>
                      );
                    }
                  )}
                </Fragment>
              );
            }

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
                        aria-label={`${label} ${
                          isActive ? "aktiv" : "aktivieren"
                        }`}
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
          helpContent={buildHelpContent(
            POLYGON_HELP_CONTENT_BY_SUB_TYPE[activePolygonSubType]
          )}
        >
          <span
            style={optionsLabelStyle}
            data-test-id="measurement-polygon-mode-label"
          >
            Aktiver Flächenmodus:{" "}
            {POLYGON_SUB_TYPE_LABEL_BY_SUB_TYPE[activePolygonSubType]}
          </span>
        </SecondaryToolbarSection>
      )}
    </div>
  );
}

export default MeasurementModeToolbar;
