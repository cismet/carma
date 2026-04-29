import { useEffect, useMemo, useRef, useState } from "react";
import { CarmaMap } from "@carma-mapping/core";
import type { LibreLayer } from "@carma-mapping/core";
import { Control, ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useLibreContext } from "@carma-mapping/engines/maplibre";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowPointer,
  faLocationDot,
  faSlash,
  faDrawPolygon,
  faTag,
} from "@fortawesome/free-solid-svg-icons";
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from "terra-draw";
import type { GeoJSONStoreFeatures } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import area from "@turf/area";
import length from "@turf/length";
import centroid from "@turf/centroid";
import type { Feature, FeatureCollection, Point, Position } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import Menu from "./Menu";

type DrawMode = "none" | "select" | "point" | "line" | "polygon";

const DRAW_MODE_BUTTONS: {
  mode: Exclude<DrawMode, "none">;
  label: string;
  icon: typeof faLocationDot;
}[] = [
  { mode: "select", label: "Auswählen / bearbeiten", icon: faArrowPointer },
  { mode: "point", label: "Punkt zeichnen", icon: faLocationDot },
  { mode: "line", label: "Linie zeichnen", icon: faSlash },
  { mode: "polygon", label: "Polygon zeichnen", icon: faDrawPolygon },
];

const APP_KEY = "measurements-playground-maplibre";
const LS_VECTOR_STYLES_KEY = `${APP_KEY}:vector-styles`;
const LS_LABELS_VISIBLE_KEY = `${APP_KEY}:labels-visible`;
const SERVER_URL_TOKEN = "__SERVER_URL__";
const SERVER_URL_REPLACEMENT = "https://tiles.cismet.de";

const LABEL_SOURCE_ID = "measurements-labels";
const LABEL_LAYER_ID = "measurements-labels-symbols";

const QUICK_LOAD_LINKS: { label: string; url: string }[] = [
  { label: "POIs", url: "https://tiles.cismet.de/poi/style.json" },
  {
    label: "ALKIS",
    url: "https://tiles.cismet.de/alkis/flurstuecke.black.style.json",
  },
];

type StoredVectorStyle =
  | { kind: "url"; name: string; url: string }
  | { kind: "inline"; name: string; data: unknown };

interface ResolvedVectorStyle {
  name: string;
  /** Either the original remote URL, or a Blob URL for inline JSON. */
  styleUrl: string;
  /** Set when styleUrl is a Blob URL we own and must revoke on cleanup. */
  blobUrl?: string;
}

function deriveStyleName(url: string, fallbackIndex: number): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const tail = segments[segments.length - 1] ?? "";
    const parent = segments[segments.length - 2] ?? "";
    if (tail && parent) return `${parent}/${tail}`;
    if (tail) return tail;
  } catch {
    // not a URL we can parse, fall through
  }
  return `layer-${fallbackIndex + 1}`;
}

function deriveInlineName(
  data: unknown,
  fileName: string,
  fallbackIndex: number
): string {
  if (
    data &&
    typeof data === "object" &&
    "name" in data &&
    typeof (data as { name: unknown }).name === "string"
  ) {
    return (data as { name: string }).name;
  }
  return fileName || `inline-layer-${fallbackIndex + 1}`;
}

function loadStoredVectorStyles(): StoredVectorStyle[] {
  try {
    const raw = localStorage.getItem(LS_VECTOR_STYLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredVectorStyle =>
        entry &&
        typeof entry === "object" &&
        (entry.kind === "url" || entry.kind === "inline")
    );
  } catch (e) {
    console.warn("[measurements-playground] failed to read stored styles", e);
    return [];
  }
}

function persistVectorStyles(styles: StoredVectorStyle[]) {
  try {
    localStorage.setItem(LS_VECTOR_STYLES_KEY, JSON.stringify(styles));
  } catch (e) {
    console.warn("[measurements-playground] failed to persist styles", e);
  }
}

function inlineDataToBlobUrl(data: unknown): string {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  return URL.createObjectURL(blob);
}

