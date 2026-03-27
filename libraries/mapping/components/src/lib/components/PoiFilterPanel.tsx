import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdvancedFilterPanel,
  type AdvancedFilterCategory,
  type AdvancedFilterState,
} from "./AdvancedFilterPanel";

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

function buildPoiFilterExpression(allowedKombis: string[]): any[] | null {
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

function findPoiLayerIds(map: any): string[] {
  const style = map.getStyle();
  if (!style?.layers) return [];
  return style.layers
    .filter(
      (l: any) => l["source-layer"] === "poi" && l.id !== "poi-images-selection"
    )
    .map((l: any) => l.id);
}

export interface PoiFilterPanelProps {
  maplibreMap: any;
  width?: number;
}

export const PoiFilterPanel = ({
  maplibreMap,
  width = 700,
}: PoiFilterPanelProps) => {
  const [advancedFilterState, setAdvancedFilterState] =
    useState<AdvancedFilterState>({ positiv: [], negativ: [] });
  const [categories, setCategories] = useState<AdvancedFilterCategory[]>([]);
  const [allKombis, setAllKombis] = useState<string[]>([]);
  const allKombisRef = useRef<string[]>([]);
  const initializedForMap = useRef<any>(null);

  // Extract categories from vector tile features once the map is available
  const extractCategories = useCallback((map: any) => {
    const features = map.querySourceFeatures("poi-source", {
      sourceLayer: "poi",
    });
    if (features.length === 0) return;

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

    if (llSet.size === 0) return;

    const sorted = Array.from(llSet).sort();
    const kombis = Array.from(kombiSet);
    allKombisRef.current = kombis;
    setAllKombis(kombis);
    setCategories(sorted.map((ll) => ({ key: ll, label: ll })));
    setAdvancedFilterState({ positiv: sorted, negativ: [] });
    initializedForMap.current = map;
  }, []);

  // Initialize categories when the maplibre map becomes available
  useEffect(() => {
    if (!maplibreMap || initializedForMap.current === maplibreMap) return;

    const tryExtract = () => extractCategories(maplibreMap);

    tryExtract();
    if (allKombisRef.current.length === 0) {
      maplibreMap.on("sourcedata", tryExtract);
      return () => maplibreMap.off("sourcedata", tryExtract);
    }
  }, [maplibreMap, extractCategories]);

  // Apply filter to map layers when filter state changes
  useEffect(() => {
    if (!maplibreMap || allKombisRef.current.length === 0) return;

    const allowed = getAllowedKombis(allKombisRef.current, advancedFilterState);
    const isShowingAll = allowed.length === allKombisRef.current.length;
    const filterExpr = isShowingAll ? null : buildPoiFilterExpression(allowed);

    const poiLayerIds = findPoiLayerIds(maplibreMap);
    for (const layerId of poiLayerIds) {
      try {
        maplibreMap.setFilter(layerId, filterExpr);
      } catch (e) {
        console.error(`[POI_FILTER] Error setting filter on ${layerId}:`, e);
      }
    }
  }, [advancedFilterState, maplibreMap]);

  // Compute pie chart data from the current filter state
  const { pieChartData, pieChartColors } = useMemo(() => {
    if (!maplibreMap || allKombis.length === 0)
      return { pieChartData: [], pieChartColors: [] };

    const allowedSet = new Set(
      getAllowedKombis(allKombis, advancedFilterState)
    );
    const features = maplibreMap.querySourceFeatures("poi-source", {
      sourceLayer: "poi",
    });

    // Deduplicate features by ID (vector tiles can return duplicates across tile boundaries)
    const seen = new Set<number>();
    const stats: Record<string, number> = {};
    const colors: Record<string, string> = {};
    for (const f of features) {
      if (f.id !== undefined && seen.has(f.id as number)) continue;
      if (f.id !== undefined) seen.add(f.id as number);

      const kombi = f.properties?.kombi;
      if (typeof kombi !== "string" || kombi.length === 0) continue;
      if (!allowedSet.has(kombi)) continue;
      const key = kombi.split(", ").slice().sort().join(", ");
      stats[key] = (stats[key] || 0) + 1;
      if (!colors[key]) {
        colors[key] = getColorForCombination(key);
      }
    }

    const data: [string, number][] = Object.entries(stats);
    const colorArr = data.map(([key]) => colors[key]);
    return { pieChartData: data, pieChartColors: colorArr };
  }, [advancedFilterState, maplibreMap, allKombis]);

  return (
    <AdvancedFilterPanel
      categories={categories}
      filterState={advancedFilterState}
      onFilterStateChange={setAdvancedFilterState}
      pieChartData={pieChartData}
      pieChartColors={pieChartColors}
      width={width}
    />
  );
};
