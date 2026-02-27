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
  buildCustomLayer,
  syncTreesFromSource,
  STAMM_SOURCE,
} from "./tree-layer/ThreeTreeLayer";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

const STORAGE_KEY = "trees-camera";

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
        }),
      );
    };

    map.on("moveend", save);
    return () => {
      map.off("moveend", save);
    };
  }, [map]);

  return null;
}

function ThreeDTreeLayer() {
  const { map } = useLibreContext();
  const layerRef = useRef<ReturnType<typeof buildCustomLayer> | null>(null);
  const initialized = useRef(false);

  const doSync = useCallback(() => {
    if (map && layerRef.current) {
      syncTreesFromSource(map, layerRef.current);
    }
  }, [map]);

  useEffect(() => {
    if (!map || initialized.current) return;
    initialized.current = true;

    // The stamm source is added by CarmaMap's libreLayers (merged mode).
    // We must wait until that source exists before adding the 3D layer,
    // because setStyle() in merged mode would wipe anything added earlier.
    const addLayerIfReady = () => {
      if (layerRef.current) return; // already added
      if (!map.getSource(STAMM_SOURCE)) return; // source not yet merged

      const customLayer = buildCustomLayer();
      layerRef.current = customLayer;
      map.addLayer(customLayer);
    };

    const trySync = () => {
      addLayerIfReady();
      if (layerRef.current && map.getSource(STAMM_SOURCE)) {
        syncTreesFromSource(map, layerRef.current);
      }
    };

    // One-shot idle to catch the initial load, then moveend for panning
    map.once("idle", trySync);
    map.on("moveend", trySync);

    // Catch newly loaded tiles for the stamm source
    const handleSourceData = (e: { sourceId: string; isSourceLoaded: boolean }) => {
      if (e.sourceId === STAMM_SOURCE && e.isSourceLoaded) {
        trySync();
      }
    };
    map.on("sourcedata", handleSourceData);

    return () => {
      map.off("moveend", trySync);
      map.off("sourcedata", handleSourceData);

      if (map.getLayer("3d-trees")) {
        map.removeLayer("3d-trees");
      }

      layerRef.current = null;
      initialized.current = false;
    };
  }, [map, doSync]);

  return null;
}

export function Trees() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  return (
    <TopicMapContextProvider infoBoxPixelWidth={350}>
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <CameraPersistence />
              <ThreeDTreeLayer />
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
                    name: "Gebaeude",
                    style:
                      "https://tiles.cismet.de/alkis/gebaeude-only.style.json",
                  },
                  {
                    type: "vector",
                    name: "Einzelbaum Stamm",
                    style:
                      "https://tiles.cismet.de/einzelbaum_stamm/style.json",
                  },
                  {
                    type: "vector",
                    name: "Einzelbaum Umringe",
                    style:
                      "https://tiles.cismet.de/einzelbaum_umringe/style.json",
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
