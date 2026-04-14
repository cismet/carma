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
import type { Map as MaplibreMap } from "maplibre-gl";
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

type CloudId = "kaiser_wilhelm_hain_rgb" | "awg_2_wuppertal_seg";

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
  {
    id: "awg_2_wuppertal_seg",
    label: "AWG 2 Wuppertal (3D-Seg)",
    color: "#9C27B0",
    url: "/pointclouds/awg_2_wuppertal_seg.las",
    center: [7.15076, 51.25692],
  },
];

type Visibility = Record<CloudId, boolean>;

const DEFAULT_VISIBILITY: Visibility = {
  kaiser_wilhelm_hain_rgb: false,
  awg_2_wuppertal_seg: false,
};

type PointSizes = Record<CloudId, number>;
const DEFAULT_POINT_SIZES: PointSizes = {
  kaiser_wilhelm_hain_rgb: 3,
  awg_2_wuppertal_seg: 3,
};
const POINT_SIZES_KEY = `${LS_PREFIX}pointClouds-pointSizes`;

function loadVisibility(): Visibility {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (raw) return { ...DEFAULT_VISIBILITY, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_VISIBILITY;
}

function loadPointSizes(): PointSizes {
  try {
    const raw = localStorage.getItem(POINT_SIZES_KEY);
    if (raw) return { ...DEFAULT_POINT_SIZES, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_POINT_SIZES;
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

type Bbox4 = {
  sw: [number, number];
  nw: [number, number];
  ne: [number, number];
  se: [number, number];
};

function bboxSourceId(id: CloudId) {
  return `pointcloud-bbox-${id}`;
}

function bboxLayerId(id: CloudId) {
  return `pointcloud-bbox-${id}`;
}

function addBboxLayer(
  map: MaplibreMap,
  id: CloudId,
  bbox: Bbox4,
  color: string
) {
  const ring = [bbox.sw, bbox.nw, bbox.ne, bbox.se, bbox.sw];
  const srcId = bboxSourceId(id);
  const layerId = bboxLayerId(id);
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(srcId)) map.removeSource(srcId);
  map.addSource(srcId, {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: ring },
    },
  });
  map.addLayer({
    id: layerId,
    type: "line",
    source: srcId,
    paint: {
      "line-color": color,
      "line-width": 2,
    },
  });
}

function removeBboxLayer(map: MaplibreMap, id: CloudId) {
  const layerId = bboxLayerId(id);
  const srcId = bboxSourceId(id);
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(srcId)) map.removeSource(srcId);
}

