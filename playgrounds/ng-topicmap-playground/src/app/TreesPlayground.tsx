import { useEffect, useRef, useState } from "react";
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
} from "./tree-layer/ThreeTreeLayer";
import {
  buildLoftLayer,
  syncLoftTreesFromSource,
  EINZELBAUMX_SOURCE,
} from "./tree-layer/LoftTreeLayer";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

// ─────────────────────────────────────────────────────────────
//  Props
// ─────────────────────────────────────────────────────────────

export interface TreesPlaygroundProps {
  defaultUseLoft?: boolean;
}

// ─────────────────────────────────────────────────────────────
//  URL parameter helpers
// ─────────────────────────────────────────────────────────────

function parseRadiusMixFromUrl(): number {
  const params = new URLSearchParams(
    window.location.hash.split("?")[1] || ""
  );
  const raw = parseFloat(params.get("radius_mix") || "0");
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
}

// ─────────────────────────────────────────────────────────────
//  Camera persistence
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
//  Tree layer component (handles both instanced and loft modes)
// ─────────────────────────────────────────────────────────────

function TreeLayer({
  useLoft,
  radiusMix,
}: {
  useLoft: boolean;
  radiusMix: number;
}) {
  const { map } = useLibreContext();
  const layerRef = useRef<ReturnType<
    typeof buildCustomLayer | typeof buildLoftLayer
  > | null>(null);
  const modeRef = useRef<boolean>(useLoft);

  useEffect(() => {
    if (!map) return;

    const teardown = () => {
      const layerId = layerRef.current?.id;
      if (layerId && map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      layerRef.current = null;
    };

    // Teardown if mode changed
    if (modeRef.current !== useLoft && layerRef.current) {
      teardown();
    }
    modeRef.current = useLoft;

    const addLayerIfReady = () => {
      if (layerRef.current) return;
      if (!map.getSource(EINZELBAUMX_SOURCE)) return;

      const customLayer = useLoft ? buildLoftLayer() : buildCustomLayer();
      layerRef.current = customLayer;

      // Insert before the first fill-extrusion layer for correct depth
      const styleLayers = map.getStyle().layers ?? [];
      const firstExtrusion = styleLayers.find(
        (l) => l.type === "fill-extrusion"
      );
      map.addLayer(customLayer, firstExtrusion?.id);
    };

    const trySync = () => {
      addLayerIfReady();
      if (!layerRef.current || !map.getSource(EINZELBAUMX_SOURCE)) return;

      if (useLoft) {
        syncLoftTreesFromSource(
          map,
          layerRef.current as ReturnType<typeof buildLoftLayer>,
          radiusMix
        );
      } else {
        syncTreesFromSource(
          map,
          layerRef.current as ReturnType<typeof buildCustomLayer>,
          radiusMix
        );
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
      teardown();
    };
  }, [map, useLoft, radiusMix]);

  return null;
}

// ─────────────────────────────────────────────────────────────
//  Libre layers config
// ─────────────────────────────────────────────────────────────

const LIBRE_LAYERS = [
  {
    type: "vector" as const,
    name: "Einzelbaum 3D",
    style: "https://tiles.cismet.de/einzelbaumX/style.json",
  },
  {
    type: "vector" as const,
    name: "Einzelbaum Umringe",
    style: "https://tiles.cismet.de/einzelbaum_umringe/style.json",
  },
  {
    type: "vector" as const,
    name: "Gebaeude",
    style: "https://tiles.cismet.de/alkis/gebaeude-only.style.json",
  },
];

// ─────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────

export function TreesPlayground({
  defaultUseLoft = false,
}: TreesPlaygroundProps) {
  const [useLoft, setUseLoft] = useState(defaultUseLoft);
  const [radiusMix, setRadiusMix] = useState(parseRadiusMixFromUrl);
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  return (
    <TopicMapContextProvider infoBoxPixelWidth={350}>
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <CameraPersistence />
              <TreeLayer useLoft={useLoft} radiusMix={radiusMix} />
              <ProgressIndicator progress={progress} show={showProgress} />
              <CarmaMap
                onClick={() => {}}
                mapEngine="maplibre"
                exposeMapToWindow
                overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                onProgressUpdate={handleProgressUpdate}
                libreLayers={LIBRE_LAYERS}
                modalMenu={<Menu />}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
