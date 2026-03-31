import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

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

import { ANNOTATION_TOOLBAR_HELP_TEXT } from "../../config/annotationToolbarHelpText";
import type { AnnotationModeToolbarProps } from "./AnnotationModeToolbar.types";
import { AnnotationToolbarHelpOverlay } from "./components/AnnotationToolbarHelpOverlay";
import { AnnotationToolOptionsBox } from "./components/AnnotationToolOptionsBox";
import { AnnotationToolOptionsToggleButton } from "./components/AnnotationToolOptionsToggleButton";
import { AnnotationToolStrip } from "./components/AnnotationToolStrip";
import { DistanceToolOptions } from "./components/tool-options/DistanceToolOptions";
import { PointToolOptions } from "./components/tool-options/PointToolOptions";
import { PolylineToolOptions } from "./components/tool-options/PolylineToolOptions";
import { SelectionToolOptions } from "./components/tool-options/SelectionToolOptions";
import { renderHelpContent } from "./components/tool-options/shared";

import "../annotation-info-box/infoBox.css";
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

const resolveToolbarOptionGroupKey = (
  activeToolType: AnnotationModeToolbarProps["activeToolType"]
): ToolbarOptionGroupKey | null => {
  if (activeToolType === SELECT_TOOL_TYPE) {
    return "selection";
  }

  if (
    activeToolType === ANNOTATION_TYPE_POINT ||
    activeToolType === ANNOTATION_TYPE_DISTANCE ||
    activeToolType === ANNOTATION_TYPE_POLYLINE ||
    activeToolType === ANNOTATION_TYPE_LABEL ||
    isAreaToolType(activeToolType)
  ) {
    return activeToolType;
  }

  return null;
};

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
  const [activeToolAnchorX, setActiveToolAnchorX] = useState<number | null>(
    null
  );
  const panelContentRef = useRef<HTMLDivElement | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);

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

  useLayoutEffect(() => {
    const panelElement = panelContentRef.current;
    if (!panelElement || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateWidth = () => {
      setPanelWidth(panelElement.getBoundingClientRect().width);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(panelElement);
    window.addEventListener("resize", updateWidth);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [activeToolType, collapsed, showSecondaryToolbar]);

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
      <SelectionToolOptions selection={selection} />
    ) : activeToolType === ANNOTATION_TYPE_DISTANCE ? (
      <DistanceToolOptions distance={distance} />
    ) : activeToolType === ANNOTATION_TYPE_POINT ? (
      <PointToolOptions point={point} />
    ) : activeToolType === ANNOTATION_TYPE_POLYLINE ? (
      <PolylineToolOptions polyline={polyline} />
    ) : null;
  const activeHelpKey = resolveToolbarOptionGroupKey(activeToolType);
  const activeHelpLines = ANNOTATION_TOOLBAR_HELP_TEXT[activeToolType] ?? null;
  const activeHelpContent = activeHelpLines
    ? renderHelpContent(activeHelpLines)
    : null;

  const optionsToggleButton = showSecondaryToolbar ? (
    <AnnotationToolOptionsToggleButton
      collapsed={collapsed}
      onClick={() => setCollapsed((previous) => !previous)}
      disabled={!activeToolOptions}
    />
  ) : null;

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          paddingBottom: showPrimaryToolbar ? 6 : 0,
          width: "fit-content",
          maxWidth: pixelWidth ?? "100%",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {showPrimaryToolbar ? (
          <AnnotationToolStrip
            activeToolType={activeToolType}
            onToolTypeChange={onToolTypeChange}
            toolCatalog={toolCatalog}
            optionsToggleSlot={optionsToggleButton}
            onActiveToolAnchorChange={setActiveToolAnchorX}
          />
        ) : null}
        {!showPrimaryToolbar && optionsToggleButton
          ? optionsToggleButton
          : null}
        {showSecondaryToolbar && activeToolOptions && !collapsed ? (
          <div
            style={
              showPrimaryToolbar
                ? {
                    position: "relative",
                    left:
                      activeToolAnchorX !== null
                        ? activeToolAnchorX - panelWidth / 2
                        : 0,
                    width: "max-content",
                    maxWidth: "calc(100vw - 24px)",
                  }
                : undefined
            }
          >
            <div
              ref={panelContentRef}
              style={
                showPrimaryToolbar
                  ? {
                      width: "max-content",
                      maxWidth: "calc(100vw - 24px)",
                    }
                  : undefined
              }
            >
              <AnnotationToolOptionsBox
                panelStyle={
                  showPrimaryToolbar
                    ? {
                        ...panelStyle,
                        alignSelf: "flex-start",
                        width: "max-content",
                      }
                    : panelStyle
                }
              >
                {activeToolOptions}
              </AnnotationToolOptionsBox>
            </div>
          </div>
        ) : null}
      </div>
      {showSecondaryToolbar && activeHelpKey && activeHelpContent ? (
        <AnnotationToolbarHelpOverlay
          content={activeHelpContent}
          collapsed={helpCollapsedByKey[activeHelpKey]}
          onCollapsedChange={(nextCollapsed) =>
            setHelpCollapsed(activeHelpKey, nextCollapsed)
          }
        />
      ) : null}
    </>
  );
}

export default AnnotationModeToolbar;
