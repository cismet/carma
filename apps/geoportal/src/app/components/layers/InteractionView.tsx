import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
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
  PoiFilterPanel,
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
import { useFilterBackground } from "./useFilterBackground";
import FilterBackdrop from "./FilterBackdrop";

const InteractionView = ({ isDragging }: { isDragging?: boolean }) => {
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

  const { validBg, filterRef, wrapperRef } = useFilterBackground(
    activeInteractionLayerID,
    isDragging
  );

  const filterType = layer?.filterConfig?.filterType;

  const FilterComponent = useMemo(
    () =>
      layer?.filterConfig && filterType !== "poi"
        ? createFilterButtons(layer.filterConfig)
        : null,
    [layer?.filterConfig, filterType]
  );

  if (!layer || !layer.filterConfig) {
    return null;
  }

  if (filterType === "poi") {
    return (
      <div ref={wrapperRef} className="relative">
        {validBg && !isDragging && <FilterBackdrop bgData={validBg} />}
        <div className="pt-3 w-full flex justify-center">
          <div
            ref={filterRef}
            style={{
              maxWidth: 700,
              background: "rgba(255, 255, 255, 0.9)",
              borderRadius: 12,
              padding: "8px 12px",
            }}
          >
            <PoiFilterPanel maplibreMap={maplibreMap} />
          </div>
        </div>
      </div>
    );
  }

  if (!FilterComponent) {
    return null;
  }

  return (
    <div ref={wrapperRef} className="relative">
      {validBg && !isDragging && <FilterBackdrop bgData={validBg} />}
      <div className="pt-3 w-full flex items-center justify-center">
        <div ref={filterRef}>
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
        </div>
      </div>
    </div>
  );
};

export default InteractionView;
