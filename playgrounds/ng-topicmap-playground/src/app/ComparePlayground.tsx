import { useEffect, useMemo, useState } from "react";
import { Segmented, Select, Slider } from "antd";
import {
  CarmaMapCompare,
  type CompareMapConfig,
  type CompareMode,
} from "@carma-mapping/core";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

// ─────────────────────────────────────────────────────────────
// Available background layer presets.
// Keys follow the same "namedLayer@opacity" syntax the rest of the
// monorepo uses (resolved by LibreMap via defaultLayerConf.namedLayers).
// ─────────────────────────────────────────────────────────────

const LAYER_PRESETS: { label: string; value: string }[] = [
  { label: "Stadtplan (Wuppertal)", value: "wupp-plan-live@100" },
  { label: "Luftbildkarte 2024", value: "rvrGrundriss@100|trueOrtho2024Alternative@75|rvrSchriftNT@100" },
  { label: "True Ortho 2024", value: "trueOrtho2024Alternative@100" },
  { label: "basemap.de Farbe", value: "our_basemap_color@100" },
  { label: "basemap.de Grau", value: "our_basemap_grey@100" },
  { label: "basemap.de Relief", value: "our_basemap_relief@100" },
];

const DEFAULT_LEFT = LAYER_PRESETS[0].value;
const DEFAULT_MIDDLE = LAYER_PRESETS[4].value;
const DEFAULT_RIGHT = LAYER_PRESETS[1].value;

// ─────────────────────────────────────────────────────────────
// LocalStorage persistence (scoped to playground to avoid leakage).
// ─────────────────────────────────────────────────────────────

const LS_PREFIX = "ng-topicmap-playground:compare:";
const LS_MODE = `${LS_PREFIX}mode`;
const LS_NUM_PANELS = `${LS_PREFIX}numPanels`;
const LS_LAYERS = `${LS_PREFIX}layers`;
const LS_SPY_RADIUS = `${LS_PREFIX}spyRadius`;

type ModeKey = "spyglass" | "sbs-h" | "sbs-v";

const MODE_OPTIONS: { label: string; value: ModeKey }[] = [
  { label: "Side-by-Side ⇔", value: "sbs-h" },
  { label: "Side-by-Side ⇕", value: "sbs-v" },
  { label: "Lupe 🔍", value: "spyglass" },
];

function buildMode(key: ModeKey, spyRadius: number): CompareMode {
  switch (key) {
    case "spyglass":
      return {
        type: "spyglass",
        radius: spyRadius,
        overlayMapIndex: 1,
      };
    case "sbs-h":
      return { type: "side-by-side", orientation: "horizontal" };
    case "sbs-v":
      return { type: "side-by-side", orientation: "vertical" };
  }
}

// ─────────────────────────────────────────────────────────────
// LocalStorage helpers
// ─────────────────────────────────────────────────────────────

function loadMode(): ModeKey {
  try {
    const stored = localStorage.getItem(LS_MODE);
    if (stored && MODE_OPTIONS.some((o) => o.value === stored)) {
      return stored as ModeKey;
    }
  } catch {
    /* ignore */
  }
  return "sbs-h";
}

function loadNumPanels(): 2 | 3 {
  try {
    const n = parseInt(localStorage.getItem(LS_NUM_PANELS) ?? "2", 10);
    return n === 3 ? 3 : 2;
  } catch {
    return 2;
  }
}

function loadLayers(count: number): string[] {
  try {
    const stored = localStorage.getItem(LS_LAYERS);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      if (Array.isArray(parsed)) {
        const result: string[] = [];
        for (let i = 0; i < count; i++) {
          result.push(
            parsed[i] ??
              (i === 0 ? DEFAULT_LEFT : i === 1 ? DEFAULT_RIGHT : DEFAULT_MIDDLE)
          );
        }
        return result;
      }
    }
  } catch {
    /* ignore */
  }
  return count === 3
    ? [DEFAULT_LEFT, DEFAULT_MIDDLE, DEFAULT_RIGHT]
    : [DEFAULT_LEFT, DEFAULT_RIGHT];
}

function loadSpyRadius(): number {
  try {
    const n = parseInt(localStorage.getItem(LS_SPY_RADIUS) ?? "180", 10);
    return Number.isFinite(n) ? Math.max(60, Math.min(400, n)) : 180;
  } catch {
    return 180;
  }
}

// ─────────────────────────────────────────────────────────────
// Control bar styling (pill buttons, similar to TreesPlayground)
// ─────────────────────────────────────────────────────────────

const PILL_SHADOW =
  "0 1px 2px rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)";

function PanelLayerPicker({
  index,
  value,
  onChange,
  accent,
}: {
  index: number;
  value: string;
  onChange: (v: string) => void;
  accent: string;
}) {
  return (
    <div
      className="flex items-center gap-2 bg-white rounded-[10px] h-8 pl-3 pr-2"
      style={{ boxShadow: PILL_SHADOW }}
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: accent }}
      />
      <span className="text-sm text-gray-700 whitespace-nowrap">
        Panel {index + 1}
      </span>
      <Select
        size="small"
        value={value}
        onChange={onChange}
        options={LAYER_PRESETS}
        style={{ minWidth: 220 }}
        variant="borderless"
      />
    </div>
  );
}

