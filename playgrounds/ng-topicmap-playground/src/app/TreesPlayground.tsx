import { useCallback, useEffect, useRef, useState } from "react";
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
import { Switch } from "antd";
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

// ─────────────────────────────────────────────────────────────
//  LocalStorage helpers for tree options
// ─────────────────────────────────────────────────────────────

const TREES_LOFT_KEY = "trees-useLoft";
const TREES_RADIUS_MIX_KEY = "trees-radiusMix";
const TREES_VISIBILITY_KEY = "trees-layerVisibility";

function loadUseLoft(): boolean {
  try {
    return localStorage.getItem(TREES_LOFT_KEY) === "true";
  } catch {
    return false;
  }
}

function loadRadiusMix(): number {
  try {
    const raw = parseFloat(localStorage.getItem(TREES_RADIUS_MIX_KEY) ?? "0");
    return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  } catch {
    return 0;
  }
}

function loadLayerVisibility(): LayerVisibility {
  try {
    const stored = localStorage.getItem(TREES_VISIBILITY_KEY);
    if (stored) return JSON.parse(stored) as LayerVisibility;
  } catch {
    // ignore
  }
  return DEFAULT_VISIBILITY;
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
//  Perf data shared between TreeLayer and PerfOverlay
// ─────────────────────────────────────────────────────────────

interface TreePerfData {
  mode: "kreis" | "umring";
  treeCount: number;
  triangles: number;
  drawCalls: number;
  syncMs: number;
}

const EMPTY_PERF: TreePerfData = {
  mode: "kreis",
  treeCount: 0,
  triangles: 0,
  drawCalls: 0,
  syncMs: 0,
};

// ─────────────────────────────────────────────────────────────
//  Performance overlay (FPS + tree layer stats)
// ─────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function PerfOverlay({ perfRef }: { perfRef: React.RefObject<TreePerfData> }) {
  const { map } = useLibreContext();
  const [fps, setFps] = useState(0);
  const [perf, setPerf] = useState<TreePerfData>(EMPTY_PERF);
  const frames = useRef(0);

  const tick = useCallback(() => {
    frames.current++;
  }, []);

  useEffect(() => {
    if (!map) return;

    map.on("render", tick);
    const interval = setInterval(() => {
      const count = frames.current;
      frames.current = 0;
      if (count > 0) {
        setFps(count);
      }
      // Snapshot perf data from shared ref
      if (perfRef.current) {
        setPerf({ ...perfRef.current });
      }
    }, 1000);

    return () => {
      map.off("render", tick);
      clearInterval(interval);
    };
  }, [map, tick, perfRef]);

  const fpsColor = fps < 15 ? "#ff6b6b" : fps < 30 ? "#ffd93d" : "#6bff6b";
  const modeLabel = perf.mode === "umring" ? "Umring" : "Kreis";

  return (
    <div
      className="absolute bottom-2 right-2 z-[9999] px-2 py-1 rounded text-xs font-mono leading-snug"
      style={{
        background: "rgba(0,0,0,0.55)",
        color: "#e0e0e0",
      }}
    >
      <div>
        <span style={{ color: "#8ecaff" }}>{modeLabel}</span>
        {perf.treeCount > 0 && (
          <span> | {perf.treeCount.toLocaleString()} trees</span>
        )}
      </div>
      <div>
        <span style={{ color: fpsColor }}>{fps} fps</span>
        {perf.syncMs > 0 && (
          <span> | sync {Math.round(perf.syncMs)}ms</span>
        )}
      </div>
      {perf.treeCount > 0 && (
        <div>
          {formatCount(perf.triangles)} △ | {perf.drawCalls} draws
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Tree layer component (handles both instanced and loft modes)
// ─────────────────────────────────────────────────────────────

function TreeLayer({
  useLoft,
  radiusMix,
  perfRef,
}: {
  useLoft: boolean;
  radiusMix: number;
  perfRef: React.MutableRefObject<TreePerfData>;
}) {
  const { map } = useLibreContext();
  const layerRef = useRef<ReturnType<
    typeof buildCustomLayer | typeof buildLoftLayer
  > | null>(null);

  // Effect 1: Layer lifecycle — tear down only when mode changes or unmount
  useEffect(() => {
    if (!map) return;
    return () => {
      const layerId = layerRef.current?.id;
      if (layerId && map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      layerRef.current = null;
    };
  }, [map, useLoft]);

  // Effect 2: Data sync — re-runs on radius change without tearing down the layer
  useEffect(() => {
    if (!map) return;

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

      const t0 = performance.now();
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
      const syncMs = performance.now() - t0;

      // Populate shared perf ref from layer stats
      const layer = layerRef.current;
      if (useLoft) {
        const l = layer as ReturnType<typeof buildLoftLayer>;
        perfRef.current = {
          mode: "umring",
          treeCount: l._lastTreeCount,
          triangles: l._lastCrownTris + l._lastTrunkTris,
          drawCalls: l._lastTreeCount > 0 ? 2 : 0,
          syncMs,
        };
      } else {
        const l = layer as ReturnType<typeof buildCustomLayer>;
        perfRef.current = {
          mode: "kreis",
          treeCount: l._lastTreeCount,
          triangles: l._lastTriangles,
          drawCalls: l._lastDrawCalls,
          syncMs,
        };
      }
    };

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

    // Sync immediately if the map is already idle (e.g. after mode switch
    // without camera movement), otherwise wait for idle.
    if (map.isStyleLoaded()) {
      trySync();
    } else {
      map.once("idle", trySync);
    }

    return () => {
      map.off("moveend", trySync);
      map.off("sourcedata", handleSourceData);
      perfRef.current = EMPTY_PERF;
    };
  }, [map, useLoft, radiusMix, perfRef]);

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
  const { map, setMapStyle } = useLibreContext();
  // Remember which sub-layers were originally visible in the style JSON.
  // When hiding a group, all sub-layers go to "none".
  // When showing a group, only originally-visible sub-layers are restored.
  const originalVisibility = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!map) return;

    const capture = () => {
      const style = map.getStyle();
      if (!style?.layers) return;
      // Record the original per-sub-layer visibility from the style JSON.
      // Only capture layers with a "layer-id" metadata (user-provided layers).
      const next = new Map<string, string>();
      for (const layer of style.layers) {
        const lid = (layer as { metadata?: Record<string, unknown> }).metadata?.[
          "layer-id"
        ];
        if (typeof lid !== "string") continue;
        const vis =
          (layer as { layout?: { visibility?: string } }).layout?.visibility ??
          "visible";
        next.set(layer.id, vis);
      }
      if (next.size > 0) originalVisibility.current = next;
    };

    const sync = () => {
      const style = map.getStyle();
      if (!style?.layers || originalVisibility.current.size === 0) return;

      for (const layer of style.layers) {
        const lid = (layer as { metadata?: Record<string, unknown> }).metadata?.[
          "layer-id"
        ];
        if (typeof lid !== "string") continue;

        const groupName = lid as LayerGroupName;
        if (groupName in visibility) {
          const groupVisible = visibility[groupName];
          // When hiding: all sub-layers become "none".
          // When showing: only restore sub-layers that were originally visible.
          const originalVis =
            originalVisibility.current.get(layer.id) ?? "visible";
          const desired = groupVisible ? originalVis : "none";
          const current =
            map.getLayoutProperty(layer.id, "visibility") ?? "visible";
          if (current !== desired) {
            map.setLayoutProperty(layer.id, "visibility", desired);
          }
        }
      }
    };

    // Capture original visibilities when the merged style is applied
    const onIdle = () => {
      if (originalVisibility.current.size === 0) {
        capture();
      }
      sync();
      setMapStyle(map.getStyle());
    };
    map.once("idle", onIdle);

    // If style is already loaded, capture (only once) + sync immediately
    if (map.isStyleLoaded()) {
      if (originalVisibility.current.size === 0) {
        capture();
      }
      sync();
      setMapStyle(map.getStyle());
    }

    return () => {
      map.off("idle", onIdle);
    };
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
  useLoft,
  onLoftChange,
  radiusMix,
  onRadiusMixChange,
}: {
  visibility: LayerVisibility;
  onToggle: (name: LayerGroupName) => void;
  useLoft: boolean;
  onLoftChange: (v: boolean) => void;
  radiusMix: number;
  onRadiusMixChange: (v: number) => void;
}) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999] flex gap-2 items-start">
      {LAYER_GROUPS.map(({ name, label, color }) => {
        const visible = visibility[name];
        const is3D = name === "Einzelbaum 3D";
        return (
          <div
            key={name}
            className={`flex flex-col rounded-[10px] text-sm
              ${visible ? "bg-white" : "bg-neutral-200/70 opacity-70"}`}
            style={{ boxShadow: PILL_SHADOW }}
          >
            <div className="flex items-center gap-2 pl-3 pr-1 h-8">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span>{label}</span>
              {is3D && (
                <>
                  <span className="border-l border-gray-300 h-4" />
                  <Switch
                    size="small"
                    checked={useLoft}
                    disabled={!visible}
                    onChange={onLoftChange}
                    checkedChildren="Umring"
                    unCheckedChildren="Kreis"
                  />
                  <span className={`text-xs text-gray-500 ${!visible || useLoft ? "opacity-30" : ""}`}>Inkreis</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={radiusMix}
                    disabled={!visible || useLoft}
                    onChange={(e) =>
                      onRadiusMixChange(parseFloat(e.target.value))
                    }
                    className={`w-16 h-1 accent-[#A1887F] ${!visible || useLoft ? "opacity-30" : ""}`}
                    title={`Radius-Mix: ${radiusMix.toFixed(2)}`}
                  />
                  <span className={`text-xs text-gray-500 ${!visible || useLoft ? "opacity-30" : ""}`}>Umkreis</span>
                </>
              )}
              <button
                onClick={() => onToggle(name)}
                className="px-2 h-full flex items-center cursor-pointer hover:text-gray-500 text-gray-600"
              >
                <FontAwesomeIcon
                  icon={visible ? faEye : faEyeSlash}
                  className="text-xs"
                />
              </button>
            </div>
          </div>
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

export function TreesPlayground() {
  const [useLoft, setUseLoft] = useState(loadUseLoft);
  const [radiusMix, setRadiusMix] = useState(loadRadiusMix);
  const [layerVisibility, setLayerVisibility] =
    useState<LayerVisibility>(loadLayerVisibility);
  const { progress, showProgress, handleProgressUpdate } = useProgress();
  const perfRef = useRef<TreePerfData>(EMPTY_PERF);

  const handleLoftChange = (v: boolean) => {
    setUseLoft(v);
    localStorage.setItem(TREES_LOFT_KEY, String(v));
  };

  const handleRadiusMixChange = (v: number) => {
    setRadiusMix(v);
    localStorage.setItem(TREES_RADIUS_MIX_KEY, String(v));
  };

  const toggleLayer = (name: LayerGroupName) => {
    setLayerVisibility((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      localStorage.setItem(TREES_VISIBILITY_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <TopicMapContextProvider infoBoxPixelWidth={350}>
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <CameraPersistence />
              <PerfOverlay perfRef={perfRef} />
              {layerVisibility["Einzelbaum 3D"] && (
                <TreeLayer useLoft={useLoft} radiusMix={radiusMix} perfRef={perfRef} />
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
                useLoft={useLoft}
                onLoftChange={handleLoftChange}
                radiusMix={radiusMix}
                onRadiusMixChange={handleRadiusMixChange}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