function loadLabelsVisible(): boolean {
  try {
    const raw = localStorage.getItem(LS_LABELS_VISIBLE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function persistLabelsVisible(value: boolean) {
  try {
    localStorage.setItem(LS_LABELS_VISIBLE_KEY, value ? "1" : "0");
  } catch (e) {
    console.warn("[measurements-playground] failed to persist labels flag", e);
  }
}

const lengthFormatter0 = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});
const lengthFormatter2 = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

function formatLengthMeters(m: number): string {
  if (m < 1000) return `${lengthFormatter0.format(Math.round(m))} m`;
  return `${lengthFormatter2.format(m / 1000)} km`;
}

function formatAreaSquareMeters(m2: number): string {
  if (m2 < 10000) return `${lengthFormatter0.format(Math.round(m2))} m²`;
  return `${lengthFormatter2.format(m2 / 10000)} ha`;
}

function midpoint(a: Position, b: Position): Position {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function segmentLengthMeters(a: Position, b: Position): number {
  const seg: Feature = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [a, b] },
    properties: {},
  };
  return length(seg, { units: "meters" });
}

// Derive a FeatureCollection of label points (one per polygon centroid for
// area, plus one per segment-midpoint for length) from the current TerraDraw
// snapshot. Mirrors the original react-cismap measurement plugin's `showArea`
// + `showLength` behaviour.
function buildLabelFeatures(
  features: ReadonlyArray<Feature>
): FeatureCollection<Point> {
  const labels: Feature<Point>[] = [];
  for (const feature of features) {
    const geom = feature.geometry;
    if (geom.type === "Polygon") {
      const ring = geom.coordinates[0];
      if (ring && ring.length >= 2) {
        for (let i = 0; i < ring.length - 1; i++) {
          const meters = segmentLengthMeters(ring[i], ring[i + 1]);
          if (meters <= 0) continue;
          labels.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: midpoint(ring[i], ring[i + 1]) },
            properties: { kind: "segment", label: formatLengthMeters(meters) },
          });
        }
      }
      // Closed ring with at least 3 unique vertices ⇒ area is meaningful.
      if (ring && ring.length >= 4) {
        const polyArea = area(feature);
        if (polyArea > 0) {
          const c = centroid(feature);
          labels.push({
            type: "Feature",
            geometry: c.geometry,
            properties: { kind: "area", label: formatAreaSquareMeters(polyArea) },
          });
        }
      }
    } else if (geom.type === "LineString") {
      const coords = geom.coordinates;
      for (let i = 0; i < coords.length - 1; i++) {
        const meters = segmentLengthMeters(coords[i], coords[i + 1]);
        if (meters <= 0) continue;
        labels.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: midpoint(coords[i], coords[i + 1]) },
          properties: { kind: "segment", label: formatLengthMeters(meters) },
        });
      }
    }
  }
  return { type: "FeatureCollection", features: labels };
}

