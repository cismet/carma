import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ProgressIndicator, useProgress } from "@carma-appframeworks/portals";
import { CarmaMap, LibreLayer } from "@carma-mapping/core";
import type { AdvancedFilterState } from "@carma-mapping/components";
import type maplibregl from "maplibre-gl";
import {
  getGeoJsonSourceId,
  useLibreContext,
} from "@carma-mapping/engines/maplibre";
import { md5FetchJSON } from "@carma-commons/utils";
import Menu from "./Menu";
import TitleBox from "./TitleBox";
import { POI_LAYER_CONFIG, POI_SOURCE_ID } from "./helper/constants";
import {
  applyPoiFilter,
  extractLebenslagen,
  filterPoiFeatures,
  getAllowedKombis,
} from "./helper/filter";
import {
  readFilterFromStorage,
  writeFilterToStorage,
} from "./helper/filterStorage";
import { computePieChartStats } from "./helper/pieChartStats";
import { usePersistedStylingReady } from "./helper/usePersistedStylingReady";
import { getColorForCombination, POI_COLORS_URL } from "./helper/colors";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

export default function App() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();
  const { map, setMapStyle } = useLibreContext();
  // Mount the map only once the persisted background etc. is restored, so it
  // doesn't build the default background first and then switch
  const stylingReady = usePersistedStylingReady();

  const [poiColors, setPoiColors] = useState<Record<string, string>>();
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
      layers?.forEach((layer) => {
        if (layer.type !== "geojson") return;

        const sourceId = getGeoJsonSourceId(layer.name);
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

  useEffect(() => {
    // md5FetchJSON is typed as an array fetch; poi.farben.json is a plain object
    md5FetchJSON("poi_colors", POI_COLORS_URL).then((colors) =>
      setPoiColors(colors as unknown as Record<string, string>)
    );
  }, []);

  // Re-apply filter dynamically when the user changes filter state
  useEffect(() => {
    if (allKombisRef.current.length === 0 || lebenslagen.length === 0) return;
    if (!map) return;

    applyPoiFilter(
      map,
      allFeaturesRef.current,
      allKombisRef.current,
      filterState
    );
    // Push the filtered style into context so PreviewLibreMap picks it up
    setMapStyle(map.getStyle());

    writeFilterToStorage(filterState, lebenslagen);
  }, [map, filterState, lebenslagen, setMapStyle]);

  const { pieChartData, pieChartColors } = useMemo(
    () =>
      computePieChartStats(
        allFeatures,
        allKombisRef.current,
        filterState,
        poiColors
      ),
    [filterState, allFeatures, poiColors]
  );

  const [visiblePoiCount, setVisiblePoiCount] = useState(0);

  const filteredFeatures = useMemo(() => {
    if (allFeatures.length === 0) return [];
    return filterPoiFeatures(
      allFeatures,
      getAllowedKombis(allKombisRef.current, filterState)
    );
  }, [allFeatures, filterState]);

  // Bakes the current filter into every style rebuild (e.g. toggling
  // clustering), so neither map shows filtered-out POIs in between. Reads refs
  // to stay stable; a new function would rebuild the style.
  const filterPoiSource = useCallback(
    (sourceId: string, features: GeoJSON.Feature[]) => {
      if (sourceId !== POI_SOURCE_ID || allKombisRef.current.length === 0) {
        return features;
      }
      return filterPoiFeatures(
        features,
        getAllowedKombis(allKombisRef.current, filterStateRef.current)
      );
    },
    []
  );

  // Count filtered features inside the current viewport.
  // Uses bounds checking against React state so clustering doesn't affect the count.
  useEffect(() => {
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
  }, [map, filteredFeatures]);

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
      {stylingReady && (
        <CarmaMap
          appKey="stadtplan"
          mapEngine="maplibre"
          exposeMapToWindow
          overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
          onProgressUpdate={handleProgressUpdate}
          restrictCamera
          terrainControl={false}
          compassControl={false}
          libreLayers={libreLayers}
          filterFunction={handleFilter}
          geoJsonFeatureFilter={filterPoiSource}
          gazetteerInfoOnClick={false}
          gazetteerSearchPlaceholder="Wohin?"
          zoomOnSelectedFeatureClick
          modalMenu={
            <Menu
              categories={categories}
              filterState={filterState}
              onFilterStateChange={setFilterState}
              pieChartData={pieChartData}
              pieChartColors={pieChartColors}
              filteredPoiCount={filteredFeatures.length}
              visiblePoiCount={visiblePoiCount}
              totalPoiCount={allFeatures.length}
              onTitleDisplayChange={setShowFilterTitle}
              symbolColor={
                poiColors &&
                getColorForCombination(
                  "öffentliche Dienstleistungen",
                  poiColors
                )
              }
            />
          }
        />
      )}
    </>
  );
}
