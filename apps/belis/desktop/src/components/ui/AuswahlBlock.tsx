import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useMapSelection,
  useMapHighlight,
  useLibreContext,
} from "@carma-mapping/engines/maplibre";
import type { MapGeoJSONFeature, GeoJSONFeature } from "maplibre-gl";
import { SELECTED_ROW_STYLE } from "./BelisSidebar";
import type { ListItemData, SidebarFeature } from "./BelisSidebar";
import { buildFeatureKey } from "../../helper/featureKeys";

export interface AuswahlBlockProps {
  namespacedSource: string;
  adjustedHighlights: SidebarFeature[] | null;
  setAdjustedHighlights: React.Dispatch<
    React.SetStateAction<SidebarFeature[] | null>
  >;
  getListItem: (feature: SidebarFeature) => ListItemData;
  onFeatureSelect: (
    identifier: {
      source: string;
      sourceLayer?: string;
      id?: string | number;
    },
    feature: SidebarFeature
  ) => void;
  activeSourceLayers: Set<string>;
}

const toSidebarFeature = (
  f: MapGeoJSONFeature | GeoJSONFeature,
  source?: string,
  sourceLayer?: string
): SidebarFeature => {
  const feat = f as unknown as Record<string, unknown>;
  return Object.assign(f, {
    original: f,
    source: feat.source ?? source,
    sourceLayer: feat.sourceLayer ?? sourceLayer,
  }) as unknown as SidebarFeature;
};

