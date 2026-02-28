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
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
//  Layer visibility sync (drives map layout property)
// ─────────────────────────────────────────────────────────────

type LayerGroupName = "Einzelbaum 3D" | "Einzelbaum Umringe" | "Gebaeude";
type LayerVisibility = Record<LayerGroupName, boolean>;

const LAYER_GROUPS: {
  name: LayerGroupName;
  label: string;
  color: string;
}[] = [
  { name: "Einzelbaum 3D", label: "3D Bäume", color: "#5D4037" },
  { name: "Einzelbaum Umringe", label: "Umringe", color: "#4CAF50" },
  { name: "Gebaeude", label: "Gebäude", color: "#607D8B" },
];

const DEFAULT_VISIBILITY: LayerVisibility = {
  "Einzelbaum 3D": true,
  "Einzelbaum Umringe": true,
  Gebaeude: true,
};

function MapLayerVisibility({
  visibility,
}: {
  visibility: LayerVisibility;
}) {
  const { map } = useLibreContext();

  useEffect(() => {
    if (!map) return;

    const sync = () => {
      const style = map.getStyle();
      if (!style?.layers) return;

      for (const layer of style.layers) {
        const layerId =
          (layer as { metadata?: Record<string, unknown> }).metadata?.[
            "layer-id"
          ];
        if (typeof layerId !== "string") continue;

        const groupName = layerId as LayerGroupName;
        if (groupName in visibility) {
          const desired = visibility[groupName] ? "visible" : "none";
          const current =
            map.getLayoutProperty(layer.id, "visibility") ?? "visible";
          if (current !== desired) {
            map.setLayoutProperty(layer.id, "visibility", desired);
          }
        }
      }
    };

    sync();
  }, [map, visibility]);

  return null;
}

// ─────────────────────────────────────────────────────────────
//  Layer toggle bar UI
// ─────────────────────────────────────────────────────────────

const PILL_SHADOW =
  "0 1px 2px rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)";

function LayerToggleBar({
  visibility,
  onToggle,
}: {
  visibility: LayerVisibility;
  onToggle: (name: LayerGroupName) => void;
}) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999] flex gap-2">
      {LAYER_GROUPS.map(({ name, label, color }) => {
        const visible = visibility[name];
        return (
          <button
            key={name}
            onClick={() => onToggle(name)}
            className={`flex items-center gap-2 px-3 h-8 rounded-[10px] text-sm cursor-pointer
              ${visible ? "bg-white" : "bg-neutral-200/70 opacity-70"}`}
            style={{ boxShadow: PILL_SHADOW }}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span>{label}</span>
            <FontAwesomeIcon
              icon={visible ? faEye : faEyeSlash}
              className="text-xs text-gray-600"
            />
          </button>
        );
      })}
    </div>
  );
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
  const [layerVisibility, setLayerVisibility] =
    useState<LayerVisibility>(DEFAULT_VISIBILITY);
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  const toggleLayer = (name: LayerGroupName) => {
    setLayerVisibility((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <TopicMapContextProvider infoBoxPixelWidth={350}>
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <CameraPersistence />
              {layerVisibility["Einzelbaum 3D"] && (
                <TreeLayer useLoft={useLoft} radiusMix={radiusMix} />
              )}
              <MapLayerVisibility visibility={layerVisibility} />
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
              <LayerToggleBar
                visibility={layerVisibility}
                onToggle={toggleLayer}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
