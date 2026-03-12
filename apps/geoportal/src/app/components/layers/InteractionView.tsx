import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  getActiveInteractionLayerID,
  getLayers,
  getMaplibreMaps,
  setLayerFilterInfo,
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

const InteractionView = () => {
  const [filterState, setFilterState] = useState<FilterState | undefined>();
  const dispatch = useDispatch();
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
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

  const FilterComponent = useMemo(
    () =>
      layer?.filterConfig ? createFilterButtons(layer.filterConfig) : null,
    [layer?.filterConfig]
  );

  if (!layer) {
    return null;
  }

  return (
    <div className="pt-3 w-full flex items-center justify-center">
      <FilterComponent
        maplibreMap={maplibreMap}
        selectedFeature={selectedFeature}
        skipFeatureMatchCheck={isModeFeatureInfo}
        setSelectedFeature={(feature) => {
          dispatch(setSelectedFeatureAction(feature));
        }}
        onFilterChange={(info: FilterInfo, state: FilterState) => {
          setFilterState(state);
          dispatch(
            setLayerFilterInfo({
              id: layer.id,
              filterInfo: info,
            })
          );
          dispatch(triggerFeatureInfoUpdateAction());
        }}
        initialFilters={filterState}
      />
    </div>
  );
};

export default InteractionView;