export function App() {
  const [storedStyles, setStoredStyles] = useState<StoredVectorStyle[]>(
    loadStoredVectorStyles
  );
  // UI-only for now: clicking a button sets the active mode; clicking the
  // already-active mode clears it. Not wired to any draw library yet.
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [labelsVisible, setLabelsVisible] = useState<boolean>(loadLabelsVisible);

  const toggleLabelsVisible = () =>
    setLabelsVisible((prev) => {
      const next = !prev;
      persistLabelsVisible(next);
      return next;
    });

  // Resolve each stored entry to { name, styleUrl } and own the Blob URL lifecycle.
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const resolvedStyles = useMemo<ResolvedVectorStyle[]>(() => {
    const next: ResolvedVectorStyle[] = [];
    const used = new Set<string>();

    storedStyles.forEach((entry, idx) => {
      if (entry.kind === "url") {
        next.push({
          name: entry.name || deriveStyleName(entry.url, idx),
          styleUrl: entry.url,
        });
      } else {
        const blobUrl = inlineDataToBlobUrl(entry.data);
        used.add(blobUrl);
        next.push({
          name: entry.name || `inline-layer-${idx + 1}`,
          styleUrl: blobUrl,
          blobUrl,
        });
      }
    });

    // Revoke any blob URLs that are no longer referenced.
    for (const old of blobUrlsRef.current) {
      if (!used.has(old)) URL.revokeObjectURL(old);
    }
    blobUrlsRef.current = used;
    return next;
  }, [storedStyles]);

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
      blobUrlsRef.current = new Set();
    };
  }, []);

  const libreLayers = useMemo<LibreLayer[]>(
    () =>
      resolvedStyles.map((s) => ({
        type: "vector",
        name: s.name,
        style: s.styleUrl,
      })),
    [resolvedStyles]
  );

  const addStoredStyle = (entry: StoredVectorStyle) => {
    setStoredStyles((prev) => {
      const next = [...prev, entry];
      persistVectorStyles(next);
      return next;
    });
  };

  const removeStyleAt = (index: number) => {
    setStoredStyles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      persistVectorStyles(next);
      return next;
    });
  };

  const clearAllStyles = () => {
    setStoredStyles([]);
    persistVectorStyles([]);
  };

  const loadFromUrl = async (url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(
          "[measurements-playground] fetch failed:",
          response.statusText
        );
        return;
      }
      // Validate it's JSON; if it is we still pass the URL (not the body) as the
      // style source, so MapLibre can resolve relative refs against the origin.
      const contentType = response.headers.get("Content-Type") ?? "";
      if (!contentType.includes("application/json")) {
        console.warn(
          "[measurements-playground] dropped URL is not JSON:",
          contentType
        );
      }
      addStoredStyle({
        kind: "url",
        name: deriveStyleName(url, storedStyles.length),
        url,
      });
    } catch (error) {
      console.error("[measurements-playground] failed to fetch URL:", error);
    }
  };

  const loadFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const fileContent = e.target?.result;
        if (typeof fileContent !== "string") return;
        const replaced = fileContent.replaceAll(
          SERVER_URL_TOKEN,
          SERVER_URL_REPLACEMENT
        );
        const data = JSON.parse(replaced);
        addStoredStyle({
          kind: "inline",
          name: deriveInlineName(data, file.name, storedStyles.length),
          data,
        });
      } catch (error) {
        console.error(
          "[measurements-playground] failed to parse dropped file:",
          error
        );
      }
    };
    reader.readAsText(file);
  };

  // Window-level drag-and-drop: URL strings or local style.json files.
  useEffect(() => {
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const url = event.dataTransfer?.getData("URL");
      if (url) {
        void loadFromUrl(url);
        return;
      }
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        loadFromFile(files[0]);
      }
    };
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };
    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragover", handleDragOver);
    return () => {
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragover", handleDragOver);
    };
    // loadFromUrl/loadFromFile close over storedStyles.length only for naming,
    // and addStoredStyle uses the functional setState — re-binding listeners
    // on every change is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <CarmaMap
        appKey={APP_KEY}
        mapEngine="maplibre"
        exposeMapToWindow
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        libreLayers={libreLayers}
        // Suppress carma's vector-feature selection while a draw mode is
        // active so it doesn't fight terra-draw for clicks (e.g. after
        // dropping an ALKIS / POI layer that has its own click semantics).
        selectionEnabled={drawMode === "none"}
        modalMenu={<Menu />}
        extraControls={
          <>
            <DrawModeControls
              active={drawMode}
              onSelect={(mode) =>
                setDrawMode((prev) => (prev === mode ? "none" : mode))
              }
            />
            <LabelToggleControl
              active={labelsVisible}
              onToggle={toggleLabelsVisible}
            />
          </>
        }
      />
      <TerraDrawIntegration mode={drawMode} labelsVisible={labelsVisible} />
      <OverlayUI
        layers={resolvedStyles}
        onClear={clearAllStyles}
        onRemove={removeStyleAt}
        onQuickLoad={(url) => void loadFromUrl(url)}
      />
    </>
  );
}

function drawModeToTerraDraw(
  mode: DrawMode
): "select" | "point" | "linestring" | "polygon" | "static" {
  switch (mode) {
    case "select":
      return "select";
    case "point":
      return "point";
    case "line":
      return "linestring";
    case "polygon":
      return "polygon";
    case "none":
    default:
      return "static";
  }
}

