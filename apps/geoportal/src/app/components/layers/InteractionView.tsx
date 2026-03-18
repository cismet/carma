import { FC, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { DevelopmentOnlyUiBackdrop } from "@carma-commons/ui/components";
import {
  RuntimeAnnotationsToolbar,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationToolbarTool } from "@carma-mapping/annotations/ui";
import type { Layer, LayerGroup } from "@carma-mapping/layers";
import { isLayerGroup } from "@carma-mapping/layers";

import {
  changeVisibility,
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  getLayerStack,
  getLayers,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../../store/slices/mapping";
import { useGeoportalCesiumAnnotationToolPlugins } from "../../hooks/use-geoportal-cesium-annotation-tool-plugins";
import {
  CESIUM_ANNOTATION_INTERACTION_ID,
  CESIUM_ANNOTATION_SAVE_INTERACTION_ID,
} from "../annotations/cesium-annotations.constants";
import {
  AdvancedFilterPanel,
  type AdvancedFilterState,
  type AdvancedFilterCategory,
} from "@carma-mapping/components";
import {
  GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_PATTERN_OPTIONS,
  isGeoportalDevelopmentPreviewAnnotationToolId,
} from "../../helper/annotation-info-box-visual-options";
import { useFilterBackground } from "./useFilterBackground";
import FilterBackdrop from "./FilterBackdrop";
import {
  ADDON_INTERACTION_COMPONENTS,
  COMPARING_TOOLS_INTERACTION_ID,
  ComparingPanel,
  TargetAddonHost,
  resolveActiveTargetAddon,
} from "@carma-mapping/addons";
import LayerFilterControl, {
  hasLayerFilterControl,
} from "./LayerFilterControl";
import { GEOPORTAL_LAYER_TOOL_ACTION_TOOLBAR_CLASS_NAMES } from "./layer-tool-action-button-style";
import SaveMeasurements from "./SaveMeasurements";
import SaveCesiumAnnotations from "./SaveCesiumAnnotations";
import {
  ADHOC_MODEL_CONTROL_INTERACTION_ID,
  ADHOC_RENDER_STYLE_INTERACTION_ID,
  AdhocModelControlInteractionPanel,
  AdhocRenderStyleInteractionPanel,
} from "./AdhocModelLayerbarControls";
import MeasurementDrawTools from "./MeasurementDrawTools";

const renderGeoportalAnnotationToolButtonBackdrop = (
  tool: AnnotationToolbarTool
) =>
  isGeoportalDevelopmentPreviewAnnotationToolId(tool.id) ? (
    <DevelopmentOnlyUiBackdrop
      patternOptions={GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_PATTERN_OPTIONS}
    />
  ) : null;

const GeoportalAnnotationsToolbar: FC<{ layer: Layer }> = () => {
  const { registry } = useAnnotationsRuntime();
  const toolPlugins = useGeoportalCesiumAnnotationToolPlugins(registry.plugins);

  return (
    <RuntimeAnnotationsToolbar
      plugins={toolPlugins}
      classNames={GEOPORTAL_LAYER_TOOL_ACTION_TOOLBAR_CLASS_NAMES}
      disableSelectWithoutAnnotations
      tooltipPlacement="bottom"
      renderToolButtonBackdrop={renderGeoportalAnnotationToolButtonBackdrop}
    />
  );
};

/**
 * The comparison's control pane with the things it cannot do itself: dragging a
 * layer into a window switches it on when it was off, and Escape closes the
 * pane. Both are dispatches into this app's state.
 */
const ComparingInteractionPanel: FC<{ layer: Layer }> = ({ layer }) => {
  const dispatch = useDispatch();
  return (
    <ComparingPanel
      layer={layer}
      onLayerVisibilityChange={(id, visible) =>
        dispatch(changeVisibility({ id, visible }))
      }
      onClose={() => {
        dispatch(setActiveInteractionButtonID(null));
        dispatch(setActiveInteractionLayerID(null));
      }}
    />
  );
};

const INTERACTION_COMPONENTS: Record<string, FC<{ layer: Layer }>> = {
  ...ADDON_INTERACTION_COMPONENTS,
  [ADHOC_RENDER_STYLE_INTERACTION_ID]: AdhocRenderStyleInteractionPanel,
  [ADHOC_MODEL_CONTROL_INTERACTION_ID]: AdhocModelControlInteractionPanel,
  [CESIUM_ANNOTATION_INTERACTION_ID]: GeoportalAnnotationsToolbar,
  [CESIUM_ANNOTATION_SAVE_INTERACTION_ID]: SaveCesiumAnnotations,
  "save-measurements": SaveMeasurements,
  "measurement-draw-tools": MeasurementDrawTools,
  [COMPARING_TOOLS_INTERACTION_ID]: ComparingInteractionPanel,
};

export const InteractionContent: FC<{
  layer: Layer;
  showFilterLabel?: boolean;
}> = ({ layer, showFilterLabel }) => {
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);

  const InteractionComponent = activeInteractionButtonID
    ? INTERACTION_COMPONENTS[activeInteractionButtonID]
    : undefined;

  if (InteractionComponent) {
    return <InteractionComponent layer={layer} />;
  }

  if (hasLayerFilterControl(layer)) {
    return (
      <>
        {showFilterLabel && <h5 className="pl-1.5 mb-1">Filter</h5>}
        <LayerFilterControl layer={layer} />
      </>
    );
  }

  return null;
};

// Hardcoded POI test data for the AdvancedFilterPanel
const POI_CATEGORIES: AdvancedFilterCategory[] = [
  { key: "Freizeit", label: "Freizeit" },
  { key: "Sport", label: "Sport" },
  { key: "Mobilität", label: "Mobilität" },
  { key: "Religion", label: "Religion" },
  { key: "Gesundheit", label: "Gesundheit" },
  { key: "Kultur", label: "Kultur" },
  { key: "Gesellschaft", label: "Gesellschaft" },
  { key: "Bildung", label: "Bildung" },
  { key: "Kinderbetreuung", label: "Kinderbetreuung" },
  { key: "Dienstleistungen", label: "Dienstleistungen" },
  {
    key: "öffentliche Dienstleistungen",
    label: "öffentliche Dienstleistungen",
  },
  { key: "Orientierung", label: "Orientierung" },
  { key: "Stadtbild", label: "Stadtbild" },
  { key: "Erholung", label: "Erholung" },
];

// Dummy PieChart data for testing
const DUMMY_PIE_DATA: [string, number][] = [
  ["Freizeit, Sport", 42],
  ["Mobilität", 35],
  ["Religion", 28],
  ["Gesundheit", 22],
  ["Bildung", 38],
  ["Kultur", 15],
  ["Gesellschaft", 20],
  ["Kinderbetreuung", 12],
];

const DUMMY_PIE_COLORS = [
  "#194761",
  "#6BB6D7",
  "#0D0D0D",
  "#CB0D0D",
  "#FFC000",
  "#B27A08",
  "#B0CBEC",
  "#00A0B0",
];

const InteractionView = ({ isDragging }: { isDragging?: boolean }) => {
  const [advancedFilterState, setAdvancedFilterState] =
    useState<AdvancedFilterState>({
      positiv: POI_CATEGORIES.map((c) => c.key),
      negativ: [],
    });
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const layers = useSelector(getLayers);
  const layerStack = useSelector(getLayerStack);
  const layer = layers.find((l) => l.id === activeInteractionLayerID);
  const group = layerStack.find(
    (entry): entry is LayerGroup =>
      isLayerGroup(entry) && entry.id === activeInteractionLayerID
  );

  const { validBg, filterRef, wrapperRef } = useFilterBackground(
    activeInteractionLayerID,
    isDragging
  );
  const isPoiLayer = layer?.id?.toLowerCase().includes("poi");

  const hasInteractionComponent = activeInteractionButtonID
    ? Boolean(INTERACTION_COMPONENTS[activeInteractionButtonID])
    : false;
  const showFilter = hasLayerFilterControl(layer);

  const groupAddon = resolveActiveTargetAddon(group, activeInteractionButtonID);

  const content =
    group && groupAddon ? (
      <TargetAddonHost addon={groupAddon} target={group} />
    ) : layer && (hasInteractionComponent || showFilter) ? (
      <InteractionContent layer={layer} />
    ) : null;

  if (isPoiLayer) {
    return (
      <div className="pt-3 w-full">
        <AdvancedFilterPanel
          categories={POI_CATEGORIES}
          filterState={advancedFilterState}
          onFilterStateChange={setAdvancedFilterState}
          pieChartData={DUMMY_PIE_DATA}
          pieChartColors={DUMMY_PIE_COLORS}
        />
      </div>
    );
  }

  if (!content) {
    return null;
  }

  return (
    <div ref={wrapperRef} className="relative z-[998] pointer-events-none">
      {validBg && !isDragging && <FilterBackdrop bgData={validBg} />}
      <div className="pt-3 w-full flex items-center justify-center">
        <div ref={filterRef} className="relative z-10 pointer-events-auto">
          {content}
        </div>
      </div>
    </div>
  );
};

export default InteractionView;
