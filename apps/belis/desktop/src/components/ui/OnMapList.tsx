import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useVisibleMapFeatures, VisibleFeature } from "@carma-mapping/utils";
import {
  useMapSelection,
  useLibreContext,
  useMapHighlight,
} from "@carma-mapping/engines/maplibre";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";

// Convert ALL CAPS to Title Case (e.g., "GROSSE FLURSTR" -> "Grosse Flurstr")
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

// Layer-specific extractors for Belis data
const defaultListItemExtractors: Record<
  string,
  (feature: VisibleFeature) => ListItemData
> = {
  leuchten: (feature) => {
    const p = feature.properties || {};
    const typ = p.leuchtentyp || p.leuchttyp || "L";
    const nr = p.leuchtennummer || "0";
    const standort = p.lfd_nummer ? `, ${p.lfd_nummer}` : "";
    return {
      main: `${typ}-${nr}${standort}`,
      upperright: toTitleCase(p.strasse || p.strassenschluessel || ""),
      subtitle: p.fabrikat || p.leuchttyp_fabrikat || "",
    };
  },
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
  leitung: (feature) => {
    const p = feature.properties || {};
    const aPart = p.fk_querschnitt?.groesse
      ? `, ${p.fk_querschnitt.groesse}mm`
      : "";
    return {
      main: `L-${p.id}`,
      upperright: p.fk_leitungstyp?.bezeichnung || "Leitung",
      subtitle: aPart ? `Querschnitt${aPart}` : "",
    };
  },
  mauerlaschen: (feature) => {
    const p = feature.properties || {};
    return {
      main: `M-${p.laufende_nummer || feature.id || p.id || "?"}`,
      upperright: toTitleCase(p.strasse || "") || "-",
      subtitle: p.bezeichnung || p.material || "Mauerlasche",
    };
  },
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
    `ID: ${feature.id || "?"}`;

  const upperright = toTitleCase(
    props.strasse || props.street || props.typ || props.type || ""
  );

  const subtitle =
    props.beschreibung || props.description || props.info || props.status || "";

  return { main, upperright, subtitle };
};

interface OnMapListProps {
  visibleMapWidth: number;
  visibleMapHeight: number;
  activeSourceLayers: Set<string>;
}