const AuswahlBlock = ({
  namespacedSource,
  adjustedHighlights,
  setAdjustedHighlights,
  getListItem,
  onFeatureSelect,
  activeSourceLayers,
}: AuswahlBlockProps) => {
  const { selectedFeatureId, rawFeature } = useMapSelection();
  const { ensureToggledFeatures, highlightingActive } = useMapHighlight();
  const { map } = useLibreContext();

  // Track Alt key for button visibility (same pattern as BelisSidebar)
  const [altHeld, setAltHeld] = useState(false);
  const altHeldRef = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setAltHeld(true);
        altHeldRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setAltHeld(false);
        altHeldRef.current = false;
      }
    };
    const blur = () => {
      setAltHeld(false);
      altHeldRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const [auswahlFeatures, setAuswahlFeatures] = useState<{
    standort: SidebarFeature | null;
    leuchten: SidebarFeature[];
  } | null>(null);

  // Track clicks from within AuswahlBlock to avoid clearing on internal navigation
  const internalClickRef = useRef(false);

  // Auto-populate when a non-highlighted standort is selected in highlights mode.
  // Auto-close when anything else is selected (highlighted mast, leuchte, other layer, etc.)
  useEffect(() => {
    if (internalClickRef.current) {
      internalClickRef.current = false;
      return;
    }
    if (!highlightingActive) return;
    if (altHeldRef.current) {
      setAuswahlFeatures(null); // Alt+click = normal highlight toggle, close Auswahl
      return;
    }
    if (!selectedFeatureId || !rawFeature || !map) {
      setAuswahlFeatures(null);
      return;
    }

    const sl = rawFeature.sourceLayer ?? "";

    // Query all Leuchten for a given Standort DB id, deduplicated and sorted
    const queryLeuchtenByStandort = (standortDbId: string): SidebarFeature[] => {
      const allLeuchten = map.querySourceFeatures(namespacedSource, {
        sourceLayer: "leuchten",
      });
      const seen = new Map<string, SidebarFeature>();
      for (const l of allLeuchten) {
        if (String(l.properties?.fk_standort ?? "") !== standortDbId) continue;
        const lid = String(l.properties?.id ?? l.id ?? "");
        if (!seen.has(lid)) {
          seen.set(lid, toSidebarFeature(l, namespacedSource, "leuchten"));
        }
      }
      return [...seen.values()].sort(
        (a, b) =>
          (Number(a.properties?.leuchtennummer) || 0) -
          (Number(b.properties?.leuchtennummer) || 0)
      );
    };

    if (sl === "standorte") {
      const standortDbId = String(
        rawFeature.properties?.id ?? selectedFeatureId.id ?? ""
      );
      setAuswahlFeatures({
        standort: toSidebarFeature(rawFeature, namespacedSource, "standorte"),
        leuchten: queryLeuchtenByStandort(standortDbId),
      });
    } else if (sl === "leuchten") {
      const fkStandort = String(rawFeature.properties?.fk_standort ?? "");
      // Query the related standort so AuswahlBlock can show it when the filter is toggled on
      let standort: SidebarFeature | null = null;
      if (fkStandort) {
        const allStandorte = map.querySourceFeatures(namespacedSource, {
          sourceLayer: "standorte",
        });
        const match = allStandorte.find(
          (s) => String(s.properties?.id ?? "") === fkStandort
        );
        if (match) {
          standort = toSidebarFeature(match, namespacedSource, "standorte");
        }
      }
      setAuswahlFeatures({
        standort,
        leuchten: fkStandort
          ? queryLeuchtenByStandort(fkStandort)
          : [toSidebarFeature(rawFeature, namespacedSource, "leuchten")],
      });
    } else {
      setAuswahlFeatures(null);
    }
  }, [
    selectedFeatureId,
    rawFeature,
    map,
    highlightingActive,
    namespacedSource,
  ]);

  // Auto-clear when leaving highlights mode
  useEffect(() => {
    if (!highlightingActive) {
      setAuswahlFeatures(null);
    }
  }, [highlightingActive]);

  // Auto-clear when all relevant source layers are filtered out
  useEffect(() => {
    if (!auswahlFeatures) return;
    const showStandort =
      auswahlFeatures.standort && activeSourceLayers.has("standorte");
    const showLeuchten =
      auswahlFeatures.leuchten.length > 0 && activeSourceLayers.has("leuchten");
    if (!showStandort && !showLeuchten) {
      setAuswahlFeatures(null);
    }
  }, [activeSourceLayers, auswahlFeatures]);

  // Set of keys already in highlights — used to hide + buttons
  const highlightedKeys = useMemo(() => {
    if (!adjustedHighlights) return new Set<string>();
    return new Set(adjustedHighlights.map(buildFeatureKey));
  }, [adjustedHighlights]);

  // Re-query MVT tile features by DB id to get current tile IDs, then add to highlights
  const addFeaturesToHighlights = useCallback(
    (features: SidebarFeature[]) => {
      if (!map) return;

      const toToggle: { source: string; sourceLayer: string; id: number }[] =
        [];
      const toAppend: SidebarFeature[] = [];

      for (const f of features) {
        const sl = f.sourceLayer ?? "";
        const dbId = String(f.properties?.id ?? f.id ?? "");

        // Re-query to get current MVT tile ID
        const sourceFeatures = map.querySourceFeatures(namespacedSource, {
          sourceLayer: sl,
        });
        const match = sourceFeatures.find(
          (sf) => String(sf.properties?.id ?? "") === dbId
        );

        if (match?.id != null) {
          toToggle.push({
            source: namespacedSource,
            sourceLayer: sl,
            id: match.id as number,
          });
          toAppend.push(toSidebarFeature(match, namespacedSource, sl));
        } else {
          // Fallback: use the feature as-is
          toAppend.push(f);
        }
      }

      if (toToggle.length > 0) {
        ensureToggledFeatures(toToggle, true);
      }

      setAdjustedHighlights((prev) => {
        const existing = new Set((prev ?? []).map(buildFeatureKey));
        const newItems = toAppend.filter(
          (f) => !existing.has(buildFeatureKey(f))
        );
        if (newItems.length === 0) return prev;
        return [...(prev ?? []), ...newItems];
      });
    },
    [map, namespacedSource, ensureToggledFeatures, setAdjustedHighlights]
  );

  const handleAddStandort = useCallback(() => {
    if (!auswahlFeatures) return;
    addFeaturesToHighlights([auswahlFeatures.standort]);
  }, [auswahlFeatures, addFeaturesToHighlights]);

  const handleAddStandortWithLeuchten = useCallback(() => {
    if (!auswahlFeatures) return;
    addFeaturesToHighlights([
      auswahlFeatures.standort,
      ...auswahlFeatures.leuchten,
    ]);
  }, [auswahlFeatures, addFeaturesToHighlights]);

  const handleAddLeuchte = useCallback(
    (leuchte: SidebarFeature) => {
      addFeaturesToHighlights([leuchte]);
    },
    [addFeaturesToHighlights]
  );

  if (!auswahlFeatures || !highlightingActive) return null;

  const showStandort =
    auswahlFeatures.standort != null && activeSourceLayers.has("standorte");
  const visibleLeuchten = activeSourceLayers.has("leuchten")
    ? auswahlFeatures.leuchten
    : [];

  const standortItem =
    showStandort && auswahlFeatures.standort
      ? getListItem(auswahlFeatures.standort)
      : null;
  const standortKey =
    showStandort && auswahlFeatures.standort
      ? buildFeatureKey(auswahlFeatures.standort)
      : "";
  const standortAlreadyHighlighted = standortKey
    ? highlightedKeys.has(standortKey)
    : true;
  const allAlreadyHighlighted =
    standortAlreadyHighlighted &&
    visibleLeuchten.every((l) =>
      highlightedKeys.has(buildFeatureKey(l))
    );

  const isSelected = (f: SidebarFeature) =>
    selectedFeatureId?.source === f.source &&
    selectedFeatureId?.sourceLayer === f.sourceLayer &&
    selectedFeatureId?.id === f.id;

  return (
    <div className="border-b border-gray-100">
      {/* Header */}
      <div className="text-left px-3 py-2 bg-gray-50 flex justify-between items-center border-b border-gray-200">
        <b className="text-sm">Auswahl</b>
      </div>

      <div>
        {/* Standort row */}
        {showStandort && auswahlFeatures.standort && standortItem && (
          <div
            onClick={() => {
              internalClickRef.current = true;
              onFeatureSelect(
                {
                  source: auswahlFeatures.standort!.source,
                  sourceLayer: auswahlFeatures.standort!.sourceLayer,
                  id: auswahlFeatures.standort!.id,
                },
                auswahlFeatures.standort!
              );
            }}
            className={`group relative px-3 pl-4 py-2 cursor-pointer border-b border-gray-100 ${
              standortAlreadyHighlighted ? "opacity-40" : ""
            } ${isSelected(auswahlFeatures.standort) ? SELECTED_ROW_STYLE : ""}`}
          >
            <div
              className={`transition-opacity ${
                altHeld && !standortAlreadyHighlighted
                  ? "group-hover:opacity-30"
                  : ""
              }`}
            >
              <div className="flex justify-between gap-2 overflow-hidden">
                <span className="shrink-0 whitespace-nowrap text-sm">
                  <b>{standortItem.main}</b>
                </span>
                <span className="grow text-right whitespace-nowrap text-ellipsis overflow-hidden text-sm text-gray-700">
                  {standortItem.upperright}
                </span>
              </div>
              {standortItem.subtitle && (
                <div className="text-left text-xs text-gray-500 whitespace-nowrap text-ellipsis overflow-hidden mt-0.5">
                  {standortItem.subtitle}
                </div>
              )}
            </div>
            {altHeld && !standortAlreadyHighlighted && (
              <div className="absolute inset-0 flex items-center justify-center gap-6 opacity-0 group-hover:opacity-100">
                <button
                  onClick={handleAddStandort}
                  className="text-gray-700 text-3xl font-light"
                  title="Standort hinzufügen"
                >
                  +
                </button>
                {!allAlreadyHighlighted &&
                  visibleLeuchten.length > 0 && (
                    <button
                      onClick={handleAddStandortWithLeuchten}
                      className="text-gray-700 text-3xl font-light"
                      title="Standort mit allen Leuchten hinzufügen"
                    >
                      ++
                    </button>
                  )}
              </div>
            )}
          </div>
        )}

        {/* Leuchten rows */}
        {visibleLeuchten.map((leuchte) => {
          const item = getListItem(leuchte);
          const key = buildFeatureKey(leuchte);
          const alreadyHighlighted = highlightedKeys.has(key);

          return (
            <div
              key={key}
              onClick={() => {
                internalClickRef.current = true;
                onFeatureSelect(
                  {
                    source: leuchte.source,
                    sourceLayer: leuchte.sourceLayer,
                    id: leuchte.id,
                  },
                  leuchte
                );
              }}
              className={`group relative ${showStandort ? "pl-8" : "pl-4"} pr-3 py-2 cursor-pointer border-b border-gray-100 ${
                alreadyHighlighted ? "opacity-40" : ""
              } ${isSelected(leuchte) ? SELECTED_ROW_STYLE : ""}`}
            >
              <div
                className={`transition-opacity ${
                  altHeld && !alreadyHighlighted ? "group-hover:opacity-30" : ""
                }`}
              >
                <div className="flex justify-between gap-2 overflow-hidden">
                  <span className="shrink-0 whitespace-nowrap text-sm">
                    <b>{item.main}</b>
                  </span>
                  <span className="grow text-right whitespace-nowrap text-ellipsis overflow-hidden text-sm text-gray-700">
                    {item.upperright}
                  </span>
                </div>
                {item.subtitle && (
                  <div className="text-left text-xs text-gray-500 whitespace-nowrap text-ellipsis overflow-hidden mt-0.5">
                    {item.subtitle}
                  </div>
                )}
              </div>
              {altHeld && !alreadyHighlighted && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => handleAddLeuchte(leuchte)}
                    className="text-gray-700 text-3xl font-light"
                    title="Leuchte hinzufügen"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AuswahlBlock;
