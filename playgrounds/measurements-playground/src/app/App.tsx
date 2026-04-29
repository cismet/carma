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
} from "@fortawesome/free-solid-svg-icons";
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
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
const SERVER_URL_TOKEN = "__SERVER_URL__";
const SERVER_URL_REPLACEMENT = "https://tiles.cismet.de";

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

export function App() {
  const [storedStyles, setStoredStyles] = useState<StoredVectorStyle[]>(
    loadStoredVectorStyles
  );
  // UI-only for now: clicking a button sets the active mode; clicking the
  // already-active mode clears it. Not wired to any draw library yet.
  const [drawMode, setDrawMode] = useState<DrawMode>("none");

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
        modalMenu={<Menu />}
        extraControls={
          <DrawModeControls
            active={drawMode}
            onSelect={(mode) =>
              setDrawMode((prev) => (prev === mode ? "none" : mode))
            }
          />
        }
      />
      <TerraDrawIntegration mode={drawMode} />
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

function TerraDrawIntegration({ mode }: { mode: DrawMode }) {
  const { map } = useLibreContext();
  const drawRef = useRef<TerraDraw | null>(null);
  // Latest mode captured by ref so the init effect can apply it without
  // re-running on every mode change.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // (Re)create TerraDraw whenever the maplibre map instance becomes available.
  useEffect(() => {
    if (!map) return;

    const init = () => {
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
      drawRef.current = draw;
    };

    if (map.isStyleLoaded()) {
      init();
    } else {
      map.once("style.load", init);
    }

    return () => {
      map.off("style.load", init);
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
        {QUICK_LOAD_LINKS.map((link, i) => (
          <span key={link.url} style={{ display: "inline-flex", gap: "10px" }}>
            {i > 0 && (
              <span style={{ color: "#ddd" }} aria-hidden>
                |
              </span>
            )}
            <button
              onClick={() => onQuickLoad(link.url)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "#2563eb",
                cursor: "pointer",
                textDecoration: "none",
              }}
              title={link.url}
            >
              {link.label}
            </button>
          </span>
        ))}
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