function PointCloudLayerManager({
  visibility,
  pointSizes,
  onLoadStateChange,
}: {
  visibility: Visibility;
  pointSizes: PointSizes;
  onLoadStateChange: (id: CloudId, state: LoadState) => void;
}) {
  const { map } = useLibreContext();
  const layers = useRef<Map<CloudId, PointCloudLayer>>(new Map());
  const bboxes = useRef<Map<CloudId, Bbox4>>(new Map());
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;
  const pointSizesRef = useRef(pointSizes);
  pointSizesRef.current = pointSizes;

  useEffect(() => {
    if (!map) return;

    const ensureLayer = (cloud: CloudEntry): PointCloudLayer => {
      const existing = layers.current.get(cloud.id);
      if (existing) return existing;
      const layer = new PointCloudLayer({
        id: `pointcloud-${cloud.id}`,
        url: cloud.url,
        pointSize: pointSizesRef.current[cloud.id] ?? 3,
        onLoadStart: () => onLoadStateChange(cloud.id, "loading"),
        onLoaded: ({ centerLngLat, bboxWgs84, zRange }) => {
          onLoadStateChange(cloud.id, "ready");
          bboxes.current.set(cloud.id, bboxWgs84);
          console.log(
            "[POINTCLOUD] ready — data center",
            centerLngLat,
            "z range:",
            zRange
          );
          if (visibilityRef.current[cloud.id]) {
            addBboxLayer(map, cloud.id, bboxWgs84, "#e53935");
          }
        },
        onLoadError: () => onLoadStateChange(cloud.id, "error"),
      });
      layers.current.set(cloud.id, layer);
      return layer;
    };

    const addOnMap = (cloud: CloudEntry) => {
      const layer = ensureLayer(cloud);
      if (!map.getLayer(layer.id)) {
        map.addLayer(layer);
      }
      const bbox = bboxes.current.get(cloud.id);
      if (bbox && !map.getLayer(bboxLayerId(cloud.id))) {
        addBboxLayer(map, cloud.id, bbox, "#e53935");
      }
    };

    const removeFromMap = (cloud: CloudEntry) => {
      const existing = layers.current.get(cloud.id);
      if (existing && map.getLayer(existing.id)) {
        map.removeLayer(existing.id);
      }
      removeBboxLayer(map, cloud.id);
    };

    const sync = () => {
      for (const cloud of CLOUDS) {
        const wantVisible = visibilityRef.current[cloud.id];
        const existing = layers.current.get(cloud.id);
        const onMap = existing && map.getLayer(existing.id);

        if (wantVisible && !onMap) {
          addOnMap(cloud);
        } else if (!wantVisible && onMap) {
          removeFromMap(cloud);
        }
      }
    };

    const onStyleData = () => {
      for (const cloud of CLOUDS) {
        if (
          visibilityRef.current[cloud.id] &&
          layers.current.has(cloud.id) &&
          !map.getLayer(`pointcloud-${cloud.id}`)
        ) {
          addOnMap(cloud);
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
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        removeBboxLayer(map, id);
        layer.dispose();
        layers.current.delete(id);
        bboxes.current.delete(id);
      }
    };
  }, [map, onLoadStateChange]);

  // React to visibility changes without touching the styledata listener
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
            pointSize: pointSizesRef.current[cloud.id] ?? 3,
            onLoadStart: () => onLoadStateChange(cloud.id, "loading"),
            onLoaded: ({ bboxWgs84 }) => {
              onLoadStateChange(cloud.id, "ready");
              bboxes.current.set(cloud.id, bboxWgs84);
              if (visibilityRef.current[cloud.id]) {
                addBboxLayer(map, cloud.id, bboxWgs84, "#e53935");
              }
            },
            onLoadError: () => onLoadStateChange(cloud.id, "error"),
          });
        layers.current.set(cloud.id, layer);
        map.addLayer(layer);
        const bbox = bboxes.current.get(cloud.id);
        if (bbox) addBboxLayer(map, cloud.id, bbox, "#e53935");
      } else if (!want && onMap) {
        map.removeLayer(existing!.id);
        removeBboxLayer(map, cloud.id);
      }
    }
  }, [map, visibility, onLoadStateChange]);

  // Push point-size changes to existing layers
  useEffect(() => {
    for (const cloud of CLOUDS) {
      const layer = layers.current.get(cloud.id);
      if (layer) layer.setPointSize(pointSizes[cloud.id] ?? 3);
    }
  }, [pointSizes]);

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
  pointSizes,
  onToggle,
  onPointSizeChange,
}: {
  visibility: Visibility;
  loadStates: Record<CloudId, LoadState>;
  pointSizes: PointSizes;
  onToggle: (id: CloudId) => void;
  onPointSizeChange: (id: CloudId, size: number) => void;
}) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999] flex gap-2 items-start">
      {CLOUDS.map((cloud) => {
        const visible = visibility[cloud.id];
        const state = loadStates[cloud.id];
        const size = pointSizes[cloud.id] ?? 3;
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
              <span className="border-l border-gray-300 h-4" />
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={size}
                disabled={!visible}
                onChange={(e) =>
                  onPointSizeChange(cloud.id, parseFloat(e.target.value))
                }
                className={`w-20 h-1 accent-gray-600 ${
                  !visible ? "opacity-30" : ""
                }`}
                title={`Punktgröße: ${size}px`}
              />
              <span
                className={`text-xs text-gray-500 tabular-nums ${
                  !visible ? "opacity-30" : ""
                }`}
              >
                {size.toFixed(1)}px
              </span>
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
  awg_2_wuppertal_seg: "idle",
};

export function PointCloudsPlayground() {
  const [visibility, setVisibility] = useState<Visibility>(loadVisibility);
  const [loadStates, setLoadStates] =
    useState<Record<CloudId, LoadState>>(INITIAL_LOAD_STATES);
  const [pointSizes, setPointSizes] = useState<PointSizes>(loadPointSizes);

  const toggleCloud = (id: CloudId) => {
    setVisibility((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const setPointSize = (id: CloudId, size: number) => {
    setPointSizes((prev) => {
      const next = { ...prev, [id]: size };
      localStorage.setItem(POINT_SIZES_KEY, JSON.stringify(next));
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
                pointSizes={pointSizes}
                onLoadStateChange={handleLoadStateChange}
              />
              <LayerToggleBar
                visibility={visibility}
                loadStates={loadStates}
                pointSizes={pointSizes}
                onToggle={toggleCloud}
                onPointSizeChange={setPointSize}
              />
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
