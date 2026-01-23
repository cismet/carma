import { useEffect, useState, useMemo, useRef } from "react";
import { useVisibleMapFeatures, VisibleFeature } from "@carma-mapping/utils";
import type { Map as MaplibreMap } from "maplibre-gl";

// Convert ALL CAPS to Title Case (e.g., "GROSSE FLURSTR" → "Grosse Flurstr")
// Also handles hyphens: "JOHANNES-RAU-PLATZ" → "Johannes-Rau-Platz"
const toTitleCase = (str: string): string => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("-")
    )
    .join(" ");
};

interface ListItemData {
  main: string;
  upperright: string;
  subtitle: string;
}

// Default extractors for common property patterns
const defaultListItemExtractors: Record<
  string,
  (feature: VisibleFeature) => ListItemData
> = {
  // Belis layer extractors - vector tile version (flattened properties)
  leuchten: (feature) => {
    const p = feature.properties || {};
    const leuchttyp = p.leuchtentyp || p.leuchttyp || "L";
    const nummer = p.leuchtennummer || p.lfd_nummer || "";
    const standort = p.standort_lfd_nummer || p.standort || "";
    const standortPart = standort ? `, ${standort}` : "";
    return {
      main: `${leuchttyp}-${nummer}${standortPart}`,
      upperright: toTitleCase(p.strasse || p.strassenschluessel || ""),
      subtitle: p.fabrikat || p.leuchttyp_fabrikat || "",
    };
  },
  // Belis layer extractors - nested JSON version
  tdta_leuchten: (feature) => {
    const p = feature.properties || {};
    const leuchttyp = p.fk_leuchttyp?.leuchtentyp || "L";
    const nummer = p.leuchtennummer || "0";
    const standort = p.fk_standort?.lfd_nummer
      ? `, ${p.fk_standort.lfd_nummer}`
      : "";
    return {
      main: `${leuchttyp}-${nummer}${standort}`,
      upperright: toTitleCase(p.fk_strassenschluessel?.strasse || ""),
      subtitle: p.fk_leuchttyp?.fabrikat || "-ohne Fabrikat-",
    };
  },
  tdta_standort_mast: (feature) => {
    const p = feature.properties || {};
    return {
      main: `Mast - ${p.lfd_nummer || "?"}`,
      upperright: toTitleCase(p.fk_strassenschluessel?.strasse || ""),
      subtitle: p.fk_mastart?.mastart || "-ohne Mastart-",
    };
  },
  // Vector tile version (flattened) - singular and plural
  schaltstelle: (feature) => {
    const p = feature.properties || {};
    const title = p.schaltstellen_nummer
      ? `S ${p.schaltstellen_nummer}`
      : `S ${feature.id || p.id}`;
    return {
      main: title,
      upperright: toTitleCase(p.strasse || "") || "-",
      subtitle: p.bezeichnung || p.bauart || "Schaltstelle",
    };
  },
  schaltstellen: (feature) => {
    const p = feature.properties || {};
    const title = p.schaltstellen_nummer
      ? `S ${p.schaltstellen_nummer}`
      : `S ${feature.id || p.id}`;
    return {
      main: title,
      upperright: toTitleCase(p.strasse || "") || "-",
      subtitle: p.bezeichnung || p.bauart || "Schaltstelle",
    };
  },
  // Vector tile version (flattened)
  leitungen: (feature) => {
    const p = feature.properties || {};
    const laenge = p.laenge || p.length || "";
    const laengeStr = laenge ? `${laenge}m` : "";
    return {
      main: `L-${feature.id || p.id || "?"}`,
      upperright: laengeStr,
      subtitle: p.bezeichnung || p.leitungstyp || "",
    };
  },
  // Nested JSON version
  leitung: (feature) => {
    const p = feature.properties || {};
    const aPart = p.fk_querschnitt?.groesse
      ? `, ${p.fk_querschnitt.groesse}mm²`
      : "";
    return {
      main: `L-${p.id}`,
      upperright: p.fk_leitungstyp?.bezeichnung || "Leitung",
      subtitle: aPart ? `Querschnitt${aPart}` : "",
    };
  },
  // Vector tile version (flattened)
  mauerlaschen: (feature) => {
    const p = feature.properties || {};
    return {
      main: `M-${p.laufende_nummer || feature.id || p.id || "?"}`,
      upperright: toTitleCase(p.strasse || "") || "-",
      subtitle: p.bezeichnung || p.material || "Mauerlasche",
    };
  },
  // Nested JSON version
  mauerlasche: (feature) => {
    const p = feature.properties || {};
    return {
      main: `M-${p.laufende_nummer || p.id}`,
      upperright: toTitleCase(p.fk_strassenschluessel?.strasse || "") || "-",
      subtitle: p.fk_material?.bezeichnung || "Mauerlasche",
    };
  },
  abzweigdose: (feature) => {
    const p = feature.properties || {};
    return {
      main: `AZD-${p.id}`,
      upperright: "",
      subtitle: "Abzweigdose",
    };
  },
};