const OnMapList = ({
  visibleMapWidth,
  visibleMapHeight,
  activeSourceLayers,
}: OnMapListProps) => {
  const { map } = useLibreContext();
  const { selectedFeatureId, selectFeature } = useMapSelection();
  const { highlightingActive, highlightVersion } = useMapHighlight();

  const showRaw = useMemo(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const param = new URLSearchParams(hashQuery || window.location.search).get("showRaw");
    if (param !== null) return param === "true";
    return window.location.hostname === "localhost";
  }, []);

  const { features, totalCount, countsByLayer, isLoading, isOverviewMode } =
    useVisibleMapFeatures({
      maplibreMap: map,
      visibleMapWidth,
      visibleMapHeight,
      maxFeatures: 2000,
      layerFilterExpressions: ["Leuchten.*-base", "Leuchten.*-icon"],
      highlightedOnly: highlightingActive,
      refreshTrigger: highlightVersion,
      showDebugBounds: showRaw,
    });

  // Filter features by active source layers
  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      const sl = f.sourceLayer || "";
      return activeSourceLayers.has(sl);
    });
  }, [features, activeSourceLayers]);

  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const selectedItemRef = useRef<HTMLDivElement>(null);
  // Store the feature ID that was selected from the list (not just a boolean)
  // This prevents scroll even if the effect runs multiple times due to filteredFeatures changing
  const selectionFromListRef = useRef<{
    source: string;
    sourceLayer?: string;
    id?: string | number;
  } | null>(null);

  // Scroll selected item into view only when selection comes from map (not list)
  useEffect(() => {
    if (!selectedFeatureId) return;

    // Skip scroll if this selection was triggered from list click
    const listSelection = selectionFromListRef.current;
    if (
      listSelection &&
      listSelection.source === selectedFeatureId.source &&
      listSelection.sourceLayer === selectedFeatureId.sourceLayer &&
      listSelection.id === selectedFeatureId.id
    ) {
      // Don't reset here - keep skipping until a different feature is selected
      return;
    }
    // Clear the ref since a different feature was selected (from map)
    selectionFromListRef.current = null;

    const selectedFeature = filteredFeatures.find(
      (f) =>
        f.source === selectedFeatureId.source &&
        f.sourceLayer === selectedFeatureId.sourceLayer &&
        f.id === selectedFeatureId.id
    );

    if (selectedFeature) {
      const groupKey =
        selectedFeature.sourceLayer || selectedFeature.source || "Sonstige";

      // Expand group if collapsed
      if (collapsedGroups[groupKey]) {
        setCollapsedGroups((prev) => ({
          ...prev,
          [groupKey]: false,
        }));
      }

      setTimeout(() => {
        selectedItemRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [selectedFeatureId, filteredFeatures, collapsedGroups]);

  // Group features by sourceLayer
  const groupedFeatures = useMemo(() => {
    const groups: Record<string, { items: VisibleFeature[]; total: number }> =
      {};
    for (const [layerKey, count] of Object.entries(countsByLayer)) {
      if (!activeSourceLayers.has(layerKey)) continue;
      groups[layerKey] = { items: [], total: count };
    }
    filteredFeatures.forEach((feature) => {
      const groupKey = feature.sourceLayer || feature.source || "Sonstige";
      if (!groups[groupKey]) {
        groups[groupKey] = { items: [], total: 0 };
      }
      groups[groupKey].items.push(feature);
    });
    // Sort items within each group by street name, then standort, then leuchtennummer
    for (const group of Object.values(groups)) {
      group.items.sort((a, b) => {
        const aStreet = (
          a.properties?.strasse ||
          a.properties?.strassenschluessel ||
          ""
        ).toLowerCase();
        const bStreet = (
          b.properties?.strasse ||
          b.properties?.strassenschluessel ||
          ""
        ).toLowerCase();
        if (aStreet !== bStreet) return aStreet.localeCompare(bStreet);
        const aStandort = Number(a.properties?.lfd_nummer) || 0;
        const bStandort = Number(b.properties?.lfd_nummer) || 0;
        if (aStandort !== bStandort) return aStandort - bStandort;
        const aLeuchte = Number(a.properties?.leuchtennummer) || 0;
        const bLeuchte = Number(b.properties?.leuchtennummer) || 0;
        return aLeuchte - bLeuchte;
      });
    }
    return groups;
  }, [filteredFeatures, countsByLayer, activeSourceLayers]);

  // Flat ordered list matching render order (for keyboard navigation)
  const flatFeatures = useMemo(() => {
    const flat: VisibleFeature[] = [];
    for (const [groupKey, group] of Object.entries(groupedFeatures)) {
      if (!isOverviewMode && !collapsedGroups[groupKey]) {
        flat.push(...group.items);
      }
    }
    return flat;
  }, [groupedFeatures, isOverviewMode, collapsedGroups]);

  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (flatFeatures.length === 0) return;

      const currentIdx = flatFeatures.findIndex((f) => isFeatureSelected(f));
      let nextIdx: number;
      if (e.key === "ArrowDown") {
        nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % flatFeatures.length;
      } else {
        nextIdx =
          currentIdx < 0
            ? flatFeatures.length - 1
            : (currentIdx - 1 + flatFeatures.length) % flatFeatures.length;
      }
      const next = flatFeatures[nextIdx];
      selectionFromListRef.current = {
        source: next.source,
        sourceLayer: next.sourceLayer,
        id: next.id,
      };
      selectFeature(
        { source: next.source, sourceLayer: next.sourceLayer, id: next.id },
        next
      );
    },
    [flatFeatures, selectFeature, selectedFeatureId]
  );

  const getListItem = (feature: VisibleFeature): ListItemData => {
    const layerKey = feature.sourceLayer || feature.source || "";
    const extractor =
      defaultListItemExtractors[layerKey] ||
      defaultListItemExtractors[layerKey.toLowerCase()] ||
      genericExtractor;
    return extractor(feature);
  };

  const handleFeatureClick = (feature: VisibleFeature) => {
    selectionFromListRef.current = {
      source: feature.source,
      sourceLayer: feature.sourceLayer,
      id: feature.id,
    };
    selectFeature(
      {
        source: feature.source,
        sourceLayer: feature.sourceLayer,
        id: feature.id,
      },
      feature
    );
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const isFeatureSelected = (feature: VisibleFeature): boolean => {
    return (
      !!selectedFeatureId &&
      selectedFeatureId.source === feature.source &&
      selectedFeatureId.sourceLayer === feature.sourceLayer &&
      selectedFeatureId.id === feature.id
    );
  };

  return (
    <div
      ref={listRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="w-[300px] h-full bg-white border-r border-gray-300 flex flex-col overflow-hidden z-[1000] shrink-0 outline-none"
    >
      <div className="px-3 py-2 border-b border-gray-300 bg-gray-50 text-sm flex justify-end items-center" style={{ minHeight: 36 }}>
        {isLoading && (
          <FontAwesomeIcon icon={faSpinner} spin className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {totalCount === 0 && !isLoading ? (
          <div className="p-4 text-gray-500 text-center text-sm">
            {map
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
                          selected
                            ? "bg-blue-50 border-l-2 border-l-blue-500"
                            : ""
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
