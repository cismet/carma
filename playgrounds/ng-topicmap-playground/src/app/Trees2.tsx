import { useCallback, useEffect, useRef } from "react";
import {
  SelectionProvider,
  ProgressIndicator,
  useProgress,
  GazDataProvider,
} from "@carma-appframeworks/portals";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { CarmaMap } from "@carma-mapping/core";
import {
  LibreContextProvider,
  useLibreContext,
} from "@carma-mapping/engines/maplibre";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";
import Menu from "./Menu";
import {
  buildLoftLayer,
  syncLoftTreesFromSource,
  EINZELBAUMX_SOURCE,
  EINZELBAUMX_LAYER,
} from "./tree-layer/LoftTreeLayer";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

const STORAGE_KEY = "trees2-camera";

function CameraPersistence() {
  const { map } = useLibreContext();
  const restored = useRef(false);

  useEffect(() => {
    if (!map) return;

    if (!restored.current) {
      restored.current = true;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const cam = JSON.parse(saved);
          map.jumpTo({
            center: [cam.lng, cam.lat],
            zoom: cam.zoom,
            pitch: cam.pitch,
            bearing: cam.bearing,
          });
        }
      } catch {
        // ignore malformed data
      }
    }

    const save = () => {
      const center = map.getCenter();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lat: center.lat,
          lng: center.lng,
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        })
      );
    };

    map.on("moveend", save);
    return () => {
      map.off("moveend", save);
    };
  }, [map]);

  return null;
}

function LoftTreeLayer() {
  const { map } = useLibreContext();
  const layerRef = useRef<ReturnType<typeof buildLoftLayer> | null>(null);
  const initialized = useRef(false);

  const doSync = useCallback(() => {
    if (map && layerRef.current) {
      syncLoftTreesFromSource(map, layerRef.current);
    }
  }, [map]);

  useEffect(() => {
    if (!map || initialized.current) return;
    initialized.current = true;

    const setup = () => {
      if (layerRef.current) return;

      // Add einzelbaumX vector source directly (no style.json for this source)
      if (!map.getSource(EINZELBAUMX_SOURCE)) {
        map.addSource(EINZELBAUMX_SOURCE, {
          type: "vector",
          tiles: ["https://tiles.cismet.de/einzelbaumX/{z}/{x}/{y}.pbf"],
          minzoom: 9,
          maxzoom: 14,
        });

        // Hidden circle layer to trigger tile loading
        map.addLayer({
          id: "einzelbaumX-loader",
          type: "circle",
          source: EINZELBAUMX_SOURCE,
          "source-layer": EINZELBAUMX_LAYER,
          minzoom: 15,
          maxzoom: 24,
          paint: { "circle-radius": 0, "circle-opacity": 0 },
        });
      }

      const customLayer = buildLoftLayer();
      layerRef.current = customLayer;

      // Insert before the first fill-extrusion layer for correct depth
      const styleLayers = map.getStyle().layers ?? [];
      const firstExtrusion = styleLayers.find(
        (l) => l.type === "fill-extrusion"
      );
      map.addLayer(customLayer, firstExtrusion?.id);
    };

    const trySync = () => {
      setup();
      if (layerRef.current && map.getSource(EINZELBAUMX_SOURCE)) {
        syncLoftTreesFromSource(map, layerRef.current);
      }
    };

    map.once("idle", trySync);
    map.on("moveend", trySync);

    const handleSourceData = (e: {
      sourceId: string;
      isSourceLoaded: boolean;
    }) => {
      if (e.sourceId === EINZELBAUMX_SOURCE && e.isSourceLoaded) {
        trySync();
      }
    };
    map.on("sourcedata", handleSourceData);

    return () => {
      map.off("moveend", trySync);
      map.off("sourcedata", handleSourceData);

      if (map.getLayer("3d-trees-loft")) {
        map.removeLayer("3d-trees-loft");
      }
      if (map.getLayer("einzelbaumX-loader")) {
        map.removeLayer("einzelbaumX-loader");
      }
      if (map.getSource(EINZELBAUMX_SOURCE)) {
        map.removeSource(EINZELBAUMX_SOURCE);
      }

      layerRef.current = null;
      initialized.current = false;
    };
  }, [map, doSync]);

  return null;
}

export function Trees2() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  return (
    <TopicMapContextProvider infoBoxPixelWidth={350}>
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <CameraPersistence />
              <LoftTreeLayer />
              <ProgressIndicator progress={progress} show={showProgress} />
              <CarmaMap
                onClick={() => {}}
                mapEngine="maplibre"
                exposeMapToWindow
                overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                onProgressUpdate={handleProgressUpdate}
                libreLayers={[
                  {
                    type: "vector",
                    name: "Einzelbaum Umringe",
                    style:
                      "https://tiles.cismet.de/einzelbaum_umringe/style.json",
                  },
                  {
                    type: "vector",
                    name: "Gebaeude",
                    style:
                      "https://tiles.cismet.de/alkis/gebaeude-only.style.json",
                  },
                ]}
                modalMenu={<Menu />}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
