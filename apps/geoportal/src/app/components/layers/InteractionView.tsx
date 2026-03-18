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
  AdvancedFilterPanel,
  type AdvancedFilterState,
  type AdvancedFilterCategory,
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
  const [filterState, setFilterState] = useState<FilterState | undefined>();
  const [advancedFilterState, setAdvancedFilterState] =
    useState<AdvancedFilterState>({
      positiv: POI_CATEGORIES.map((c) => c.key),
      negativ: [],
    });
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
  const isPoiLayer = layer?.id?.toLowerCase().includes("poi");

  const FilterComponent = useMemo(
    () =>
      layer?.filterConfig ? createFilterButtons(layer.filterConfig) : null,
    [layer?.filterConfig]
  );

  if (!layer) {
    return null;
  }

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