function TerraDrawIntegration({
  mode,
  labelsVisible,
}: {
  mode: DrawMode;
  labelsVisible: boolean;
}) {
  const { map } = useLibreContext();
  const drawRef = useRef<TerraDraw | null>(null);
  // Latest mode captured by ref so the init effect can apply it without
  // re-running on every mode change.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Same trick for the labels-visible flag — read by setupLabelLayer (init
  // and style.load paths) so we don't have to thread the state through.
  const labelsVisibleRef = useRef(labelsVisible);
  labelsVisibleRef.current = labelsVisible;

  // (Re)create TerraDraw whenever the maplibre map instance becomes available.
  useEffect(() => {
    if (!map) return;

    const setupLabelLayer = () => {
      if (!map.getSource(LABEL_SOURCE_ID)) {
        map.addSource(LABEL_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: "symbol",
          source: LABEL_SOURCE_ID,
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-anchor": "center",
            // Lift segment labels above their midpoint so the polygon /
            // line edge doesn't cut through the text. Area labels stay
            // centred on the polygon centroid.
            "text-offset": [
              "case",
              ["==", ["get", "kind"], "segment"],
              ["literal", [0, -0.8]],
              ["literal", [0, 0]],
            ],
            "text-allow-overlap": false,
            "text-ignore-placement": false,
            visibility: labelsVisibleRef.current ? "visible" : "none",
          },
          paint: {
            "text-color": "#111",
            "text-halo-color": "#fff",
            "text-halo-width": 2,
          },
        });
      }
    };

    const refreshLabels = () => {
      const draw = drawRef.current;
      if (!draw) return;
      const src = map.getSource(LABEL_SOURCE_ID) as GeoJSONSource | undefined;
      if (!src) return;
      try {
        const fc = buildLabelFeatures(draw.getSnapshot() as Feature[]);
        src.setData(fc);
        // Terra Draw's adapter re-adds its own layers on internal renders,
        // which would otherwise stack on top of our labels and let the
        // polygon / line strokes paint over the text. Re-pin the label
        // layer to the top of the layer stack on every refresh.
        if (map.getLayer(LABEL_LAYER_ID)) {
          map.moveLayer(LABEL_LAYER_ID);
        }
      } catch (e) {
        console.warn("[measurements-playground] label rebuild failed", e);
      }
    };

    const createDraw = () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode(),
          new TerraDrawPolygonMode(),
          new TerraDrawSelectMode({
            // Fully-editable defaults: drag the feature, drag/delete vertices,
            // add midpoints. Same shape Terra Draw's docs use as the canonical
            // example.
            flags: {
              point: { feature: { draggable: true } },
              linestring: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
            },
          }),
        ],
      });
      draw.start();
      draw.setMode(drawModeToTerraDraw(modeRef.current));
      draw.on("change", () => refreshLabels());
      return draw;
    };

    // Single idempotent attach: handles initial setup AND recovery after a
    // basemap style swap (which strips both our label layer and Terra Draw's
    // own sources/layers — its adapter has no built-in style.load recovery).
    // If a draw instance already exists, snapshot its features, tear it down,
    // recreate it against the new style, and restore the features.
    const attach = () => {
      const oldDraw = drawRef.current;
      if (oldDraw) {
        let savedFeatures: GeoJSONStoreFeatures[] = [];
        try {
          savedFeatures = oldDraw.getSnapshot();
        } catch (e) {
          console.warn(
            "[measurements-playground] could not snapshot before reattach",
            e
          );
        }
        // stop() throws after a style swap because the adapter's unregister()
        // calls map.removeLayer("td-point") etc., but those layer ids no
        // longer exist in the freshly-loaded style. The base adapter still
        // unbinds canvas event listeners before that throw, so swallowing
        // the error here doesn't leak handlers — and crucially lets us
        // continue to createDraw + addFeatures + setupLabelLayer below
        // (without the catch, the whole attach aborted and even the labels
        // failed to re-render).
        try {
          oldDraw.stop();
        } catch (e) {
          console.warn(
            "[measurements-playground] terra-draw stop() failed during style.load reattach (expected — adapter tried to removeLayer non-existent ids)",
            e
          );
        }
        drawRef.current = createDraw();
        if (savedFeatures.length > 0) {
          try {
            drawRef.current.addFeatures(savedFeatures);
          } catch (e) {
            console.warn(
              "[measurements-playground] could not restore drawn features",
              e
            );
          }
        }
      } else {
        drawRef.current = createDraw();
      }
      setupLabelLayer();
      refreshLabels();
    };

    if (map.isStyleLoaded()) {
      attach();
    }
    map.on("style.load", attach);

    return () => {
      map.off("style.load", attach);
      if (drawRef.current) {
        drawRef.current.stop();
        drawRef.current = null;
      }
    };
  }, [map]);

  // React to mode changes after init.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.setMode(drawModeToTerraDraw(mode));
  }, [mode]);

  // React to label visibility toggle.
  useEffect(() => {
    if (!map) return;
    if (!map.getLayer(LABEL_LAYER_ID)) return;
    map.setLayoutProperty(
      LABEL_LAYER_ID,
      "visibility",
      labelsVisible ? "visible" : "none"
    );
  }, [map, labelsVisible]);

  return null;
}

