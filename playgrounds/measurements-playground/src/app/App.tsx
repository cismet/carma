import { useEffect, useMemo, useRef, useState } from "react";
import { CarmaMap } from "@carma-mapping/core";
import type { LibreLayer } from "@carma-mapping/core";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowPointer,
  faLocationDot,
  faSlash,
  faDrawPolygon,
  faTag,
  faMagnet,
} from "@fortawesome/free-solid-svg-icons";
import {
  MeasurementHost,
  MeasurementsProvider,
  type DrawMode,
  type SnapMode,
} from "@carma-mapping/measurements";
import Menu from "./Menu";

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
const LS_SNAPPING_ENABLED_KEY = `${APP_KEY}:snapping-enabled`;
const LS_RADIUS_DEBUG_KEY = `${APP_KEY}:snap-radius-debug`;
const LS_SNAP_RADIUS_PX_KEY = `${APP_KEY}:snap-radius-px`;
const LS_SNAP_MODE_KEY = `${APP_KEY}:snap-mode`;
const LS_BG_SNAPPING_KEY = `${APP_KEY}:bg-snapping`;

// SnapMode + the three strategies it selects between live in
// @carma-mapping/measurements; see the docstring on `SnapMode` there for
// what "opt-out" / "derived-opt-in" / "explicit" each select.
const SNAP_MODE_DEFAULT: SnapMode = "derived-opt-in";
const BG_SNAPPING_DEFAULT = false;
const SERVER_URL_TOKEN = "__SERVER_URL__";
const SERVER_URL_REPLACEMENT = "https://tiles.cismet.de";

// Default screen-px radius around the cursor we search for snap candidates.
// Adjustable at runtime via the overlay slider. The lib hardcodes the same
// default, but we keep a local copy so resetAll / loadSnapRadiusPx have a
// stable fallback when localStorage is empty.
const SNAP_RADIUS_PX_DEFAULT = 20;
const SNAP_RADIUS_PX_MIN = 5;
const SNAP_RADIUS_PX_MAX = 80;

const QUICK_LOAD_LINKS: { label: string; url: string }[] = [
  { label: "POIs", url: "https://tiles.cismet.de/poi/style.json" },
  {
    label: "ALKIS",
    url: "https://tiles.cismet.de/alkis/flurstuecke.black.style.json",
  },
];

type StoredVectorStyle =
  | { kind: "url"; name: string; url: string; snapping?: boolean }
  | { kind: "inline"; name: string; data: unknown; snapping?: boolean };

