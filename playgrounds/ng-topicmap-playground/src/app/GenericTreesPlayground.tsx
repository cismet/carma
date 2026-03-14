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
import type { ThreePerfData } from "@carma-mapping/engines/threejs";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { faCrosshairs, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Switch } from "antd";
import Menu from "./Menu";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

// ─────────────────────────────────────────────────────────────
//  LocalStorage helpers
// ─────────────────────────────────────────────────────────────

const TREES_LOFT_KEY = "generic-trees-useLoft";
const TREES_RADIUS_MIX_KEY = "generic-trees-radiusMix";
const TREES_VISIBILITY_KEY = "generic-trees-layerVisibility";
const TREES_CROSSHAIR_KEY = "generic-trees-crosshair";

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

const STORAGE_KEY = "generic-trees-camera";

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
//  Performance overlay
// ─────────────────────────────────────────────────────────────

const EMPTY_PERF: ThreePerfData = {
  mode: "kreis",
  treeCount: 0,
  triangles: 0,
  drawCalls: 0,
  syncMs: 0,
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function PerfOverlay({ perfRef }: { perfRef: React.RefObject<ThreePerfData> }) {
  const { map } = useLibreContext();
  const [fps, setFps] = useState(0);
  const [perf, setPerf] = useState<ThreePerfData>(EMPTY_PERF);
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
      className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[9999] px-2 py-1 rounded text-xs font-mono leading-snug"
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
        {perf.syncMs > 0 && <span> | sync {Math.round(perf.syncMs)}ms</span>}
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

function MapLayerVisibility({ visibility }: { visibility: LayerVisibility }) {
  const { map, setMapStyle } = useLibreContext();
  const originalVisibility = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!map) return;

    const capture = () => {
      const style = map.getStyle();
      if (!style?.layers) return;
      const next = new Map<string, string>();
      for (const layer of style.layers) {
        const lid = (layer as { metadata?: Record<string, unknown> })
          .metadata?.["layer-id"];
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
        const lid = (layer as { metadata?: Record<string, unknown> })
          .metadata?.["layer-id"];
        if (typeof lid !== "string") continue;

        const groupName = lid as LayerGroupName;
        if (groupName in visibility) {
          const groupVisible = visibility[groupName];
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

    const onIdle = () => {
      if (originalVisibility.current.size === 0) {
        capture();
      }
      sync();
      setMapStyle(map.getStyle());
    };
    map.once("idle", onIdle);

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
  crosshair,
  onCrosshairToggle,
}: {
  visibility: LayerVisibility;
  onToggle: (name: LayerGroupName) => void;
  useLoft: boolean;
  onLoftChange: (v: boolean) => void;
  radiusMix: number;
  onRadiusMixChange: (v: number) => void;
  crosshair: boolean;
  onCrosshairToggle: () => void;
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
            <div className="flex items-center gap-2 pl-3 pr-1 h-8 whitespace-nowrap">
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
                  <span
                    className={`text-xs text-gray-500 ${
                      !visible || useLoft ? "opacity-30" : ""
                    }`}
                  >
                    Inkreis
                  </span>
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
                    className={`w-16 h-1 accent-[#A1887F] ${
                      !visible || useLoft ? "opacity-30" : ""
                    }`}
                    title={`Radius-Mix: ${radiusMix.toFixed(2)}`}
                  />
                  <span
                    className={`text-xs text-gray-500 ${
                      !visible || useLoft ? "opacity-30" : ""
                    }`}
                  >
                    Umkreis
                  </span>
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

      {/* Crosshair debug pill */}
      <div
        className={`flex flex-col rounded-[10px] text-sm
          ${crosshair ? "bg-white" : "bg-neutral-200/70 opacity-70"}`}
        style={{ boxShadow: PILL_SHADOW }}
      >
        <div className="flex items-center gap-2 pl-3 pr-1 h-8">
          <FontAwesomeIcon
            icon={faCrosshairs}
            className="text-xs"
            style={{ color: "#e53935" }}
          />
          <span>Crosshair</span>
          <button
            onClick={onCrosshairToggle}
            className="px-2 h-full flex items-center cursor-pointer hover:text-gray-500 text-gray-600"
          >
            <FontAwesomeIcon
              icon={crosshair ? faEye : faEyeSlash}
              className="text-xs"
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function CrosshairOverlay() {
  return (
    <>
      {/* vertical line */}
      <div
        className="fixed left-1/2 top-0 w-px h-screen z-[999999]"
        style={{ background: "rgba(255,0,0,0.6)", pointerEvents: "none" }}
      />
      {/* horizontal line */}
      <div
        className="fixed top-1/2 left-0 h-px w-screen z-[999999]"
        style={{ background: "rgba(255,0,0,0.6)", pointerEvents: "none" }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Libre layers (carma3d config attached to the tree layer)
// ─────────────────────────────────────────────────────────────

const LIBRE_LAYERS = [
  {
    type: "vector" as const,
    name: "Einzelbaum 3D",
    style: "https://tiles.cismet.de/einzelbaumX/styleX.json",
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

export function GenericTreesPlayground() {
  const [useLoft, setUseLoft] = useState(loadUseLoft);
  const [radiusMix, setRadiusMix] = useState(loadRadiusMix);
  const [layerVisibility, setLayerVisibility] =
    useState<LayerVisibility>(loadLayerVisibility);
  const [crosshair, setCrosshair] = useState(() => {
    try { return localStorage.getItem(TREES_CROSSHAIR_KEY) === "true"; } catch { return false; }
  });
  const { progress, showProgress, handleProgressUpdate } = useProgress();
  const perfRef = useRef<ThreePerfData>(EMPTY_PERF);

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

  // Runtime params drive 3D layer behaviour via CarmaMap -> LibreMap -> ThreeLayerManager
  const threeRuntimeParams = {
    radiusMix,
    useLoft: useLoft ? 1 : 0,
  };

  return (
    <TopicMapContextProvider infoBoxPixelWidth={350}>
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <CameraPersistence />
              <PerfOverlay perfRef={perfRef} />
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
                threeRuntimeParams={
                  layerVisibility["Einzelbaum 3D"]
                    ? threeRuntimeParams
                    : undefined
                }
                threePerfRef={perfRef}
              />
              {crosshair && <CrosshairOverlay />}
              <LayerToggleBar
                visibility={layerVisibility}
                onToggle={toggleLayer}
                useLoft={useLoft}
                onLoftChange={handleLoftChange}
                radiusMix={radiusMix}
                onRadiusMixChange={handleRadiusMixChange}
                crosshair={crosshair}
                onCrosshairToggle={() => setCrosshair((v) => {
                  const next = !v;
                  localStorage.setItem(TREES_CROSSHAIR_KEY, String(next));
                  return next;
                })}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
