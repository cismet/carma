import { useRef, useState, useCallback } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { CarmaMap } from "@carma-mapping/core";

interface HighlightedFeature {
  source: string;
  sourceLayer: string;
  id: string | number;
}

type MapWithGlobalState = MaplibreMap & {
  setGlobalStateProperty(key: string, value: unknown): void;
};

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
  const highlightedRef = useRef<HighlightedFeature[]>([]);

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map as MapWithGlobalState;
  }, []);

  const highlightByRegex = useCallback((regex: RegExp) => {
    const map = mapRef.current;
    if (!map) return;

    const allFeatures = map.queryRenderedFeatures(undefined, {});
    const matching = allFeatures.filter(
      (f) =>
        f.id != null &&
        f.source &&
        f.sourceLayer &&
        !f.layer.id.includes("selection") &&
        !f.layer.id.includes("background") &&
        regex.test(String(f.properties?.geographicidentifier ?? ""))
    );

    // Deduplicate by id
    const seen = new Set(highlightedRef.current.map((h) => h.id));
    const added: HighlightedFeature[] = [];
    for (const f of matching) {
      if (seen.has(f.id!)) continue;
      seen.add(f.id!);
      const entry: HighlightedFeature = {
        source: f.source,
        sourceLayer: f.sourceLayer!,
        id: f.id!,
      };
      map.setFeatureState(
        { source: entry.source, sourceLayer: entry.sourceLayer, id: entry.id },
        { highlighted: true }
      );
      added.push(entry);
    }

    highlightedRef.current = [...highlightedRef.current, ...added];
    console.log(
      "[Stadtplan2] highlighted",
      added.length,
      "features matching",
      regex,
      "(total:",
      highlightedRef.current.length,
      ")"
    );
  }, []);

  const highlightByIds = useCallback((ids: (string | number)[]) => {
    const map = mapRef.current;
    if (!map) return;

    const allFeatures = map.queryRenderedFeatures(undefined, {});
    const idSet = new Set(ids.map(String));
    const matching = allFeatures.filter(
      (f) =>
        f.id != null &&
        f.source &&
        f.sourceLayer &&
        idSet.has(String(f.properties?.id ?? ""))
    );

    const seen = new Set(highlightedRef.current.map((h) => h.id));
    const added: HighlightedFeature[] = [];
    for (const f of matching) {
      if (seen.has(f.id!)) continue;
      seen.add(f.id!);
      const entry: HighlightedFeature = {
        source: f.source,
        sourceLayer: f.sourceLayer!,
        id: f.id!,
      };
      map.setFeatureState(
        { source: entry.source, sourceLayer: entry.sourceLayer, id: entry.id },
        { highlighted: true }
      );
      added.push(entry);
    }

    highlightedRef.current = [...highlightedRef.current, ...added];
    console.log(
      "[Stadtplan2] highlighted",
      added.length,
      "features by ID (total:",
      highlightedRef.current.length,
      ")"
    );
  }, []);

  const clearHighlights = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const f of highlightedRef.current) {
      map.setFeatureState(
        { source: f.source, sourceLayer: f.sourceLayer, id: f.id },
        { highlighted: false }
      );
    }
    highlightedRef.current = [];
  }, []);

  const toggleHighlighting = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (highlightingActive) {
      clearHighlights();
      map.setGlobalStateProperty("highlightingEnabled", false);
      setHighlightingActive(false);
    } else {
      map.setGlobalStateProperty("highlightingEnabled", true);
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
            style: "https://tiles.cismet.de/poi/styleX.json",
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
