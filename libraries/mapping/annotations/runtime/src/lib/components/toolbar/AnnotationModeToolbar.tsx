import { useEffect, useMemo, useState, type CSSProperties } from "react";
import "../annotation-info-box/infoBox.css";
import {
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  isAreaToolType,
} from "@carma-mapping/annotations/core";
import type { AnnotationModeToolbarProps } from "./AnnotationModeToolbar.types";
import { AnnotationToolOptionsBox } from "./components/AnnotationToolOptionsBox";
import { AnnotationToolOptionsToggleButton } from "./components/AnnotationToolOptionsToggleButton";
import { AnnotationToolStrip } from "./components/AnnotationToolStrip";
import { AreaToolOptions } from "./components/tool-options/AreaToolOptions";
import { DistanceToolOptions } from "./components/tool-options/DistanceToolOptions";
import { LabelToolOptions } from "./components/tool-options/LabelToolOptions";
import { PointToolOptions } from "./components/tool-options/PointToolOptions";
import { PolylineToolOptions } from "./components/tool-options/PolylineToolOptions";
import { SelectionToolOptions } from "./components/tool-options/SelectionToolOptions";
export type { AnnotationToolType } from "@carma-mapping/annotations/core";
export type {
  AnnotationModeToolbarProps,
  AnnotationToolbarDistanceProps,
  AnnotationToolbarLayoutProps,
  AnnotationToolbarPointProps,
  AnnotationToolbarPolylineProps,
  AnnotationToolbarSelectionProps,
  AnnotationToolbarToolCatalogProps,
} from "./AnnotationModeToolbar.types";

type ToolbarOptionGroupKey =
  | "selection"
  | typeof ANNOTATION_TYPE_POINT
  | typeof ANNOTATION_TYPE_DISTANCE
  | typeof ANNOTATION_TYPE_POLYLINE
  | typeof ANNOTATION_TYPE_AREA_GROUND
  | typeof ANNOTATION_TYPE_AREA_VERTICAL
  | typeof ANNOTATION_TYPE_AREA_PLANAR
  | typeof ANNOTATION_TYPE_LABEL;

const SECONDARY_TOOLBAR_HELP_STORAGE_KEY =
  "carma.annotations.secondary-toolbar-help-collapsed.v1";

const DEFAULT_SECONDARY_TOOLBAR_HELP_COLLAPSED: Record<
  ToolbarOptionGroupKey,
  boolean
> = {
  selection: false,
  [ANNOTATION_TYPE_POINT]: false,
  [ANNOTATION_TYPE_DISTANCE]: false,
  [ANNOTATION_TYPE_POLYLINE]: false,
  [ANNOTATION_TYPE_AREA_GROUND]: false,
  [ANNOTATION_TYPE_AREA_VERTICAL]: false,
  [ANNOTATION_TYPE_AREA_PLANAR]: false,
  [ANNOTATION_TYPE_LABEL]: false,
};

const TOOLBAR_OPTION_GROUP_KEYS = Object.keys(
  DEFAULT_SECONDARY_TOOLBAR_HELP_COLLAPSED
) as ToolbarOptionGroupKey[];

