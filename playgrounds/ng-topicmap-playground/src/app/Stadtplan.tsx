import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  SelectionProvider,
  ProgressIndicator,
  useProgress,
  GazDataProvider,
} from "@carma-appframeworks/portals";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { CarmaMap } from "@carma-mapping/core";
import { LibreContextProvider } from "@carma-mapping/engines/maplibre";
import type { AdvancedFilterState } from "@carma-mapping/components";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";
import {
  backgroundModes,
  backgroundConfigurations,
} from "./backgroundConfig";
import Menu from "./Menu";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

// Color mapping for lebenslage combinations (sorted alphabetically)
const POI_COLORS: Record<string, string> = {
  "Freizeit, Sport": "#194761",
  Mobilität: "#6BB6D7",
  "Erholung, Religion": "#094409",
  Gesellschaft: "#B0CBEC",
  Religion: "#0D0D0D",
  Gesundheit: "#CB0D0D",
  "Erholung, Freizeit": "#638555",
  Sport: "#0141CF",
  "Freizeit, Kultur": "#B27A08",
  "Gesellschaft, Kultur": "#E26B0A",
  "öffentliche Dienstleistungen": "#417DD4",
  Orientierung: "#BFBFBF",
  Bildung: "#FFC000",
  Stadtbild: "#695656",
  "Gesellschaft, öffentliche Dienstleistungen": "#569AD6",
  "Dienstleistungen, Freizeit": "#26978F",
  Dienstleistungen: "#538DD5",
  "Bildung, Freizeit": "#BBAA1E",
  Kinderbetreuung: "#00A0B0",
};

/** Deterministic fallback color for combinations not in POI_COLORS */
function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 30%, 50%)`;
}

function getColorForCombination(combination: string): string {
  return POI_COLORS[combination] || hashColor(combination);
}

const POI_SOURCE_ID = "geojson-source-0";

/** Given all unique kombi values and the current filter state, return
 *  those kombi values whose features should be visible. */
function getAllowedKombis(
  allKombis: string[],
  filterState: AdvancedFilterState
): string[] {
  return allKombis.filter((kombi) => {
    const ll = kombi.split(", ");
    for (const lebenslage of ll) {
      if (filterState.negativ.includes(lebenslage)) return false;
    }
    return ll.some((l) => filterState.positiv.includes(l));
  });
}

/** Build a MapLibre filter expression that only shows features with allowed kombi values. */
function buildPoiFilterExpression(allowedKombis: string[]): any[] {
  if (allowedKombis.length === 0) {
    return ["==", ["get", "kombi"], "___HIDE_ALL___"];
  }
  return [
    "any",
    ["!", ["has", "kombi"]],
    ["==", ["get", "kombi"], ""],
    ["match", ["get", "kombi"], allowedKombis, true, false],
  ];
}

/** Apply the current POI filter to all layers belonging to the POI source. */
function applyPoiFilter(
  map: any,
  allKombis: string[],
  filterState: AdvancedFilterState
) {
  const allowedKombis = getAllowedKombis(allKombis, filterState);
  const isShowingAll = allowedKombis.length === allKombis.length;
  const filterExpr = isShowingAll
    ? null
    : buildPoiFilterExpression(allowedKombis);

  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    if (layer.id.startsWith(POI_SOURCE_ID)) {
      try {
        map.setFilter(layer.id, filterExpr);
      } catch (e) {
        console.error(`Error setting filter on layer ${layer.id}:`, e);
      }
    }
  }
}

export function Stadtplan() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  const [allFeatures, setAllFeatures] = useState<any[]>([]);
  const [lebenslagen, setLebenslagen] = useState<string[]>([]);
  const [filterState, setFilterState] = useState<AdvancedFilterState>({
    positiv: [],
    negativ: [],
  });
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
          const features = styleSource.data.features;
          setAllFeatures(features);

          const llSet = new Set<string>();
          const kombiSet = new Set<string>();
          for (const f of features) {
            const kombi = f.properties?.kombi;
            if (typeof kombi === "string" && kombi.length > 0) {
              kombiSet.add(kombi);
              for (const ll of kombi.split(", ")) {
                llSet.add(ll);
              }
            }
          }
          const sorted = Array.from(llSet).sort();
          allKombisRef.current = Array.from(kombiSet);
          setLebenslagen(sorted);

          const initialFilter = { positiv: sorted, negativ: [] };
          filterStateRef.current = initialFilter;
          setFilterState(initialFilter);
        }

        // Apply current filter via setFilter (also handles style rebuilds)
        applyPoiFilter(map, allKombisRef.current, filterStateRef.current);
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

    applyPoiFilter(map, allKombisRef.current, filterState);
  }, [filterState, lebenslagen]);

  // Compute pie chart data from filtered features
  const { pieChartData, pieChartColors } = useMemo(() => {
    if (allFeatures.length === 0)
      return { pieChartData: [], pieChartColors: [] };

    const allowedKombis = new Set(
      getAllowedKombis(allKombisRef.current, filterState)
    );
    const stats: Record<string, number> = {};
    const colors: Record<string, string> = {};

    for (const f of allFeatures) {
      const kombi = f.properties?.kombi;
      if (typeof kombi !== "string" || kombi.length === 0) continue;
      if (!allowedKombis.has(kombi)) continue;
      const key = kombi.split(", ").slice().sort().join(", ");
      stats[key] = (stats[key] || 0) + 1;
      if (!colors[key]) {
        colors[key] = getColorForCombination(key);
      }
    }

    const data: [string, number][] = Object.entries(stats);
    const colorArr = data.map(([key]) => colors[key]);
    return { pieChartData: data, pieChartColors: colorArr };
  }, [filterState, allFeatures]);

  const categories = useMemo(
    () => lebenslagen.map((ll) => ({ key: ll, label: ll })),
    [lebenslagen]
  );

  return (
    <TopicMapContextProvider
      infoBoxPixelWidth={350}
      backgroundModes={backgroundModes}
      backgroundConfigurations={backgroundConfigurations}
    >
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <ProgressIndicator progress={progress} show={showProgress} />
              <CarmaMap
                mapEngine="maplibre"
                exposeMapToWindow
                overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                onProgressUpdate={handleProgressUpdate}
                libreLayers={[
                  {
                    type: "geojson",
                    name: "POIs",
                    data: "https://tiles.cismet.de/poi/poi.json",
                    infoboxMapping: [
                      "foto: p.foto",
                      "headerColor:p.schrift",
                      "header:p.kombi",
                      "title:p.geographicidentifier",
                      "additionalInfo:p.adresse",
                      "subtitle: p.info",
                      "url:p.url",
                      "tel:p.telefon",
                      "email:p.email",
                    ],
                  },
                ]}
                filterFunction={handleFilter}
                modalMenu={
                  <Menu
                    categories={categories}
                    filterState={filterState}
                    onFilterStateChange={setFilterState}
                    pieChartData={pieChartData}
                    pieChartColors={pieChartColors}
                  />
                }
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