// Palette used to decorate panel labels and pickers so panel 1/2/3 are
// visually distinguishable even when they all show the same label text.
const PANEL_ACCENTS = ["#1677ff", "#13c2c2", "#f59f00"];

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function ComparePlayground() {
  const [modeKey, setModeKey] = useState<ModeKey>(() => loadMode());
  const [numPanels, setNumPanels] = useState<2 | 3>(() => loadNumPanels());
  const [layers, setLayers] = useState<string[]>(() =>
    loadLayers(loadNumPanels())
  );
  const [spyRadius, setSpyRadius] = useState<number>(() => loadSpyRadius());

  // Keep layers array length in sync with numPanels.
  useEffect(() => {
    setLayers((prev) => {
      if (prev.length === numPanels) return prev;
      const next = [...prev];
      while (next.length < numPanels) {
        next.push(
          next.length === 0
            ? DEFAULT_LEFT
            : next.length === 1
            ? DEFAULT_RIGHT
            : DEFAULT_MIDDLE
        );
      }
      next.length = numPanels;
      return next;
    });
  }, [numPanels]);

  // Spyglass is only meaningful with two maps (one base + one overlay).
  // With three panels, force the mode back to side-by-side. Also covers
  // the case where localStorage holds a stale "spyglass + 3 panels"
  // combination from a previous session.
  useEffect(() => {
    if (numPanels === 3 && modeKey === "spyglass") {
      setModeKey("sbs-h");
    }
  }, [numPanels, modeKey]);

  // Persist state.
  useEffect(() => {
    try {
      localStorage.setItem(LS_MODE, modeKey);
    } catch {
      /* ignore */
    }
  }, [modeKey]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_NUM_PANELS, String(numPanels));
    } catch {
      /* ignore */
    }
  }, [numPanels]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_LAYERS, JSON.stringify(layers));
    } catch {
      /* ignore */
    }
  }, [layers]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_SPY_RADIUS, String(spyRadius));
    } catch {
      /* ignore */
    }
  }, [spyRadius]);

  const setLayerAt = (index: number, value: string) => {
    setLayers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const maps: CompareMapConfig[] = useMemo(
    () =>
      layers.map((layerKey, i) => {
        const preset = LAYER_PRESETS.find((p) => p.value === layerKey);
        return {
          engine: "maplibre" as const,
          backgroundLayers: layerKey,
          label: `${i + 1}: ${preset?.label ?? layerKey}`,
        };
      }),
    [layers]
  );

  const mode = useMemo(() => buildMode(modeKey, spyRadius), [modeKey, spyRadius]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#111",
      }}
    >
      {/* Map area fills the whole viewport; controls float on top. */}
      <CarmaMapCompare
        maps={maps}
        mode={mode}
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
      />

      {/* Floating control stack (mode row + layer row) */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center"
        style={{ maxWidth: "calc(100vw - 32px)" }}
      >
        {/* Mode row */}
        <div className="flex flex-wrap gap-2 items-center justify-center">
          <div
            className="bg-white rounded-[10px] px-1 py-0.5"
            style={{ boxShadow: PILL_SHADOW }}
          >
            <Segmented
              size="small"
              value={modeKey}
              onChange={(v) => setModeKey(v as ModeKey)}
              options={MODE_OPTIONS.map((opt) =>
                opt.value === "spyglass"
                  ? { ...opt, disabled: numPanels === 3 }
                  : opt
              )}
            />
          </div>

          <div
            className="bg-white rounded-[10px] px-1 py-0.5"
            style={{ boxShadow: PILL_SHADOW }}
          >
            <Segmented
              size="small"
              value={numPanels}
              onChange={(v) => setNumPanels(v as 2 | 3)}
              options={[
                { label: "2 Karten", value: 2 },
                { label: "3 Karten", value: 3 },
              ]}
            />
          </div>

          {modeKey === "spyglass" && (
            <div
              className="flex items-center gap-2 bg-white rounded-[10px] h-8 pl-3 pr-3"
              style={{ boxShadow: PILL_SHADOW, minWidth: 200 }}
            >
              <span className="text-sm text-gray-700 whitespace-nowrap">
                Lupe
              </span>
              <Slider
                min={60}
                max={400}
                step={10}
                value={spyRadius}
                onChange={(v) => setSpyRadius(v as number)}
                style={{ flex: 1, margin: 0 }}
              />
              <span className="text-xs text-gray-500 w-10 text-right tabular-nums">
                {spyRadius}px
              </span>
            </div>
          )}
        </div>

        {/* Per-panel layer pickers */}
        <div className="flex flex-wrap gap-2 items-center justify-center">
          {layers.map((value, index) => (
            <PanelLayerPicker
              key={index}
              index={index}
              value={value}
              onChange={(v) => setLayerAt(index, v)}
              accent={PANEL_ACCENTS[index % PANEL_ACCENTS.length]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ComparePlayground;