export function AnnotationModeToolbar({
  activeToolType,
  onToolTypeChange,
  layout,
  selection,
  distance,
  point,
  polyline,
  toolCatalog,
}: AnnotationModeToolbarProps) {
  const {
    showPrimaryToolbar = true,
    showSecondaryToolbar = true,
    pixelWidth,
  } = layout ?? {};
  const {
    secondaryToolbarContainerStyle,
    secondaryToolbarCollapsedByDefault = false,
  } = layout ?? {};
  const [helpCollapsedByKey, setHelpCollapsedByKey] = useState<
    Record<ToolbarOptionGroupKey, boolean>
  >(DEFAULT_SECONDARY_TOOLBAR_HELP_COLLAPSED);
  const [collapsed, setCollapsed] = useState(
    secondaryToolbarCollapsedByDefault
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedRaw = window.localStorage.getItem(
        SECONDARY_TOOLBAR_HELP_STORAGE_KEY
      );
      if (!storedRaw) return;
      const parsed = JSON.parse(storedRaw) as Partial<
        Record<ToolbarOptionGroupKey, unknown>
      >;
      if (!parsed || typeof parsed !== "object") return;

      setHelpCollapsedByKey((previous) => {
        const next = { ...previous };
        TOOLBAR_OPTION_GROUP_KEYS.forEach((key) => {
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
        JSON.stringify(helpCollapsedByKey)
      );
    } catch {
      // ignore storage write errors
    }
  }, [helpCollapsedByKey]);

  useEffect(() => {
    setCollapsed(secondaryToolbarCollapsedByDefault);
  }, [secondaryToolbarCollapsedByDefault]);

  const panelStyle = useMemo<CSSProperties>(
    () =>
      secondaryToolbarContainerStyle ?? {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignSelf: "flex-end",
        width: "fit-content",
        maxWidth: "calc(100vw - 64px)",
        boxSizing: "border-box",
      },
    [secondaryToolbarContainerStyle]
  );

  const setHelpCollapsed = (
    key: ToolbarOptionGroupKey,
    nextCollapsed: boolean
  ) => {
    setHelpCollapsedByKey((previous) =>
      previous[key] === nextCollapsed
        ? previous
        : { ...previous, [key]: nextCollapsed }
    );
  };

  const activeToolOptions =
    activeToolType === SELECT_TOOL_TYPE ? (
      <SelectionToolOptions
        selection={selection}
        helpCollapsed={helpCollapsedByKey.selection}
        onHelpCollapsedChange={(nextCollapsed) =>
          setHelpCollapsed("selection", nextCollapsed)
        }
      />
    ) : activeToolType === ANNOTATION_TYPE_DISTANCE ? (
      <DistanceToolOptions
        distance={distance}
        helpCollapsed={helpCollapsedByKey[ANNOTATION_TYPE_DISTANCE]}
        onHelpCollapsedChange={(nextCollapsed) =>
          setHelpCollapsed(ANNOTATION_TYPE_DISTANCE, nextCollapsed)
        }
      />
    ) : activeToolType === ANNOTATION_TYPE_POINT ? (
      <PointToolOptions
        point={point}
        helpCollapsed={helpCollapsedByKey[ANNOTATION_TYPE_POINT]}
        onHelpCollapsedChange={(nextCollapsed) =>
          setHelpCollapsed(ANNOTATION_TYPE_POINT, nextCollapsed)
        }
      />
    ) : activeToolType === ANNOTATION_TYPE_LABEL ? (
      <LabelToolOptions
        helpCollapsed={helpCollapsedByKey[ANNOTATION_TYPE_LABEL]}
        onHelpCollapsedChange={(nextCollapsed) =>
          setHelpCollapsed(ANNOTATION_TYPE_LABEL, nextCollapsed)
        }
      />
    ) : activeToolType === ANNOTATION_TYPE_POLYLINE ? (
      <PolylineToolOptions
        polyline={polyline}
        helpCollapsed={helpCollapsedByKey[ANNOTATION_TYPE_POLYLINE]}
        onHelpCollapsedChange={(nextCollapsed) =>
          setHelpCollapsed(ANNOTATION_TYPE_POLYLINE, nextCollapsed)
        }
      />
    ) : isAreaToolType(activeToolType) ? (
      <AreaToolOptions
        activeToolType={activeToolType}
        helpCollapsed={helpCollapsedByKey[activeToolType]}
        onHelpCollapsedChange={(nextCollapsed) =>
          setHelpCollapsed(activeToolType, nextCollapsed)
        }
      />
    ) : null;

  const optionsToggleButton =
    showSecondaryToolbar && activeToolOptions ? (
      <AnnotationToolOptionsToggleButton
        collapsed={collapsed}
        onClick={() => setCollapsed((previous) => !previous)}
      />
    ) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        paddingBottom: showPrimaryToolbar ? 6 : 0,
        width: pixelWidth ?? "100%",
        boxSizing: "border-box",
      }}
    >
      {showPrimaryToolbar ? (
        <AnnotationToolStrip
          activeToolType={activeToolType}
          onToolTypeChange={onToolTypeChange}
          toolCatalog={toolCatalog}
          optionsToggleSlot={optionsToggleButton}
        />
      ) : null}
      {!showPrimaryToolbar && optionsToggleButton ? optionsToggleButton : null}
      {showSecondaryToolbar && activeToolOptions && !collapsed ? (
        <AnnotationToolOptionsBox panelStyle={panelStyle}>
          {activeToolOptions}
        </AnnotationToolOptionsBox>
      ) : null}
    </div>
  );
}

export default AnnotationModeToolbar;
