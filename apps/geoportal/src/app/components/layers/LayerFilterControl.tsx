import { FC, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  createFilterButtons,
  FilterInfo,
  FilterState,
  PoiFilterPanel,
} from "@carma-mapping/components";
import { useLibreContext } from "@carma-mapping/contexts";
import type {
  ButtonsFilterConfig,
  FilterType,
  Layer,
} from "@carma-mapping/layers";
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
    (config: ButtonsFilterConfig) => ReturnType<typeof createFilterButtons>
  >
> = {
  [FILTER_TYPES.BUTTON]: createFilterButtons,
};

export const hasLayerFilterControl = (layer?: Layer) => {
  const filterType = layer?.filterConfig?.filterType;
  return Boolean(
    filterType &&
      (filterType === FILTER_TYPES.POI || FILTER_FACTORIES[filterType])
  );
};

const LayerFilterControl: FC<{ layer: Layer }> = ({ layer }) => {
  const dispatch = useDispatch();
  const maplibreMaps = useSelector(getMaplibreMaps);
  const { map: libreContextMap } = useLibreContext();
  const selectedFeature = useSelector(getSelectedFeature);
  const mode = useSelector(getUIMode);
  const isModeFeatureInfo = mode === UIMode.FEATURE_INFO;

  const FilterComponent = useMemo(() => {
    const filterConfig = layer?.filterConfig;
    if (
      !filterConfig?.filterType ||
      filterConfig.filterType === FILTER_TYPES.POI
    ) {
      return null;
    }
    const factory = FILTER_FACTORIES[filterConfig.filterType];
    return factory ? factory(filterConfig) : null;
  }, [layer?.filterConfig]);

  const maplibreMap =
    libreContextMap ??
    (maplibreMaps
      ? maplibreMaps.find((entry) => entry.id === layer.id)?.map ?? null
      : null);

  if (layer.filterConfig?.filterType === FILTER_TYPES.POI) {
    return (
      <div
        style={{
          maxWidth: 700,
          background: "rgba(255, 255, 255, 0.9)",
          borderRadius: 12,
          padding: "8px 12px",
        }}
      >
        <PoiFilterPanel
          maplibreMap={maplibreMap}
          initialFilterState={layer.filterState}
          onFilterChange={(info, state) => {
            dispatch(setLayerFilterState({ id: layer.id, filterState: state }));
            dispatch(setLayerFilterInfo({ id: layer.id, filterInfo: info }));
          }}
        />
      </div>
    );
  }

  if (!FilterComponent) {
    return null;
  }

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