// Generic fallback extractor
const genericExtractor = (feature: VisibleFeature): ListItemData => {
  const props = feature.properties || {};
  const main =
    props.name ||
    props.title ||
    props.label ||
    props.bezeichnung ||
    props.Name ||
    props.Title ||
    props.NAME ||
    props.TITLE ||
    `ID: ${feature.id || "?"}`;

  const upperrightRaw =
    props.strasse ||
    props.street ||
    props.typ ||
    props.type ||
    props.kategorie ||
    "";
  const upperright = toTitleCase(upperrightRaw);

  const subtitle =
    props.beschreibung || props.description || props.info || props.status || "";

  return { main, upperright, subtitle };
};

interface SelectedVectorObject {
  source: string;
  sourceLayer?: string;
  id?: string | number;
}

interface OnMapListProps {
  maplibreMap: MaplibreMap | null;
  selectedVectorObject?: SelectedVectorObject | null;
  setSelectedVectorObject?: (obj: SelectedVectorObject | null) => void;
  onFeatureSelect?: (feature: VisibleFeature) => void;
  visibleMapWidth: number;
  visibleMapHeight: number;
  showVisibleBoundsDebug?: boolean;
}

const OnMapList = ({
  maplibreMap,
  selectedVectorObject,
  setSelectedVectorObject,
  onFeatureSelect,
  visibleMapWidth,
  visibleMapHeight,
  showVisibleBoundsDebug = false,
}: OnMapListProps) => {
  const { features, totalCount, countsByLayer, isLoading, isOverviewMode } =
    useVisibleMapFeatures({
      maplibreMap,
      visibleMapWidth,
      visibleMapHeight,
      showDebugBounds: showVisibleBoundsDebug,
      minZoomForFullFeatures: 17,
      maxFeatures: 20000,
    });

  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const prevSelectedRef = useRef<SelectedVectorObject | null>(null);

  // Sync feature states on map when selection changes (from any source)
  useEffect(() => {
    if (!maplibreMap) return;

    const prev = prevSelectedRef.current;
    const curr = selectedVectorObject;

    // Clear previous selection's feature state
    if (prev && maplibreMap.getSource(prev.source)) {
      if (
        !curr ||
        prev.source !== curr.source ||
        prev.sourceLayer !== curr.sourceLayer ||
        prev.id !== curr.id
      ) {
        try {
          maplibreMap.setFeatureState(
            {
              source: prev.source,
              sourceLayer: prev.sourceLayer,
              id: prev.id,
            },
            { selected: false }
          );
        } catch (e) {
          // Ignore errors
        }
      }
    }

    // Set current selection's feature state
    if (curr && maplibreMap.getSource(curr.source)) {
      try {
        maplibreMap.setFeatureState(
          {
            source: curr.source,
            sourceLayer: curr.sourceLayer,
            id: curr.id,
          },
          { selected: true }
        );
      } catch (e) {
        // Ignore errors
      }
    }

    prevSelectedRef.current = curr || null;
  }, [selectedVectorObject, maplibreMap]);

  // When selection changes, expand group and scroll into view
  useEffect(() => {
    if (!selectedVectorObject) return;

    const selectedFeature = features.find(
      (f) =>
        f.source === selectedVectorObject.source &&
        f.sourceLayer === selectedVectorObject.sourceLayer &&
        f.id === selectedVectorObject.id
    );

    if (selectedFeature) {
      const groupKey =
        selectedFeature.sourceLayer || selectedFeature.source || "Sonstige";

      if (collapsedGroups[groupKey]) {
        setCollapsedGroups((prev) => ({
          ...prev,
          [groupKey]: false,
        }));
      }

      setTimeout(() => {
        if (selectedItemRef.current) {
          selectedItemRef.current.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }
      }, 100);
    }
  }, [selectedVectorObject, features, collapsedGroups]);

  // Group features by sourceLayer
  const groupedFeatures = useMemo(() => {
    const groups: Record<string, { items: VisibleFeature[]; total: number }> =
      {};
    for (const [layerKey, count] of Object.entries(countsByLayer)) {
      groups[layerKey] = { items: [], total: count };
    }
    features.forEach((feature) => {
      const groupKey = feature.sourceLayer || feature.source || "Sonstige";
      if (!groups[groupKey]) {
        groups[groupKey] = { items: [], total: 0 };
      }
      groups[groupKey].items.push(feature);
    });
    return groups;
  }, [features, countsByLayer]);

  // Get list item data using layer-specific extractors
  const getListItem = (feature: VisibleFeature): ListItemData => {
    const layerKey = feature.sourceLayer || feature.source || "";
    const extractor =
      defaultListItemExtractors[layerKey] ||
      defaultListItemExtractors[layerKey.toLowerCase()] ||
      genericExtractor;
    return extractor(feature);
  };

  const handleFeatureClick = (feature: VisibleFeature) => {
    if (!maplibreMap) return;

    const selectionObj: SelectedVectorObject = {
      source: feature.source,
      sourceLayer: feature.sourceLayer,
      id: feature.id,
    };

    setSelectedVectorObject?.(selectionObj);
    onFeatureSelect?.(feature);
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const isFeatureSelected = (feature: VisibleFeature): boolean => {
    return (
      !!selectedVectorObject &&
      selectedVectorObject.source === feature.source &&
      selectedVectorObject.sourceLayer === feature.sourceLayer &&
      selectedVectorObject.id === feature.id
    );
  };

  return (
    <div className="w-[300px] h-full bg-white border-r border-gray-300 flex flex-col overflow-hidden z-[1000] shrink-0">
      <div className="px-3 py-2 border-b border-gray-300 bg-gray-50 font-bold text-sm flex justify-between items-center">
        <span>Objekte ({totalCount})</span>
        {isLoading && <span className="text-xs text-gray-500">...</span>}
        {isOverviewMode && !isLoading && (
          <span className="text-[10px] text-gray-400">zoom in</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {totalCount === 0 && !isLoading ? (
          <div className="p-4 text-gray-500 text-center text-sm">
            {maplibreMap
              ? "Keine Objekte im aktuellen Kartenausschnitt"
              : "Karte wird geladen..."}
          </div>
        ) : (
          <div>
            {Object.entries(groupedFeatures).map(([groupKey, group]) => (
              <div key={groupKey}>
                <div
                  onClick={() => toggleGroup(groupKey)}
                  className="text-left px-3 py-2 bg-gray-50 cursor-pointer flex justify-between items-center border-b border-gray-200 hover:bg-gray-100"
                >
                  <b className="text-sm">{toTitleCase(groupKey)}</b>
                  <span className="bg-gray-500 text-white rounded-full px-2 py-0.5 text-xs font-bold">
                    {group.total}
                  </span>
                </div>

                {!isOverviewMode &&
                  !collapsedGroups[groupKey] &&
                  group.items.map((feature, index) => {
                    const listItem = getListItem(feature);
                    const selected = isFeatureSelected(feature);
                    return (
                      <div
                        key={`${feature.source}-${feature.sourceLayer}-${feature.id}-${index}`}
                        ref={selected ? selectedItemRef : null}
                        onClick={() => handleFeatureClick(feature)}
                        className={`px-3 py-2 pl-4 cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
                          selected ? "bg-blue-50" : ""
                        }`}
                      >
                        <div className="flex justify-between gap-2 overflow-hidden">
                          <span className="shrink-0 whitespace-nowrap text-sm">
                            <b>{listItem.main}</b>
                          </span>
                          <span className="grow text-right whitespace-nowrap text-ellipsis overflow-hidden text-sm text-gray-700">
                            {listItem.upperright}
                          </span>
                        </div>
                        {listItem.subtitle && (
                          <div className="text-left text-xs text-gray-500 whitespace-nowrap text-ellipsis overflow-hidden mt-0.5">
                            {listItem.subtitle}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OnMapList;
