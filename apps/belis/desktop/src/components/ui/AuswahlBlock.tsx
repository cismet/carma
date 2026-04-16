import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useMapSelection,
  useMapHighlight,
  useLibreContext,
} from "@carma-mapping/engines/maplibre";
import type { MapGeoJSONFeature } from "maplibre-gl";
import type { ListItemData, SidebarFeature } from "./BelisSidebar";
import { buildFeatureKey } from "../../helper/featureKeys";

export interface AuswahlBlockProps {
  namespacedSource: string;
  adjustedHighlights: SidebarFeature[] | null;
  setAdjustedHighlights: React.Dispatch<
    React.SetStateAction<SidebarFeature[] | null>
  >;
  getListItem: (feature: SidebarFeature) => ListItemData;
}

const toSidebarFeature = (
  f: MapGeoJSONFeature,
  source?: string,
  sourceLayer?: string
): SidebarFeature =>
  Object.assign(f, {
    original: f,
    // querySourceFeatures doesn't always set source/sourceLayer — ensure they're present
    source: f.source ?? source,
    sourceLayer: f.sourceLayer ?? sourceLayer,
  }) as unknown as SidebarFeature;

const AuswahlBlock = ({
  namespacedSource,
  adjustedHighlights,
  setAdjustedHighlights,
  getListItem,
}: AuswahlBlockProps) => {
  const { selectedFeatureId, rawFeature } = useMapSelection();
  const { ensureToggledFeatures, highlightingActive } = useMapHighlight();
  const { map } = useLibreContext();

  // Track Alt key for button visibility (same pattern as BelisSidebar)
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

  const [auswahlFeatures, setAuswahlFeatures] = useState<{
    standort: SidebarFeature;
    leuchten: SidebarFeature[];
  } | null>(null);

  // Auto-populate when a non-highlighted standort is selected in highlights mode.
  // Auto-close when anything else is selected (highlighted mast, leuchte, other layer, etc.)
  useEffect(() => {
    if (!highlightingActive) return;
    if (!selectedFeatureId || !rawFeature || !map) {
      setAuswahlFeatures(null);
      return;
    }

    const sl = rawFeature.sourceLayer ?? "";
    if (sl !== "standorte") {
      setAuswahlFeatures(null);
      return;
    }

    // Check if this standort is already highlighted
    let isHighlighted = false;
    try {
      const state = map.getFeatureState({
        source: selectedFeatureId.source,
        sourceLayer: sl,
        id: selectedFeatureId.id,
      });
      isHighlighted = !!state?.highlighted;
    } catch {
      // Feature state query failed — continue anyway
    }

    if (isHighlighted) {
      setAuswahlFeatures(null);
      return;
    }

    // Query associated leuchten
    const standortDbId = String(
      rawFeature.properties?.id ?? selectedFeatureId.id ?? ""
    );
    const allLeuchten = map.querySourceFeatures(namespacedSource, {
      sourceLayer: "leuchten",
    });

    // Deduplicate by database id
    const seen = new Map<string, SidebarFeature>();
    for (const l of allLeuchten) {
      const fkStandort = String(l.properties?.fk_standort ?? "");
      if (fkStandort !== standortDbId) continue;
      const lid = String(l.properties?.id ?? l.id ?? "");
      if (!seen.has(lid)) {
        seen.set(lid, toSidebarFeature(l, namespacedSource, "leuchten"));
      }
    }

    setAuswahlFeatures({
      standort: toSidebarFeature(rawFeature, namespacedSource, "standorte"),
      leuchten: [...seen.values()].sort(
        (a, b) =>
          (Number(a.properties?.leuchtennummer) || 0) -
          (Number(b.properties?.leuchtennummer) || 0)
      ),
    });
  }, [selectedFeatureId, rawFeature, map, highlightingActive, namespacedSource]);

  // Auto-clear when leaving highlights mode
  useEffect(() => {
    if (!highlightingActive) {
      setAuswahlFeatures(null);
    }
  }, [highlightingActive]);

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

  const standortItem = getListItem(auswahlFeatures.standort);
  const standortKey = buildFeatureKey(auswahlFeatures.standort);
  const standortAlreadyHighlighted = highlightedKeys.has(standortKey);
  const allAlreadyHighlighted =
    standortAlreadyHighlighted &&
    auswahlFeatures.leuchten.every((l) =>
      highlightedKeys.has(buildFeatureKey(l))
    );

  return (
    <div className="border-b-2 border-blue-500 bg-blue-50">
      {/* Header */}
      <div className="px-3 py-1.5 bg-blue-100 border-b border-blue-200">
        <span className="text-xs font-bold text-blue-800">Auswahl</span>
      </div>

      <div className="max-h-[200px] overflow-y-auto">
        {/* Standort row */}
        <div className={`group relative px-3 py-1.5 border-b border-blue-100 ${
          standortAlreadyHighlighted ? "opacity-40" : ""
        }`}>
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
            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
              <button
                onClick={handleAddStandort}
                className="text-black text-lg font-bold"
                title="Standort hinzufügen"
              >
                +
              </button>
              {!allAlreadyHighlighted &&
                auswahlFeatures.leuchten.length > 0 && (
                  <button
                    onClick={handleAddStandortWithLeuchten}
                    className="text-black text-lg font-bold"
                    title="Standort mit allen Leuchten hinzufügen"
                  >
                    ++
                  </button>
                )}
            </div>
          )}
        </div>

        {/* Leuchten rows */}
        {auswahlFeatures.leuchten.map((leuchte) => {
          const item = getListItem(leuchte);
          const key = buildFeatureKey(leuchte);
          const alreadyHighlighted = highlightedKeys.has(key);

          return (
            <div
              key={key}
              className={`group relative pl-8 pr-3 py-1.5 border-b border-blue-100 ${
                alreadyHighlighted ? "opacity-40" : ""
              }`}
            >
              <div
                className={`transition-opacity ${
                  altHeld && !alreadyHighlighted
                    ? "group-hover:opacity-30"
                    : ""
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
                <button
                  onClick={() => handleAddLeuchte(leuchte)}
                  className="absolute inset-0 flex items-center justify-center text-black opacity-0 group-hover:opacity-100 text-lg font-bold"
                  title="Leuchte hinzufügen"
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AuswahlBlock;
