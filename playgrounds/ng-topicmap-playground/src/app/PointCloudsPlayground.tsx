import { useCallback, useEffect, useRef, useState } from "react";
import {
  SelectionProvider,
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
import {
  faEye,
  faEyeSlash,
  faSpinner,
  faCheck,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Menu from "./Menu";
import { PointCloudLayer } from "./pointCloud/PointCloudLayer";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";
import {
  backgroundModes,
  backgroundConfigurations,
} from "./backgroundConfig";

// ─────────────────────────────────────────────────────────────
//  LocalStorage helpers
// ─────────────────────────────────────────────────────────────

const LS_PREFIX = "ng-topicmap-playground:";
const VISIBILITY_KEY = `${LS_PREFIX}pointClouds-layerVisibility`;
const CAMERA_KEY = `${LS_PREFIX}pointClouds-camera`;

// ─────────────────────────────────────────────────────────────
//  Catalog of available point clouds
// ─────────────────────────────────────────────────────────────

type CloudId = "kaiser_wilhelm_hain_rgb";

interface CloudEntry {
  id: CloudId;
  label: string;
  color: string;
  url: string;
  /** Approximate WGS84 center for initial camera fly-to */
  center: [number, number];
}

const CLOUDS: CloudEntry[] = [
  {
    id: "kaiser_wilhelm_hain_rgb",
    label: "Kaiser-Wilhelm-Hain (RGB)",
    color: "#4CAF50",
    url: "/pointclouds/kaiser_wilhelm_hain_rgb.las",
    center: [7.15076, 51.25692],
  },
];

type Visibility = Record<CloudId, boolean>;

const DEFAULT_VISIBILITY: Visibility = {
  kaiser_wilhelm_hain_rgb: false,
};

function loadVisibility(): Visibility {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (raw) return { ...DEFAULT_VISIBILITY, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_VISIBILITY;
}

// ─────────────────────────────────────────────────────────────
//  Camera persistence (simple fly-to on first enable)
// ─────────────────────────────────────────────────────────────

function CameraPersistence() {
  const { map } = useLibreContext();
  const restored = useRef(false);

  useEffect(() => {
    if (!map) return;

    if (!restored.current) {
      restored.current = true;
      try {
        const saved = localStorage.getItem(CAMERA_KEY);
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
        // ignore
      }
    }

    const save = () => {
      const center = map.getCenter();
      localStorage.setItem(
        CAMERA_KEY,
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
//  Point cloud layer manager
// ─────────────────────────────────────────────────────────────

type LoadState = "idle" | "loading" | "ready" | "error";

function PointCloudLayerManager({
  visibility,
  onLoadStateChange,
}: {
  visibility: Visibility;
  onLoadStateChange: (id: CloudId, state: LoadState) => void;
}) {
  const { map } = useLibreContext();
  const layers = useRef<Map<CloudId, PointCloudLayer>>(new Map());
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;

  useEffect(() => {
    if (!map) return;

    const addIfMissing = (cloud: CloudEntry) => {
      const existing = layers.current.get(cloud.id);
      if (existing && map.getLayer(existing.id)) return;
      const layer =
        existing ??
        new PointCloudLayer({
          id: `pointcloud-${cloud.id}`,
          url: cloud.url,
          pointSize: 3,
          onLoadStart: () => onLoadStateChange(cloud.id, "loading"),
          onLoaded: ({ centerLngLat, zRange }) => {
            onLoadStateChange(cloud.id, "ready");
            console.log(
              "[POINTCLOUD] ready — data center",
              centerLngLat,
              "z range:",
              zRange
            );
          },
          onLoadError: () => onLoadStateChange(cloud.id, "error"),
        });
      layers.current.set(cloud.id, layer);
      map.addLayer(layer);
    };

    const sync = () => {
      for (const cloud of CLOUDS) {
        const wantVisible = visibilityRef.current[cloud.id];
        const existing = layers.current.get(cloud.id);
        const onMap = existing && map.getLayer(existing.id);

        if (wantVisible && !onMap) {
          addIfMissing(cloud);
        } else if (!wantVisible && onMap) {
          map.removeLayer(existing!.id);
          existing?.dispose();
          layers.current.delete(cloud.id);
          onLoadStateChange(cloud.id, "idle");
        }
      }
    };

    // Re-mount layers after a style swap (background change removes custom layers)
    const onStyleData = () => {
      for (const cloud of CLOUDS) {
        if (
          visibilityRef.current[cloud.id] &&
          layers.current.has(cloud.id) &&
          !map.getLayer(`pointcloud-${cloud.id}`)
        ) {
          addIfMissing(cloud);
        }
      }
    };

    if (map.isStyleLoaded()) {
      sync();
    } else {
      map.once("load", sync);
    }
    map.on("styledata", onStyleData);

    return () => {
      map.off("styledata", onStyleData);
      for (const [id, layer] of layers.current) {
        if (map.getLayer(layer.id)) {
          map.removeLayer(layer.id);
        }
        layer.dispose();
        layers.current.delete(id);
      }
    };
  }, [map, onLoadStateChange]);

  // React to visibility changes without recreating the styledata listener
  useEffect(() => {
    if (!map) return;
    for (const cloud of CLOUDS) {
      const want = visibility[cloud.id];
      const existing = layers.current.get(cloud.id);
      const onMap = existing && map.getLayer(existing.id);
      if (want && !onMap) {
        const layer =
          existing ??
          new PointCloudLayer({
            id: `pointcloud-${cloud.id}`,
            url: cloud.url,
            pointSize: 3,
            onLoadStart: () => onLoadStateChange(cloud.id, "loading"),
            onLoaded: () => onLoadStateChange(cloud.id, "ready"),
            onLoadError: () => onLoadStateChange(cloud.id, "error"),
          });
        layers.current.set(cloud.id, layer);
        map.addLayer(layer);
      } else if (!want && onMap) {
        map.removeLayer(existing!.id);
        existing?.dispose();
        layers.current.delete(cloud.id);
        onLoadStateChange(cloud.id, "idle");
      }
    }
  }, [map, visibility, onLoadStateChange]);

  return null;
}

// ─────────────────────────────────────────────────────────────
//  Layer toggle bar UI
// ─────────────────────────────────────────────────────────────

const PILL_SHADOW =
  "0 1px 2px rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)";

function LoadStateIcon({ state }: { state: LoadState }) {
  switch (state) {
    case "loading":
      return (
        <FontAwesomeIcon
          icon={faSpinner}
          spin
          className="text-xs text-blue-500"
          title="Lädt…"
        />
      );
    case "ready":
      return (
        <FontAwesomeIcon
          icon={faCheck}
          className="text-xs text-green-600"
          title="Geladen"
        />
      );
    case "error":
      return (
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className="text-xs text-red-500"
          title="Fehler"
        />
      );
    default:
      return null;
  }
}

function LayerToggleBar({
  visibility,
  loadStates,
  onToggle,
}: {
  visibility: Visibility;
  loadStates: Record<CloudId, LoadState>;
  onToggle: (id: CloudId) => void;
}) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999] flex gap-2 items-start">
      {CLOUDS.map((cloud) => {
        const visible = visibility[cloud.id];
        const state = loadStates[cloud.id];
        return (
          <div
            key={cloud.id}
            className={`flex flex-col rounded-[10px] text-sm
              ${visible ? "bg-white" : "bg-neutral-200/70 opacity-70"}`}
            style={{ boxShadow: PILL_SHADOW }}
          >
            <div className="flex items-center gap-2 pl-3 pr-1 h-8 whitespace-nowrap">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: cloud.color }}
              />
              <span>{cloud.label}</span>
              <LoadStateIcon state={state} />
              <button
                onClick={() => onToggle(cloud.id)}
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
//  Main component
// ─────────────────────────────────────────────────────────────

const INITIAL_LOAD_STATES: Record<CloudId, LoadState> = {
  kaiser_wilhelm_hain_rgb: "idle",
};

export function PointCloudsPlayground() {
  const [visibility, setVisibility] = useState<Visibility>(loadVisibility);
  const [loadStates, setLoadStates] =
    useState<Record<CloudId, LoadState>>(INITIAL_LOAD_STATES);

  const toggleCloud = (id: CloudId) => {
    setVisibility((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleLoadStateChange = useCallback(
    (id: CloudId, state: LoadState) => {
      setLoadStates((prev) => ({ ...prev, [id]: state }));
    },
    []
  );

  return (
    <TopicMapContextProvider
      infoBoxPixelWidth={350}
      backgroundModes={backgroundModes}
      backgroundConfigurations={backgroundConfigurations}
    >
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <CameraPersistence />
              <CarmaMap
                mapEngine="maplibre"
                exposeMapToWindow
                overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                modalMenu={<Menu />}
              />
              <PointCloudLayerManager
                visibility={visibility}
                onLoadStateChange={handleLoadStateChange}
              />
              <LayerToggleBar
                visibility={visibility}
                loadStates={loadStates}
                onToggle={toggleCloud}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
