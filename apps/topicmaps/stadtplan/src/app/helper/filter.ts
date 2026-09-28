import type { AdvancedFilterState } from "@carma-mapping/components";
import type maplibregl from "maplibre-gl";
import type { FilterSpecification } from "maplibre-gl";
import { POI_SOURCE_ID } from "./constants";

export interface LebenslagenData {
  lebenslagen: string[];
  kombis: string[];
  features: GeoJSON.Feature[];
}

export function extractLebenslagen(
  features: GeoJSON.Feature[]
): LebenslagenData {
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

  return {
    lebenslagen: Array.from(llSet).sort(),
    kombis: Array.from(kombiSet),
    features,
  };
}

export function getAllowedKombis(
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

function buildPoiFilterExpression(
  allowedKombis: string[]
): FilterSpecification {
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

export function applyPoiFilter(
  map: maplibregl.Map,
  allFeatures: GeoJSON.Feature[],
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
    if (layer.id.startsWith(POI_SOURCE_ID) && !layer.id.endsWith("-clusters")) {
      try {
        map.setFilter(layer.id, filterExpr);
      } catch (e) {
        console.error(`Error setting filter on layer ${layer.id}:`, e);
      }
    }
  }

  const source = map.getSource(POI_SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (source && "setData" in source) {
    if (isShowingAll) {
      source.setData({
        type: "FeatureCollection",
        features: allFeatures,
      });
    } else {
      const allowedSet = new Set(allowedKombis);
      source.setData({
        type: "FeatureCollection",
        features: allFeatures.filter((f) => {
          const kombi = f.properties?.kombi;
          if (typeof kombi !== "string" || kombi.length === 0) return true;
          return allowedSet.has(kombi);
        }),
      });
    }
  }
}
