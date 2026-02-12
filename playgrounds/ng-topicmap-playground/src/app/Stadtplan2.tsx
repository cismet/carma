import { useRef, useState, useCallback } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { CarmaMap } from "@carma-mapping/core";
import { slugifyUrl } from "@carma-mapping/engines/maplibre";

type MapWithGlobalState = MaplibreMap & {
  setGlobalStateProperty(key: string, value: unknown): void;
};

const STYLE_URL = "https://tiles.cismet.de/poi/styleX.json";
const ORIGINAL_SOURCE = "poi-source";
const SOURCE_LAYER = "poi";

interface HighlightCriteria {
  regexes: RegExp[];
  ids: Set<string>;
  /** Individually toggled feature IDs (from click) */
  clickedIds: Set<string | number>;
}

const controlButtonStyle: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "2px solid rgba(0, 0, 0, .3)",
  borderRadius: "4px",
  width: "34px",
  height: "34px",
  textAlign: "center",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "16px",
};

const activeStyle: React.CSSProperties = {
  ...controlButtonStyle,
  backgroundColor: "#e6f0ff",
  borderColor: "#1677ff",
};

const Stadtplan2 = () => {
  const mapRef = useRef<MapWithGlobalState | null>(null);
  const [highlightingActive, setHighlightingActive] = useState(false);
  const highlightingActiveRef = useRef(false);
  const criteriaRef = useRef<HighlightCriteria>({
    regexes: [],
    ids: new Set(),
    clickedIds: new Set(),
  });
  const sourceDataListenerRef = useRef<(() => void) | null>(null);

  const namespacedSource = `${slugifyUrl(STYLE_URL)}::${ORIGINAL_SOURCE}`;

  /** Apply highlight feature-state to all currently loaded features matching criteria. */
  const applyHighlights = useCallback(
    (map: MaplibreMap) => {
      const criteria = criteriaRef.current;
      if (
        criteria.regexes.length === 0 &&
        criteria.ids.size === 0 &&
        criteria.clickedIds.size === 0
      )
        return;

      const features = map.querySourceFeatures(namespacedSource, {
        sourceLayer: SOURCE_LAYER,
      });

      for (const f of features) {
        if (f.id == null) continue;
        const geo = String(f.properties?.geographicidentifier ?? "");
        const propId = String(f.properties?.id ?? "");

        const matchesRegex = criteria.regexes.some((r) => r.test(geo));
        const matchesId = criteria.ids.has(propId);
        const matchesClick =
          criteria.clickedIds.has(f.id) || criteria.clickedIds.has(String(f.id));

        if (matchesRegex || matchesId || matchesClick) {
          map.setFeatureState(
            { source: namespacedSource, sourceLayer: SOURCE_LAYER, id: f.id },
            { highlighted: true }
          );
        }
      }
    },
    [namespacedSource]
  );

  /** Start listening for new tile data to re-apply highlights. */
  const startSourceListener = useCallback(
    (map: MaplibreMap) => {
      if (sourceDataListenerRef.current) return;
      const handler = () => applyHighlights(map);
      map.on("sourcedata", handler);
      sourceDataListenerRef.current = () => map.off("sourcedata", handler);
    },
    [applyHighlights]
  );

  const stopSourceListener = useCallback(() => {
    sourceDataListenerRef.current?.();
    sourceDataListenerRef.current = null;
  }, []);

  const handleMapReady = useCallback(
    (map: MaplibreMap) => {
      mapRef.current = map as MapWithGlobalState;

      map.on("click", (e) => {
        if (!highlightingActiveRef.current) return;

        const hits = map.queryRenderedFeatures(e.point);
        const feature = hits.find(
          (f) =>
            f.id != null &&
            f.source &&
            f.sourceLayer &&
            !f.layer.id.includes("selection") &&
            !f.layer.id.includes("background")
        );
        if (!feature) return;

        const fId = feature.id!;
        const criteria = criteriaRef.current;

        if (criteria.clickedIds.has(fId)) {
          criteria.clickedIds.delete(fId);
          map.setFeatureState(
            {
              source: feature.source,
              sourceLayer: feature.sourceLayer!,
              id: fId,
            },
            { highlighted: false }
          );
          console.log("[Stadtplan2] un-highlighted feature", fId);
        } else {
          criteria.clickedIds.add(fId);
          map.setFeatureState(
            {
              source: feature.source,
              sourceLayer: feature.sourceLayer!,
              id: fId,
            },
            { highlighted: true }
          );
          console.log("[Stadtplan2] highlighted feature", fId);
        }
      });
    },
    []
  );

  const highlightByRegex = useCallback(
    (regex: RegExp) => {
      const map = mapRef.current;
      if (!map) return;

      criteriaRef.current.regexes.push(regex);
      applyHighlights(map);
      startSourceListener(map);
      console.log("[Stadtplan2] added regex criteria:", regex);
    },
    [applyHighlights, startSourceListener]
  );

  const highlightByIds = useCallback(
    (ids: (string | number)[]) => {
      const map = mapRef.current;
      if (!map) return;

      for (const id of ids) criteriaRef.current.ids.add(String(id));
      applyHighlights(map);
      startSourceListener(map);
      console.log("[Stadtplan2] added ID criteria:", ids);
    },
    [applyHighlights, startSourceListener]
  );

  const clearHighlights = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear feature state on all loaded features
    const features = map.querySourceFeatures(namespacedSource, {
      sourceLayer: SOURCE_LAYER,
    });
    for (const f of features) {
      if (f.id == null) continue;
      map.setFeatureState(
        { source: namespacedSource, sourceLayer: SOURCE_LAYER, id: f.id },
        { highlighted: false }
      );
    }

    criteriaRef.current = { regexes: [], ids: new Set(), clickedIds: new Set() };
    stopSourceListener();
  }, [namespacedSource, stopSourceListener]);

  const toggleHighlighting = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (highlightingActive) {
      clearHighlights();
      map.setGlobalStateProperty("highlightingEnabled", false);
      highlightingActiveRef.current = false;
      setHighlightingActive(false);
    } else {
      map.setGlobalStateProperty("highlightingEnabled", true);
      highlightingActiveRef.current = true;
      setHighlightingActive(true);
    }
  }, [highlightingActive, clearHighlights]);

  const handleVariable = useCallback(() => {
    const input = prompt("Enter JSON array of IDs, e.g. [1, 2, 3]:");
    if (!input) return;
    try {
      const ids = JSON.parse(input) as (string | number)[];
      if (!Array.isArray(ids)) throw new Error("Not an array");
      highlightByIds(ids);
    } catch {
      alert("Invalid JSON. Expected an array of IDs, e.g. [1, 2, 3]");
    }
  }, [highlightByIds]);

  return (
    <div className="w-full h-screen relative">
      <CarmaMap
        mapEngine="maplibre"
        embedded
        exposeMapToWindow
        terrainControl={false}
        layerMode="imperative"
        backgroundLayers="basemap_grey@20"
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        setLibreMap={handleMapReady}
        libreLayers={[
          {
            type: "vector",
            name: "POIs",
            style: STYLE_URL,
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
      />
      <div
        style={{
          position: "absolute",
          top: "180px",
          left: "14px",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <button
          onClick={toggleHighlighting}
          style={highlightingActive ? activeStyle : controlButtonStyle}
          title={highlightingActive ? "Stop Highlighting" : "Start Highlighting"}
        >
          {highlightingActive ? "\u25A0" : "\u2606"}
        </button>

        {highlightingActive && (
          <>
            <button
              onClick={() => highlightByRegex(/Feuerwehr/i)}
              style={controlButtonStyle}
              title="Highlight Firestations"
            >
              {"\uD83D\uDE92"}
            </button>
            <button
              onClick={() => highlightByRegex(/Kirche/i)}
              style={controlButtonStyle}
              title="Highlight Churches"
            >
              {"\u26EA"}
            </button>
            <button
              onClick={handleVariable}
              style={controlButtonStyle}
              title="Highlight by IDs"
            >
              {"#"}
            </button>
            <button
              onClick={clearHighlights}
              style={controlButtonStyle}
              title="Clear Highlights"
            >
              {"\u2715"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Stadtplan2;
