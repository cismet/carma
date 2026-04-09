import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ProgressIndicator, useProgress } from "@carma-appframeworks/portals";
import { CarmaMap, LibreLayer } from "@carma-mapping/core";
import type { AdvancedFilterState } from "@carma-mapping/components";
import type maplibregl from "maplibre-gl";
import Menu from "./Menu";
import TitleBox from "./TitleBox";
import { POI_LAYER_CONFIG } from "./helper/constants";
import {
  applyPoiFilter,
  extractLebenslagen,
  getAllowedKombis,
} from "./helper/filter";
import {
  readFilterFromStorage,
  writeFilterToStorage,
} from "./helper/filterStorage";
import { computePieChartStats } from "./helper/pieChartStats";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

export default function App() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  const [allFeatures, setAllFeatures] = useState<GeoJSON.Feature[]>([]);
  const [lebenslagen, setLebenslagen] = useState<string[]>([]);
  const [filterState, setFilterState] = useState<AdvancedFilterState>({
    positiv: [],
    negativ: [],
  });
  const [showFilterTitle, setShowFilterTitle] = useState(() =>
    new URLSearchParams(window.location.hash.split("?")[1] || "").has("title")
  );

  const allFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const allKombisRef = useRef<string[]>([]);
  const filterStateRef = useRef(filterState);
  filterStateRef.current = filterState;

  // Capture original features and extract lebenslagen on first filterFunction call
  const handleFilter = useCallback(
    (map: maplibregl.Map, layers?: LibreLayer[]) => {
      layers?.forEach((layer, index) => {
        if (layer.type !== "geojson") return;

        const sourceId = `geojson-source-${index}`;
        const styleSource = map.getStyle().sources[sourceId] as
          | { data?: GeoJSON.FeatureCollection }
          | undefined;
        if (!styleSource?.data?.features) return;

        // Extract lebenslagen and kombi values only once
        if (allKombisRef.current.length === 0) {
          const data = extractLebenslagen(styleSource.data.features);
          allFeaturesRef.current = data.features;
          allKombisRef.current = data.kombis;
          setAllFeatures(data.features);
          setLebenslagen(data.lebenslagen);

          const restored = readFilterFromStorage(data.lebenslagen);
          const initialFilter = restored ?? {
            positiv: data.lebenslagen,
            negativ: [],
          };
          filterStateRef.current = initialFilter;
          setFilterState(initialFilter);
        }

        // Re-apply filter (also handles style rebuilds that recreate the source)
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

    const map = (window as unknown as { __carmaMap?: maplibregl.Map })
      .__carmaMap;
    if (!map) return;

    applyPoiFilter(
      map,
      allFeaturesRef.current,
      allKombisRef.current,
      filterState
    );

    writeFilterToStorage(filterState, lebenslagen);
  }, [filterState, lebenslagen]);

  const { pieChartData, pieChartColors } = useMemo(
    () => computePieChartStats(allFeatures, allKombisRef.current, filterState),
    [filterState, allFeatures]
  );

  const filteredPoiCount = useMemo(
    () => pieChartData.reduce((sum, [, count]) => sum + count, 0),
    [pieChartData]
  );

  const [visiblePoiCount, setVisiblePoiCount] = useState(0);

  const filteredFeatures = useMemo(() => {
    if (allFeatures.length === 0) return [];
    const allowedKombis = new Set(
      getAllowedKombis(allKombisRef.current, filterState)
    );
    return allFeatures.filter((f) => {
      const kombi = f.properties?.kombi;
      if (typeof kombi !== "string" || kombi.length === 0) return true;
      return allowedKombis.has(kombi);
    });
  }, [allFeatures, filterState]);

  // Count filtered features inside the current viewport.
  // Uses bounds checking against React state so clustering doesn't affect the count.
  useEffect(() => {
    const map = (window as unknown as { __carmaMap?: maplibregl.Map })
      .__carmaMap;
    if (!map) return;

    const updateVisibleCount = () => {
      const bounds = map.getBounds();
      let count = 0;
      for (const feature of filteredFeatures) {
        if (feature.geometry?.type !== "Point") continue;
        const [lng, lat] = feature.geometry.coordinates;
        if (bounds.contains([lng, lat])) count++;
      }
      setVisiblePoiCount(count);
    };

    map.on("moveend", updateVisibleCount);
    updateVisibleCount();

    return () => {
      map.off("moveend", updateVisibleCount);
    };
  }, [filteredFeatures]);

  const libreLayers = useMemo(() => [POI_LAYER_CONFIG], []);

  const categories = useMemo(
    () => lebenslagen.map((ll) => ({ key: ll, label: ll })),
    [lebenslagen]
  );

  return (
    <>
      <ProgressIndicator progress={progress} show={showProgress} />
      {showFilterTitle && (
        <TitleBox filterState={filterState} lebenslagen={lebenslagen} />
      )}
      <CarmaMap
        onClick={() => {}}
        mapEngine="maplibre"
        exposeMapToWindow
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        onProgressUpdate={handleProgressUpdate}
        libreLayers={libreLayers}
        filterFunction={handleFilter}
        gazetteerInfoOnClick={false}
        modalMenu={
          <Menu
            categories={categories}
            filterState={filterState}
            onFilterStateChange={setFilterState}
            pieChartData={pieChartData}
            pieChartColors={pieChartColors}
            filteredPoiCount={filteredPoiCount}
            visiblePoiCount={visiblePoiCount}
            totalPoiCount={allFeatures.length}
            onTitleDisplayChange={setShowFilterTitle}
          />
        }
      />
    </>
  );
}
