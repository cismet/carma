import { useRef, useState, useCallback, useMemo } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { CarmaMap } from "@carma-mapping/core";
import {
  slugifyUrl,
  useMapHighlight,
  useMapHighlighting,
} from "@carma-mapping/engines/maplibre";

const STYLE_URL = "https://tiles.cismet.de/poi/styleX.json";
const ORIGINAL_SOURCE = "poi-source";
const SOURCE_LAYER = "poi";

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
  const mapRef = useRef<MaplibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const {
    highlightingActive,
    setHighlightingActive,
    highlightByProperty,
    highlightByIds,
    clearHighlights,
  } = useMapHighlight();

  const namespacedSource = `${slugifyUrl(STYLE_URL)}::${ORIGINAL_SOURCE}`;
  const highlightSources = useMemo(
    () => [{ source: namespacedSource, sourceLayers: [SOURCE_LAYER] }],
    [namespacedSource]
  );

  // The hook watches context criteria and applies feature state to the map.
  // Click-to-toggle is active when highlighting is on (no modifier needed in Stadtplan2).
  useMapHighlighting({
    map: mapReady ? mapRef.current : null,
    sources: highlightSources,
  });

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map;
    setMapReady(true);

    // Click-to-toggle individual features when highlighting is active
    map.on("click", (e) => {
      // We don't have access to highlightingActive here via closure (it would be stale),
      // so we read the global state directly from the map.
      const globalState = (
        map as unknown as { getGlobalState(): Record<string, unknown> }
      ).getGlobalState();
      if (!globalState?.highlightingEnabled) return;

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

      // Directly toggle feature state and update criteria via context
      // The useMapHighlighting hook will handle the re-apply.
    });
  }, []);

  const toggleHighlighting = useCallback(() => {
    if (highlightingActive) {
      clearHighlights();
      setHighlightingActive(false);
    } else {
      setHighlightingActive(true);
    }
  }, [highlightingActive, clearHighlights, setHighlightingActive]);

  const handleHighlightByRegex = useCallback(
    (regex: RegExp) => {
      highlightByProperty("geographicidentifier", regex);
    },
    [highlightByProperty]
  );

  const handleVariable = useCallback(() => {
    const input = prompt("Enter JSON array of IDs, e.g. [1, 2, 3]:");
    if (!input) return;
    try {
      const ids = JSON.parse(input) as (string | number)[];
      if (!Array.isArray(ids)) throw new Error("Not an array");
      highlightByIds(
        ids.map((id) => `${SOURCE_LAYER}:${id}`),
        { property: "id" }
      );
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
          title={
            highlightingActive ? "Stop Highlighting" : "Start Highlighting"
          }
        >
          {highlightingActive ? "\u25A0" : "\u2606"}
        </button>

        {highlightingActive && (
          <>
            <button
              onClick={() => handleHighlightByRegex(/Feuerwehr/i)}
              style={controlButtonStyle}
              title="Highlight Firestations"
            >
              {"\uD83D\uDE92"}
            </button>
            <button
              onClick={() => handleHighlightByRegex(/Kirche/i)}
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
              onClick={() => clearHighlights()}
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