interface ResolvedVectorStyle {
  name: string;
  /** Either the original remote URL, or a Blob URL for inline JSON. */
  styleUrl: string;
  /** Set when styleUrl is a Blob URL we own and must revoke on cleanup. */
  blobUrl?: string;
  /** Matches `metadata["layer-id"]` that styleBuilder writes onto every
   *  layer added from this libreLayer's style.json. Empirically that is
   *  just the libreLayer's `name` (see `libraries/mapping/engines/maplibre/
   *  src/utils/styleBuilder.ts:492` for the merged-mode path: `layerId =
   *  capabilitiesLayer || layer.name`). Vector backgrounds carry a `bg-`
   *  prefixed name (see `LibreMap.tsx:491`) which we treat as "background"
   *  in explicit-snap mode. */
  layerId: string;
  /** User opt-in flag for explicit snap mode. Default true; only matters
   *  when SnapMode === "explicit". */
  snapping: boolean;
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

function loadSnappingEnabled(): boolean {
  try {
    const raw = localStorage.getItem(LS_SNAPPING_ENABLED_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function persistSnappingEnabled(value: boolean) {
  try {
    localStorage.setItem(LS_SNAPPING_ENABLED_KEY, value ? "1" : "0");
  } catch (e) {
    console.warn(
      "[measurements-playground] failed to persist snapping flag",
      e
    );
  }
}

function loadRadiusDebug(): boolean {
  try {
    const raw = localStorage.getItem(LS_RADIUS_DEBUG_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function persistRadiusDebug(value: boolean) {
  try {
    localStorage.setItem(LS_RADIUS_DEBUG_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function clampSnapRadius(px: number): number {
  if (!Number.isFinite(px)) return SNAP_RADIUS_PX_DEFAULT;
  return Math.max(SNAP_RADIUS_PX_MIN, Math.min(SNAP_RADIUS_PX_MAX, Math.round(px)));
}

function loadSnapRadiusPx(): number {
  try {
    const raw = localStorage.getItem(LS_SNAP_RADIUS_PX_KEY);
    if (raw === null) return SNAP_RADIUS_PX_DEFAULT;
    return clampSnapRadius(Number.parseInt(raw, 10));
  } catch {
    return SNAP_RADIUS_PX_DEFAULT;
  }
}

function persistSnapRadiusPx(value: number) {
  try {
    localStorage.setItem(LS_SNAP_RADIUS_PX_KEY, String(clampSnapRadius(value)));
  } catch {
    // ignore
  }
}

function loadSnapMode(): SnapMode {
  try {
    const raw = localStorage.getItem(LS_SNAP_MODE_KEY);
    if (raw === "opt-out" || raw === "derived-opt-in") return raw;
    return SNAP_MODE_DEFAULT;
  } catch {
    return SNAP_MODE_DEFAULT;
  }
}

function persistSnapMode(value: SnapMode) {
  try {
    localStorage.setItem(LS_SNAP_MODE_KEY, value);
  } catch {
    // ignore
  }
}

function loadBackgroundSnapping(): boolean {
  try {
    const raw = localStorage.getItem(LS_BG_SNAPPING_KEY);
    if (raw === null) return BG_SNAPPING_DEFAULT;
    return raw === "1";
  } catch {
    return BG_SNAPPING_DEFAULT;
  }
}

function persistBackgroundSnapping(value: boolean) {
  try {
    localStorage.setItem(LS_BG_SNAPPING_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}


export function App() {
  const [storedStyles, setStoredStyles] = useState<StoredVectorStyle[]>(
    loadStoredVectorStyles
  );
  // UI-only for now: clicking a button sets the active mode; clicking the
  // already-active mode clears it. Not wired to any draw library yet.
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [labelsVisible, setLabelsVisible] = useState<boolean>(loadLabelsVisible);
  const [snappingEnabled, setSnappingEnabled] = useState<boolean>(
    loadSnappingEnabled
  );
  const [radiusDebugVisible, setRadiusDebugVisible] = useState<boolean>(
    loadRadiusDebug
  );
  const [snapRadiusPx, setSnapRadiusPx] = useState<number>(loadSnapRadiusPx);
  const [snapMode, setSnapMode] = useState<SnapMode>(loadSnapMode);
  const [backgroundSnapping, setBackgroundSnapping] = useState<boolean>(
    loadBackgroundSnapping
  );

  const toggleLabelsVisible = () =>
    setLabelsVisible((prev) => {
      const next = !prev;
      persistLabelsVisible(next);
      return next;
    });

  const toggleSnappingEnabled = () =>
    setSnappingEnabled((prev) => {
      const next = !prev;
      persistSnappingEnabled(next);
      return next;
    });

  const toggleRadiusDebug = () =>
    setRadiusDebugVisible((prev) => {
      const next = !prev;
      persistRadiusDebug(next);
      return next;
    });

  const updateSnapRadiusPx = (next: number) => {
    const clamped = clampSnapRadius(next);
    setSnapRadiusPx(clamped);
    persistSnapRadiusPx(clamped);
  };

  const updateSnapMode = (next: SnapMode) => {
    setSnapMode(next);
    persistSnapMode(next);
  };

  const toggleBackgroundSnapping = () =>
    setBackgroundSnapping((prev) => {
      const next = !prev;
      persistBackgroundSnapping(next);
      return next;
    });

  // Wipe everything we persist for this playground (loaded layers +
  // four UX prefs) and put state back to its defaults. Drawn features live
  // in terra-draw's in-memory store, not localStorage, so they're untouched.
  const resetAll = () => {
    try {
      localStorage.removeItem(LS_VECTOR_STYLES_KEY);
      localStorage.removeItem(LS_LABELS_VISIBLE_KEY);
      localStorage.removeItem(LS_SNAPPING_ENABLED_KEY);
      localStorage.removeItem(LS_RADIUS_DEBUG_KEY);
      localStorage.removeItem(LS_SNAP_RADIUS_PX_KEY);
      localStorage.removeItem(LS_SNAP_MODE_KEY);
      localStorage.removeItem(LS_BG_SNAPPING_KEY);
    } catch (e) {
      console.warn(
        "[measurements-playground] failed to clear stored preferences",
        e
      );
    }
    setStoredStyles([]);
    setLabelsVisible(true);
    setSnappingEnabled(true);
    setRadiusDebugVisible(true);
    setSnapRadiusPx(SNAP_RADIUS_PX_DEFAULT);
    setSnapMode(SNAP_MODE_DEFAULT);
    setBackgroundSnapping(BG_SNAPPING_DEFAULT);
  };

  // Resolve each stored entry to { name, styleUrl } and own the Blob URL lifecycle.
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const resolvedStyles = useMemo<ResolvedVectorStyle[]>(() => {
    const next: ResolvedVectorStyle[] = [];
    const used = new Set<string>();

    storedStyles.forEach((entry, idx) => {
      // Default missing snapping flag to true (existing entries pre-date it).
      const snapping = entry.snapping !== false;
      if (entry.kind === "url") {
        const styleUrl = entry.url;
        const name = entry.name || deriveStyleName(styleUrl, idx);
        next.push({
          name,
          styleUrl,
          layerId: name,
          snapping,
        });
      } else {
        const blobUrl = inlineDataToBlobUrl(entry.data);
        used.add(blobUrl);
        const name = entry.name || `inline-layer-${idx + 1}`;
        next.push({
          name,
          styleUrl: blobUrl,
          blobUrl,
          layerId: name,
          snapping,
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

  // Slug set for explicit-mode filtering — fed to MeasurementHost which
  // re-runs its snap-target lookup whenever this set's identity changes
  // (i.e. when the user flips a row in the layer list).
  const optedInLayerIdsSet = useMemo(
    () =>
      new Set(
        resolvedStyles.filter((s) => s.snapping).map((s) => s.layerId)
      ),
    [resolvedStyles]
  );

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

  const toggleStyleSnappingAt = (index: number) => {
    setStoredStyles((prev) => {
      const next = prev.map((entry, i) =>
        i === index ? { ...entry, snapping: entry.snapping === false } : entry
      );
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
    <MeasurementsProvider>
      <CarmaMap
        appKey={APP_KEY}
        mapEngine="maplibre"
        exposeMapToWindow
        logErrors
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
            <ToggleStackControls
              entries={[
                {
                  key: "labels",
                  active: labelsVisible,
                  onToggle: toggleLabelsVisible,
                  tooltip: labelsVisible
                    ? "Maße ausblenden"
                    : "Maße einblenden",
                  testId: "labels-toggle-control",
                  icon: faTag,
                },
                {
                  key: "snapping",
                  active: snappingEnabled,
                  onToggle: toggleSnappingEnabled,
                  tooltip: snappingEnabled
                    ? "Snapping aus"
                    : "Snapping an",
                  testId: "snapping-toggle-control",
                  icon: faMagnet,
                },
              ]}
            />
          </>
        }
      />
      <MeasurementHost
        mode={drawMode}
        snapping={snappingEnabled}
        snapRadiusPx={snapRadiusPx}
        snapMode={snapMode}
        optedInLayerIds={optedInLayerIdsSet}
        backgroundSnapping={backgroundSnapping}
        labelsVisible={labelsVisible}
        radiusDebugVisible={radiusDebugVisible}
      />
      <OverlayUI
        layers={resolvedStyles}
        onClear={clearAllStyles}
        onRemove={removeStyleAt}
        onToggleSnapping={toggleStyleSnappingAt}
        onQuickLoad={(url) => void loadFromUrl(url)}
        radiusDebugVisible={radiusDebugVisible}
        onToggleRadiusDebug={toggleRadiusDebug}
        snapRadiusPx={snapRadiusPx}
        onSnapRadiusChange={updateSnapRadiusPx}
        snapMode={snapMode}
        onSnapModeChange={updateSnapMode}
        backgroundSnapping={backgroundSnapping}
        onToggleBackgroundSnapping={toggleBackgroundSnapping}
        onResetAll={resetAll}
      />
    </MeasurementsProvider>
  );
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

type ToggleEntry = {
  key: string;
  active: boolean;
  onToggle: () => void;
  tooltip: string;
  testId: string;
  icon: typeof faTag;
};

// Sibling to DrawModeControls (order=70). Renders one fused button stack
// (same visual pattern as the draw-mode buttons) at order=80 so the whole
// group sits directly below the draw-mode strip in the topleft column.
function ToggleStackControls({ entries }: { entries: ToggleEntry[] }) {
  const last = entries.length - 1;
  return (
    <Control position="topleft" order={80}>
      <div className="flex flex-col">
        {entries.map(({ key, active, onToggle, tooltip, testId, icon }, idx) => {
          let groupClass = "";
          if (entries.length > 1) {
            if (idx === 0) groupClass = "!border-b-0 !rounded-b-none";
            else if (idx === last) groupClass = "!rounded-t-none !border-t-[1px]";
            else groupClass = "!rounded-none !border-t-[1px] !border-b-0";
          }
          return (
            <Tooltip key={key} title={tooltip} placement="right">
              <ControlButtonStyler
                onClick={onToggle}
                dataTestId={testId}
                useDisabledStyle={false}
                className={groupClass}
              >
                <FontAwesomeIcon
                  icon={icon}
                  className={active ? "text-[#1677ff]" : ""}
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
  onToggleSnapping,
  onQuickLoad,
  radiusDebugVisible,
  onToggleRadiusDebug,
  snapRadiusPx,
  onSnapRadiusChange,
  snapMode,
  onSnapModeChange,
  backgroundSnapping,
  onToggleBackgroundSnapping,
  onResetAll,
}: {
  layers: ResolvedVectorStyle[];
  onClear: () => void;
  onRemove: (index: number) => void;
  onToggleSnapping: (index: number) => void;
  onQuickLoad: (url: string) => void;
  radiusDebugVisible: boolean;
  onToggleRadiusDebug: () => void;
  snapRadiusPx: number;
  onSnapRadiusChange: (next: number) => void;
  snapMode: SnapMode;
  onSnapModeChange: (next: SnapMode) => void;
  backgroundSnapping: boolean;
  onToggleBackgroundSnapping: () => void;
  onResetAll: () => void;
}) {
  const isExplicit = snapMode === "explicit";
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
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={onResetAll}
            title="Reset everything stored for this playground (loaded layers + all toggles + radius)"
            data-testid="reset-all-button"
            style={{
              background: "none",
              border: "1px solid #d1d5db",
              borderRadius: "3px",
              cursor: "pointer",
              padding: "2px 8px",
              fontSize: "12px",
              color: "#374151",
            }}
          >
            Reset
          </button>
        </div>
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontSize: "13px",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: "13px" }}>Snap (debug)</strong>
        <span
          role="radiogroup"
          aria-label="snap mode"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {(
            [
              {
                value: "opt-out" as SnapMode,
                label: "opt-out",
                title:
                  "Every layer participates unless flagged skipSnapping. Basemap.de geometry included.",
              },
              {
                value: "derived-opt-in" as SnapMode,
                label: "derived opt-in",
                title:
                  "Only sources that ship at least one skipSnapping flag are treated as curated snap targets. Basemap.de excluded.",
              },
              {
                value: "explicit" as SnapMode,
                label: "explicit",
                title:
                  "User picks per loaded libreLayer (checkbox below). Background (basemap.de + built-ins) gated separately.",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
              }}
              title={opt.title}
            >
              <input
                type="radio"
                name="snap-mode"
                value={opt.value}
                checked={snapMode === opt.value}
                onChange={() => onSnapModeChange(opt.value)}
                data-testid={`snap-mode-${opt.value}`}
              />
              {opt.label}
            </label>
          ))}
        </span>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            cursor: isExplicit ? "pointer" : "not-allowed",
            opacity: isExplicit ? 1 : 0.5,
          }}
          title={
            isExplicit
              ? "Include layers that aren't part of any loaded libreLayer (basemap.de plus any built-ins)."
              : "Only relevant in explicit mode."
          }
        >
          <input
            type="checkbox"
            checked={backgroundSnapping}
            disabled={!isExplicit}
            onChange={onToggleBackgroundSnapping}
            data-testid="snap-background-toggle"
          />
          background
        </label>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
          }}
          title="Show the white snap-radius circle around the cursor"
        >
          <input
            type="checkbox"
            checked={radiusDebugVisible}
            onChange={onToggleRadiusDebug}
            data-testid="snap-radius-debug-toggle"
          />
          show radius
        </label>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            flex: "1 1 200px",
            minWidth: "180px",
          }}
          title={`Snap search radius (${SNAP_RADIUS_PX_MIN}–${SNAP_RADIUS_PX_MAX} px)`}
        >
          <span style={{ color: "#555", whiteSpace: "nowrap" }}>radius</span>
          <input
            type="range"
            min={SNAP_RADIUS_PX_MIN}
            max={SNAP_RADIUS_PX_MAX}
            step={1}
            value={snapRadiusPx}
            onChange={(e) =>
              onSnapRadiusChange(Number.parseInt(e.target.value, 10))
            }
            data-testid="snap-radius-slider"
            style={{ flex: 1 }}
          />
          <span
            style={{
              color: "#111",
              fontVariantNumeric: "tabular-nums",
              minWidth: "3ch",
              textAlign: "right",
            }}
          >
            {snapRadiusPx}
          </span>
          <span style={{ color: "#888" }}>px</span>
        </label>
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
                  flex: 1,
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
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: isExplicit ? "#374151" : "#9ca3af",
                  cursor: isExplicit ? "pointer" : "not-allowed",
                  opacity: isExplicit ? 1 : 0.6,
                }}
                title={
                  isExplicit
                    ? "Include this libreLayer's features as snap targets."
                    : "Only relevant in explicit mode."
                }
              >
                <input
                  type="checkbox"
                  checked={layer.snapping}
                  disabled={!isExplicit}
                  onChange={() => onToggleSnapping(idx)}
                  data-testid={`layer-snapping-toggle-${idx}`}
                />
                snap
              </label>
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