function DrawModeControls({
  active,
  onSelect,
}: {
  active: DrawMode;
  onSelect: (mode: Exclude<DrawMode, "none">) => void;
}) {
  // All draw-mode buttons live inside a single <Control> so they render as
  // one fused button group (same pattern apps/geoportal MapWrapper uses for
  // the compass + 3D-toggle pair, and for the +/- zoom pair).
  // Built-in topleft orders today: 10 zoom, 20 compass, 30 terrain,
  // 50 fullscreen, 60 locator. The whole draw group sits at order 70.
  const last = DRAW_MODE_BUTTONS.length - 1;
  return (
    <Control position="topleft" order={70}>
      <div className="flex flex-col">
        {DRAW_MODE_BUTTONS.map(({ mode, label, icon }, idx) => {
          const isActive = active === mode;
          // First: square bottom + drop bottom border (next button supplies it).
          // Middle: square both ends + drop bottom border + thin top border.
          // Last: square top + thin top border.
          let groupClass: string;
          if (idx === 0) {
            groupClass = "!border-b-0 !rounded-b-none";
          } else if (idx === last) {
            groupClass = "!rounded-t-none !border-t-[1px]";
          } else {
            groupClass = "!rounded-none !border-t-[1px] !border-b-0";
          }
          return (
            <Tooltip key={mode} title={label} placement="right">
              <ControlButtonStyler
                onClick={() => onSelect(mode)}
                dataTestId={`draw-${mode}-control`}
                useDisabledStyle={false}
                className={groupClass}
              >
                <FontAwesomeIcon
                  icon={icon}
                  className={isActive ? "text-[#1677ff]" : ""}
                />
              </ControlButtonStyler>
            </Tooltip>
          );
        })}
      </div>
    </Control>
  );
}

function LabelToggleControl({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  // Sibling to DrawModeControls (order=70) but its own visual group: full
  // border + rounded edges, no fusion classes. order=80 puts it directly
  // below the draw-mode strip in the topleft column.
  return (
    <Control position="topleft" order={80}>
      <Tooltip
        title={
          active ? "Maße ausblenden" : "Maße einblenden"
        }
        placement="right"
      >
        <ControlButtonStyler
          onClick={onToggle}
          dataTestId="labels-toggle-control"
          useDisabledStyle={false}
        >
          <FontAwesomeIcon
            icon={faTag}
            className={active ? "text-[#1677ff]" : ""}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
}

function OverlayUI({
  layers,
  onClear,
  onRemove,
  onQuickLoad,
}: {
  layers: ResolvedVectorStyle[];
  onClear: () => void;
  onRemove: (index: number) => void;
  onQuickLoad: (url: string) => void;
}) {
  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999]"
      style={{
        backgroundColor: "white",
        padding: "8px 12px",
        borderRadius: "4px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        fontSize: "14px",
        minWidth: "320px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: "13px" }}>Snap-target layers</strong>
        {layers.length > 0 && (
          <>
            <div
              style={{ width: "1px", height: "20px", backgroundColor: "#ddd" }}
            />
            <button
              onClick={onClear}
              title="Remove all vector layers"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                color: "#dc2626",
              }}
            >
              Clear ({layers.length})
            </button>
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "13px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "#555" }}>Quick load:</span>
        {QUICK_LOAD_LINKS.map((link, i) => {
          const alreadyLoaded = layers.some((l) => l.styleUrl === link.url);
          return (
            <span
              key={link.url}
              style={{ display: "inline-flex", gap: "10px" }}
            >
              {i > 0 && (
                <span style={{ color: "#ddd" }} aria-hidden>
                  |
                </span>
              )}
              <button
                onClick={() => onQuickLoad(link.url)}
                disabled={alreadyLoaded}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: alreadyLoaded ? "#9ca3af" : "#2563eb",
                  cursor: alreadyLoaded ? "default" : "pointer",
                  textDecoration: alreadyLoaded ? "line-through" : "none",
                }}
                title={alreadyLoaded ? "already loaded" : link.url}
              >
                {link.label}
              </button>
            </span>
          );
        })}
        <span style={{ color: "#888", fontSize: "12px" }}>
          (or drop a URL / style.json file anywhere)
        </span>
      </div>

      {layers.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            fontSize: "12px",
            maxHeight: "180px",
            overflowY: "auto",
          }}
        >
          {layers.map((layer, idx) => (
            <li
              key={`${layer.styleUrl}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "2px 4px",
                backgroundColor: "#f9fafb",
                borderRadius: "3px",
              }}
            >
              <span
                title={layer.styleUrl}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: layer.blobUrl ? "#9333ea" : "#2563eb",
                    marginRight: 6,
                    verticalAlign: "middle",
                  }}
                  aria-hidden
                />
                {layer.name}
              </span>
              <button
                onClick={() => onRemove(idx)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b7280",
                  fontSize: "14px",
                  padding: "0 4px",
                }}
                title="Remove layer"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
