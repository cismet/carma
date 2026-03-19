import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import type { MapGeoJSONFeatureWithOriginal as SidebarFeature } from "@carma-mapping/utils";
export type { SidebarFeature };
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import toTitleCase from "../../helper/toTitleCase";

export interface ListItemData {
  main: string;
  upperright: string;
  subtitle: string;
}

// Layer-specific extractors for Belis data
const defaultListItemExtractors: Record<
  string,
  (feature: SidebarFeature) => ListItemData
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
  standorte: (feature) => {
    const p = feature.properties || {};
    return {
      main: `Standort ${p.lfd_nummer || "?"}`,
      upperright: toTitleCase(p.strasse || p.strassenschluessel || ""),
      subtitle: p.mastart || p.masttyp || "",
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
const genericExtractor = (feature: SidebarFeature): ListItemData => {
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

export interface BelisSidebarProps {
  features: SidebarFeature[];
  countsByLayer: Record<string, number>;
  totalCount: number;
  isLoading: boolean;
  isOverviewMode: boolean;
  activeSourceLayers: Set<string>;
  selectedFeatureId?: {
    source: string;
    sourceLayer?: string;
    id?: string | number;
  } | null;
  /** Database primary key of the selected feature (from tile properties).
   *  Used as fallback match when MVT feature IDs differ from database PKs. */
  selectedDatabaseId?: string | number | null;
  onFeatureSelect: (
    identifier: {
      source: string;
      sourceLayer?: string;
      id?: string | number;
    },
    feature: SidebarFeature
  ) => void;
  emptyMessage?: string;
  sidebarMode?: "fachobjekte" | "highlights" | "drafts";
  onModeChange?: (mode: "fachobjekte" | "highlights" | "drafts") => void;
  hasHighlights?: boolean;
  hasDrafts?: boolean;
  fachobjekteCount?: number;
  highlightCount?: number;
  draftsCount?: number;
  onFeatureDismiss?: (feature: SidebarFeature) => void;
  /** Optional custom extractors that take priority over the built-in ones.
   *  Used by the drafts tab to display features with database PKs instead of MVT tile IDs. */
  listItemExtractors?: Record<string, (feature: SidebarFeature) => ListItemData>;
}

const BelisSidebar = ({
  features,
  countsByLayer,
  totalCount,
  isLoading,
  isOverviewMode,
  activeSourceLayers,
  selectedFeatureId,
  selectedDatabaseId,
  onFeatureSelect,
  emptyMessage = "Keine Objekte im aktuellen Kartenausschnitt",
  sidebarMode = "fachobjekte",
  onModeChange,
  hasHighlights = false,
  hasDrafts = false,
  fachobjekteCount,
  highlightCount,
  draftsCount,
  onFeatureDismiss,
  listItemExtractors,
}: BelisSidebarProps) => {
  // Filter features by active source layers
  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      const sl = f.sourceLayer || "";
      return activeSourceLayers.has(sl);
    });
  }, [features, activeSourceLayers]);

  // Track Alt key for dismiss button visibility
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => setAltHeld(false));
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", () => setAltHeld(false));
    };
  }, []);

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
        (String(f.id) === String(selectedFeatureId.id) ||
          (selectedDatabaseId != null &&
            String(f.id) === String(selectedDatabaseId)))
    );

    if (selectedFeature) {
      const sl =
        selectedFeature.sourceLayer || selectedFeature.source || "Sonstige";
      const groupKey = MERGED_LAYERS.has(sl) ? MERGED_GROUP_KEY : sl;

      // Expand group if collapsed
      if (collapsedGroups[groupKey]) {
        setCollapsedGroups((prev) => ({
          ...prev,
          [groupKey]: false,
        }));
      }

      setTimeout(() => {
        const el = selectedItemRef.current;
        const container = listRef.current;
        if (!el || !container) return;

        // Only scroll if the item is not fully visible in the list
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const isVisible =
          elRect.top >= containerRect.top &&
          elRect.bottom <= containerRect.bottom;

        if (!isVisible) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }
  }, [
    selectedFeatureId,
    selectedDatabaseId,
    filteredFeatures,
    collapsedGroups,
  ]);

  // Layers that are merged into a single "Standorte / Leuchten" group
  const MERGED_LAYERS = new Set(["standorte", "leuchten"]);
  const MERGED_GROUP_KEY = "Standorte / Leuchten";

  // Stable group display order (unlisted groups go last, alphabetically)
  const GROUP_ORDER: Record<string, number> = {
    [MERGED_GROUP_KEY]: 0,
    leitungen: 1,
    schaltstelle: 2,
    abzweigdosen: 3,
    mauerlaschen: 4,
  };

  // Group features by sourceLayer, merging standorte + leuchten into one group
  const groupedFeatures = useMemo(() => {
    const groups: Record<
      string,
      {
        items: SidebarFeature[];
        total: number;
        label?: string;
        indentLeuchten?: boolean;
      }
    > = {};

    // Track which merged layers are active
    const activeMergedLayers = new Set<string>();

    // Initialize groups from countsByLayer
    // In overview mode, keep each layer separate (just showing counts)
    for (const [layerKey, count] of Object.entries(countsByLayer)) {
      if (!activeSourceLayers.has(layerKey)) continue;
      if (!isOverviewMode && MERGED_LAYERS.has(layerKey)) {
        activeMergedLayers.add(layerKey);
        if (!groups[MERGED_GROUP_KEY]) {
          groups[MERGED_GROUP_KEY] = { items: [], total: 0 };
        }
        groups[MERGED_GROUP_KEY].total += count;
      } else {
        groups[layerKey] = { items: [], total: count };
      }
    }

    // Set dynamic label based on which merged layers have data
    if (groups[MERGED_GROUP_KEY]) {
      const hasStandorte = activeMergedLayers.has("standorte");
      const hasLeuchten = activeMergedLayers.has("leuchten");
      if (hasStandorte && hasLeuchten) {
        groups[MERGED_GROUP_KEY].label = "Standorte / Leuchten";
        groups[MERGED_GROUP_KEY].indentLeuchten = true;
      } else if (hasStandorte) {
        groups[MERGED_GROUP_KEY].label = "Standorte";
      } else {
        groups[MERGED_GROUP_KEY].label = "Leuchten";
      }
    }

    // Distribute features into groups
    filteredFeatures.forEach((feature) => {
      const sl = feature.sourceLayer || feature.source || "Sonstige";
      const groupKey = MERGED_LAYERS.has(sl) ? MERGED_GROUP_KEY : sl;
      if (!groups[groupKey]) {
        groups[groupKey] = { items: [], total: 0 };
      }
      groups[groupKey].items.push(feature);
    });

    // Sort the merged group: group by fk_standort, standort feature first, then its leuchten by leuchtennummer
    const merged = groups[MERGED_GROUP_KEY];
    if (merged) {
      // Build standort clusters: standort ID -> { standort?, leuchten[] }
      const clusters = new Map<
        string,
        { standort: SidebarFeature | null; leuchten: SidebarFeature[] }
      >();
      for (const f of merged.items) {
        const sl = f.sourceLayer || "";
        if (sl === "standorte") {
          const key = String(f.properties?.id ?? f.id ?? "?");
          const cluster = clusters.get(key) ?? { standort: null, leuchten: [] };
          cluster.standort = f;
          clusters.set(key, cluster);
        } else {
          // leuchten: group by fk_standort
          const key = String(f.properties?.fk_standort ?? "unknown");
          const cluster = clusters.get(key) ?? { standort: null, leuchten: [] };
          cluster.leuchten.push(f);
          clusters.set(key, cluster);
        }
      }

      // Sort clusters by street, then lfd_nummer
      const sortedClusters = [...clusters.entries()].sort(([, a], [, b]) => {
        const reprA = a.standort ?? a.leuchten[0];
        const reprB = b.standort ?? b.leuchten[0];
        const streetA = (
          reprA?.properties?.strasse ||
          reprA?.properties?.strassenschluessel ||
          ""
        ).toLowerCase();
        const streetB = (
          reprB?.properties?.strasse ||
          reprB?.properties?.strassenschluessel ||
          ""
        ).toLowerCase();
        if (streetA !== streetB) return streetA.localeCompare(streetB);
        const nrA = Number(reprA?.properties?.lfd_nummer) || 0;
        const nrB = Number(reprB?.properties?.lfd_nummer) || 0;
        return nrA - nrB;
      });

      // Flatten: standort first, then leuchten sorted by leuchtennummer
      const sorted: SidebarFeature[] = [];
      for (const [, cluster] of sortedClusters) {
        if (cluster.standort) sorted.push(cluster.standort);
        cluster.leuchten.sort(
          (a, b) =>
            (Number(a.properties?.leuchtennummer) || 0) -
            (Number(b.properties?.leuchtennummer) || 0)
        );
        sorted.push(...cluster.leuchten);
      }
      merged.items = sorted;
    }

    // Sort other groups by street, standort nr, leuchtennummer
    for (const [key, group] of Object.entries(groups)) {
      if (key === MERGED_GROUP_KEY) continue;
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
  }, [filteredFeatures, countsByLayer, activeSourceLayers, isOverviewMode]);

  // Stable-ordered group entries
  const sortedGroupEntries = useMemo(() => {
    const max = Object.keys(GROUP_ORDER).length;
    return Object.entries(groupedFeatures).sort(
      ([a], [b]) => (GROUP_ORDER[a] ?? max) - (GROUP_ORDER[b] ?? max)
    );
  }, [groupedFeatures]);

  // Flat ordered list matching render order (for keyboard navigation)
  const flatFeatures = useMemo(() => {
    const flat: SidebarFeature[] = [];
    for (const [groupKey, group] of sortedGroupEntries) {
      if (!isOverviewMode && !collapsedGroups[groupKey]) {
        flat.push(...group.items);
      }
    }
    return flat;
  }, [sortedGroupEntries, isOverviewMode, collapsedGroups]);

  const isFeatureSelected = useCallback(
    (feature: SidebarFeature): boolean => {
      if (!selectedFeatureId || feature.id == null) return false;
      if (
        selectedFeatureId.source !== feature.source ||
        selectedFeatureId.sourceLayer !== feature.sourceLayer
      )
        return false;
      const fid = String(feature.id);
      // Match by MVT feature ID (works for Karte mode)
      if (selectedFeatureId.id != null && String(selectedFeatureId.id) === fid)
        return true;
      // Fallback: match by database primary key (works for Highlights mode)
      if (selectedDatabaseId != null && String(selectedDatabaseId) === fid)
        return true;
      return false;
    },
    [selectedFeatureId, selectedDatabaseId]
  );

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
      onFeatureSelect(
        { source: next.source, sourceLayer: next.sourceLayer, id: next.id },
        next
      );
    },
    [flatFeatures, onFeatureSelect, isFeatureSelected]
  );

  const getListItem = (feature: SidebarFeature): ListItemData => {
    const layerKey = feature.sourceLayer || feature.source || "";
    const extractor =
      listItemExtractors?.[layerKey] ||
      listItemExtractors?.[layerKey.toLowerCase()] ||
      defaultListItemExtractors[layerKey] ||
      defaultListItemExtractors[layerKey.toLowerCase()] ||
      genericExtractor;
    return extractor(feature);
  };

  const handleFeatureClick = (feature: SidebarFeature) => {
    selectionFromListRef.current = {
      source: feature.source,
      sourceLayer: feature.sourceLayer,
      id: feature.id,
    };
    onFeatureSelect(
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

  return (
    <div
      ref={listRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="w-[300px] h-full bg-white border-r border-gray-300 flex flex-col overflow-hidden z-[1000] shrink-0 outline-none"
    >
      <div
        className="px-3 py-2 border-b border-gray-300 bg-gray-50 text-sm flex justify-between items-center"
        style={{ minHeight: 36 }}
      >
        <div className="flex gap-1">
          <button
            onClick={() => onModeChange?.("fachobjekte")}
            className={`px-2 py-0.5 text-xs rounded ${
              sidebarMode === "fachobjekte"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300"
            }`}
          >
            Fachobjekte{fachobjekteCount != null ? ` (${fachobjekteCount})` : ""}
          </button>
          {hasHighlights && (
            <button
              onClick={() => onModeChange?.("highlights")}
              className={`px-2 py-0.5 text-xs rounded ${
                sidebarMode === "highlights"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }`}
            >
              Highlights{highlightCount != null ? ` (${highlightCount})` : ""}
            </button>
          )}
          {hasDrafts && (
            <button
              onClick={() => onModeChange?.("drafts")}
              className={`px-2 py-0.5 text-xs rounded ${
                sidebarMode === "drafts"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }`}
            >
              Entwürfe{draftsCount != null ? ` (${draftsCount})` : ""}
            </button>
          )}
        </div>
        {isLoading && (
          <FontAwesomeIcon icon={faSpinner} spin className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {totalCount === 0 && !isLoading ? (
          <div className="p-4 text-gray-500 text-center text-sm">
            {emptyMessage}
          </div>
        ) : (
          <div>
            {sortedGroupEntries.map(([groupKey, group]) => (
              <div key={groupKey}>
                <div
                  onClick={() => toggleGroup(groupKey)}
                  className="text-left px-3 py-2 bg-gray-50 cursor-pointer flex justify-between items-center border-b border-gray-200 hover:bg-gray-100"
                >
                  <b className="text-sm">
                    {group.label ?? toTitleCase(groupKey)}
                  </b>
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
                        className={`group relative px-3 py-2 cursor-pointer border-b border-gray-100 ${
                          group.indentLeuchten &&
                          feature.sourceLayer === "leuchten" &&
                          !feature.properties?._noIndent
                            ? "pl-8"
                            : "pl-4"
                        } ${
                          selected
                            ? "bg-blue-50 hover:bg-blue-50 border-l-2 border-l-blue-500"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div
                          className={`transition-opacity ${
                            highlightCount != null &&
                            highlightCount > 0 &&
                            altHeld &&
                            onFeatureDismiss
                              ? "group-hover:opacity-30"
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
                        {highlightCount != null &&
                          highlightCount > 0 &&
                          altHeld &&
                          onFeatureDismiss && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onFeatureDismiss(feature);
                              }}
                              className="absolute inset-0 flex items-center justify-center text-black opacity-0 group-hover:opacity-100 text-lg font-bold"
                              title="Hervorhebung entfernen"
                            >
                              ✕
                            </button>
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

export default BelisSidebar;
