import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ProgressIndicator, useProgress } from "@carma-appframeworks/portals";
import { CarmaMap } from "@carma-mapping/core";
import type { AdvancedFilterState } from "@carma-mapping/components";
import Menu from "./Menu";
import { POI_LAYER_CONFIG } from "./helper/constants";
import { applyPoiFilter, extractLebenslagen } from "./helper/filter";
import { computePieChartStats } from "./helper/pieChartStats";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

export default function App() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  const [allFeatures, setAllFeatures] = useState<any[]>([]);
  const [lebenslagen, setLebenslagen] = useState<string[]>([]);
  const [filterState, setFilterState] = useState<AdvancedFilterState>({
    positiv: [],
    negativ: [],
  });
  const allFeaturesRef = useRef<any[]>([]);
  const allKombisRef = useRef<string[]>([]);
  const filterStateRef = useRef(filterState);
  filterStateRef.current = filterState;

  // Capture original features and extract lebenslagen on first filterFunction call
  const handleFilter = useCallback(
    (map: any, layers: any) => {
      layers?.forEach((layer: any, index: number) => {
        if (layer.type !== "geojson") return;

        const sourceId = `geojson-source-${index}`;
        const styleSource = map.getStyle().sources[sourceId] as any;
        if (!styleSource?.data?.features) return;

        // Extract lebenslagen and kombi values only once
        if (allKombisRef.current.length === 0) {
          const data = extractLebenslagen(styleSource.data.features);
          allFeaturesRef.current = data.features;
          allKombisRef.current = data.kombis;
          setAllFeatures(data.features);
          setLebenslagen(data.lebenslagen);

          const initialFilter = { positiv: data.lebenslagen, negativ: [] };
          filterStateRef.current = initialFilter;
          setFilterState(initialFilter);
        }

        // Apply current filter (also handles style rebuilds)
        applyPoiFilter(
          map,
          allFeaturesRef.current,
          allKombisRef.current,
          filterStateRef.current
        );
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Re-apply filter dynamically when the user changes filter state
  useEffect(() => {
    if (allKombisRef.current.length === 0 || lebenslagen.length === 0) return;

    const map = (window as any).__carmaMap;
    if (!map) return;

    applyPoiFilter(
      map,
      allFeaturesRef.current,
      allKombisRef.current,
      filterState
    );
  }, [filterState, lebenslagen]);

  const { pieChartData, pieChartColors } = useMemo(
    () => computePieChartStats(allFeatures, allKombisRef.current, filterState),
    [filterState, allFeatures]
  );

  const filteredPoiCount = useMemo(
    () => pieChartData.reduce((sum, [, count]) => sum + count, 0),
    [pieChartData]
  );

  const categories = useMemo(
    () => lebenslagen.map((ll) => ({ key: ll, label: ll })),
    [lebenslagen]
  );

  return (
    <>
      <ProgressIndicator progress={progress} show={showProgress} />
      <CarmaMap
        onClick={() => {}}
        mapEngine="maplibre"
        exposeMapToWindow
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        onProgressUpdate={handleProgressUpdate}
        libreLayers={[POI_LAYER_CONFIG]}
        filterFunction={handleFilter}
        modalMenu={
          <Menu
            categories={categories}
            filterState={filterState}
            onFilterStateChange={setFilterState}
            pieChartData={pieChartData}
            pieChartColors={pieChartColors}
            filteredPoiCount={filteredPoiCount}
            totalPoiCount={allFeatures.length}
          />
        }
      />
    </>
  );
}
