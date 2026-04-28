import { FC, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  RuntimeAnnotationsToolbar,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import type { FilterConfig, FilterType, Layer } from "@carma-mapping/layers";
import { FILTER_TYPES } from "@carma-mapping/layers";

import {
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  getLayers,
  getMaplibreMaps,
  setLayerFilterInfo,
  setLayerFilterState,
} from "../../store/slices/mapping";
import {
  createFilterButtons,
  FilterInfo,
  FilterState,
} from "@carma-mapping/components";
import {
  getSelectedFeature,
  setSelectedFeature as setSelectedFeatureAction,
} from "../../store/slices/features";
import {
  getUIMode,
  triggerFeatureInfoUpdateAction,
  UIMode,
} from "../../store/slices/ui";
import { useGeoportalCesiumAnnotationToolPlugins } from "../../hooks/use-geoportal-cesium-annotation-tool-plugins";
import { CESIUM_ANNOTATION_INTERACTION_ID } from "../annotations/cesium-annotations.constants";
import { useFilterBackground } from "./useFilterBackground";
import FilterBackdrop from "./FilterBackdrop";
import SaveMeasurements from "./SaveMeasurements";

const GeoportalAnnotationsToolbar: FC<{ layer: Layer }> = () => {
  const { registry } = useAnnotationsRuntime();
  const toolPlugins = useGeoportalCesiumAnnotationToolPlugins(registry.plugins);

  return <RuntimeAnnotationsToolbar plugins={toolPlugins} />;
};

const INTERACTION_COMPONENTS: Record<string, FC<{ layer: Layer }>> = {
  [CESIUM_ANNOTATION_INTERACTION_ID]: GeoportalAnnotationsToolbar,
  "save-measurements": SaveMeasurements,
};

const FILTER_FACTORIES: Partial<
  Record<
    FilterType,
    (config: FilterConfig) => ReturnType<typeof createFilterButtons>
  >
> = {
  [FILTER_TYPES.BUTTON]: createFilterButtons,
};

const InteractionView = ({ isDragging }: { isDragging?: boolean }) => {
  const dispatch = useDispatch();
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const layers = useSelector(getLayers);
  const maplibreMaps = useSelector(getMaplibreMaps);
  const selectedFeature = useSelector(getSelectedFeature);
  const mode = useSelector(getUIMode);
  const isModeFeatureInfo = mode === UIMode.FEATURE_INFO;
  const layer = layers.find((l) => l.id === activeInteractionLayerID);
  const maplibreMap = maplibreMaps
    ? maplibreMaps.find((entry) => entry.id === activeInteractionLayerID)
        ?.map ?? null
    : null;

  const { validBg, filterRef, wrapperRef } = useFilterBackground(
    activeInteractionLayerID,
    isDragging
  );

  const FilterComponent = useMemo(() => {
    const filterConfig = layer?.filterConfig;
    if (!filterConfig?.filterType) {
      return null;
    }
    const factory = FILTER_FACTORIES[filterConfig.filterType];
    return factory ? factory(filterConfig) : null;
  }, [layer?.filterConfig]);

  if (!layer) {
    return null;
  }

  const InteractionComponent = activeInteractionButtonID
    ? INTERACTION_COMPONENTS[activeInteractionButtonID]
    : undefined;

  if (!InteractionComponent && !FilterComponent) {
    return null;
  }

  const renderContent = () => {
    if (InteractionComponent) {
      return <InteractionComponent layer={layer} />;
    }

    if (FilterComponent) {
      return (
        <FilterComponent
          maplibreMap={maplibreMap}
          selectedFeature={selectedFeature}
          skipFeatureMatchCheck={isModeFeatureInfo}
          setSelectedFeature={(feature) => {
            dispatch(setSelectedFeatureAction(feature));
          }}
          onFilterChange={(info: FilterInfo, state: FilterState) => {
            dispatch(
              setLayerFilterState({
                id: layer.id,
                filterState: state,
              })
            );
            dispatch(
              setLayerFilterInfo({
                id: layer.id,
                filterInfo: info,
              })
            );
            dispatch(triggerFeatureInfoUpdateAction());
          }}
          initialFilters={layer.filterState}
        />
      );
    }

    return null;
  };

  return (
    <div ref={wrapperRef} className="relative z-[998] pointer-events-none">
      {validBg && !isDragging && (
        <FilterBackdrop
          bgData={validBg}
          showContentBackdrop={
            interactionType !== CESIUM_ANNOTATION_INTERACTION_ID
          }
        />
      )}
      <div className="pt-3 w-full flex items-center justify-center">
        <div ref={filterRef} className="relative z-10 pointer-events-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default InteractionView;
