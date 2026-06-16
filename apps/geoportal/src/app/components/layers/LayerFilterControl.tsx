import { FC, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  createFilterButtons,
  FilterInfo,
  FilterState,
} from "@carma-mapping/components";
import type { FilterConfig, FilterType, Layer } from "@carma-mapping/layers";
import { FILTER_TYPES } from "@carma-mapping/layers";

import {
  getMaplibreMaps,
  setLayerFilterInfo,
  setLayerFilterState,
} from "../../store/slices/mapping";
import {
  getSelectedFeature,
  setSelectedFeature as setSelectedFeatureAction,
} from "../../store/slices/features";
import {
  getUIMode,
  triggerFeatureInfoUpdateAction,
  UIMode,
} from "../../store/slices/ui";

const FILTER_FACTORIES: Partial<
  Record<
    FilterType,
    (config: FilterConfig) => ReturnType<typeof createFilterButtons>
  >
> = {
  [FILTER_TYPES.BUTTON]: createFilterButtons,
};

export const hasLayerFilterControl = (layer?: Layer) => {
  return Boolean(
    layer?.filterConfig?.filterType &&
      FILTER_FACTORIES[layer.filterConfig.filterType]
  );
};

const LayerFilterControl: FC<{ layer: Layer }> = ({ layer }) => {
  const dispatch = useDispatch();
  const maplibreMaps = useSelector(getMaplibreMaps);
  const selectedFeature = useSelector(getSelectedFeature);
  const mode = useSelector(getUIMode);
  const isModeFeatureInfo = mode === UIMode.FEATURE_INFO;

  const FilterComponent = useMemo(() => {
    const filterConfig = layer?.filterConfig;
    if (!filterConfig?.filterType) {
      return null;
    }
    const factory = FILTER_FACTORIES[filterConfig.filterType];
    return factory ? factory(filterConfig) : null;
  }, [layer?.filterConfig]);

  if (!FilterComponent) {
    return null;
  }

  const maplibreMap = maplibreMaps
    ? maplibreMaps.find((entry) => entry.id === layer.id)?.map ?? null
    : null;

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
};

export default LayerFilterControl;
