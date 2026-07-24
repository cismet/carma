import { useEffect, useMemo, useRef, useState } from "react";

import {
  faArrowsLeftRight,
  faChevronDown,
  faChevronRight,
  faEye,
  faEyeSlash,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Select,
  Slider,
  Switch,
} from "antd";

import {
  categoryColor,
  isQualitativeRamp,
  QUALITATIVE_RAMP_NAMES,
  RAMP_NAMES,
  rampCssGradient,
} from "./colorRamps";
import type { CategoryStyle, RampName } from "./colorRamps";
import { EXPRESSION_SHORTHANDS } from "./deriveField";
import { HistogramRangeSlider } from "./HistogramRangeSlider";

// ─────────────────────────────────────────────────────────────
//  PointColorizer v2 — expert colorization console for point
//  clouds (Potree/CloudCompare-inspired, using the compact
//  Geoportal secondary-view style): a three-layer color stack (base + two
//  blend layers), each sourced from RGB, classification palette
//  or any scalar field (including baked AO and derived fields) with color
//  ramp, auto-clamped range + manual numeric inputs, gamma, blend
//  mode and opacity. Histograms under every field. QGIS-style
//  expression input creates ad-hoc derived fields. Presets live
//  in localStorage and are exportable/importable (single/all).
//
//  Rendered inside a freely draggable, collapsible, closable
//  floating panel. No map/engine dependencies — the parent maps
//  the emitted config onto its rendering layer.
// ─────────────────────────────────────────────────────────────

export interface ColorizerFieldInfo {
  name: string;
  min: number;
  max: number;
  /** min === max — nothing to visualize */
  empty: boolean;
  /** meta-ish fields (point index …) sort to the end of the list */
  meta?: boolean;
  /** normalized bin counts (0..1), fixed bin count */
  histogram: number[];
  /** Exact counts for integer-valued qualitative fields in the byte range. */
  categories?: Array<{ value: number; count: number }>;
}

export type SlotSource =
  | { kind: "rgb" }
  | { kind: "classification" }
  | { kind: "solid"; color: string }
  | { kind: "field"; field: string };

export type BlendMode = "normal" | "multiply" | "screen" | "overlay";
export type RangeMode = "clamp" | "clip";

export interface ColorSlotConfig {
  source: SlotSource | null;
  ramp: RampName;
  clampMin: number;
  clampMax: number;
  rangeModeMin: RangeMode;
  rangeModeMax: RangeMode;
  gamma: number;
  inverted: boolean;
  categoryStyles: Record<string, CategoryStyle>;
  blendMode: BlendMode;
  opacity: number;
}

export interface ColorizationConfig {
  /** base + two blend layers, applied bottom-up */
  layers: [ColorSlotConfig, ColorSlotConfig, ColorSlotConfig];
}

export const DEFAULT_SLOT: ColorSlotConfig = {
  source: null,
  ramp: "viridis",
  clampMin: 0,
  clampMax: 1,
  rangeModeMin: "clamp",
  rangeModeMax: "clamp",
  gamma: 1,
  inverted: false,
  categoryStyles: {},
  blendMode: "multiply",
  opacity: 1,
};

export const DEFAULT_COLORIZATION: ColorizationConfig = {
  layers: [
    { ...DEFAULT_SLOT, source: { kind: "rgb" } },
    { ...DEFAULT_SLOT },
    { ...DEFAULT_SLOT },
  ],
};

interface ColorPreset {
  version: 2;
  name: string;
  /** true = clamps stored absolute (field-bound), else relative 0..1 */
  absoluteClamp: boolean;
  layers: Array<{
    sourceKey: string;
    ramp: RampName;
    clamp: [number, number];
    rangeModeMin?: RangeMode;
    rangeModeMax?: RangeMode;
    rangeMode?: RangeMode;
    gamma: number;
    inverted?: boolean;
    categoryStyles?: Record<string, CategoryStyle>;
    blendMode: BlendMode;
    opacity: number;
  }>;
}

const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
];

const sourceKey = (source: SlotSource | null): string =>
  source === null
    ? "none"
    : source.kind === "field"
    ? `field:${source.field}`
    : source.kind === "solid"
    ? `solid:${source.color}`
    : source.kind;

const sourceFromKey = (key: string): SlotSource | null =>
  key === "none"
    ? null
    : key === "rgb"
    ? { kind: "rgb" }
    : key === "classification"
    ? { kind: "classification" }
    : key.startsWith("solid:")
    ? { kind: "solid", color: key.slice("solid:".length) || "#ffffff" }
    : key.startsWith("field:")
    ? { kind: "field", field: key.slice("field:".length) }
    : null;

export const formatColorizerFieldLabel = (name: string): string => {
  switch (name.trim().toLowerCase()) {
    case "z":
      return "Absolute Höhe";
    case "ao":
      return "Verschattung (AO)";
    case "intensity":
    case "intensität":
      return "Intensität";
    case "returnnumber":
    case "return_number":
    case "return number":
      return "Rückgabenummer";
    case "numberofreturns":
    case "number_of_returns":
    case "number of returns":
      return "Anzahl der Rückgaben";
    case "classification":
      return "Klassifikation";
    default:
      return name;
  }
};

export const formatColorizerSourceLabel = (
  source: SlotSource | null
): string => {
  if (source === null) return "Keine";
  if (source.kind === "rgb") return "RGB";
  if (source.kind === "classification") return "Klassifikation";
  if (source.kind === "solid") return `Farbe ${source.color}`;
  return formatColorizerFieldLabel(source.field);
};

const loadPresets = (storageKey: string): ColorPreset[] => {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as ColorPreset[]) : [];
    return parsed.filter((preset) => preset.version === 2);
  } catch {
    return [];
  }
};

const storePresets = (storageKey: string, presets: ColorPreset[]) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(presets));
  } catch {
    // storage unavailable — presets stay in memory
  }
};

const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const getPointStyleSelectionOptions = (
  source: SlotSource | null
): { value: string; label: string }[] => {
  if (source === null) return [];
  if (source.kind === "rgb") return [{ value: "rgb", label: "RGB" }];
  if (source.kind === "classification") {
    return [{ value: "classification", label: "Klassifikation" }];
  }
  if (source.kind === "solid") {
    return [{ value: sourceKey(source), label: formatColorizerSourceLabel(source) }];
  }
  return [{ value: `field:${source.field}`, label: formatColorizerFieldLabel(source.field) }];
};

// ─────────────────────────────────────────────────────────────
//  Floating panel (drag by title bar, collapse, close)
// ─────────────────────────────────────────────────────────────

export function FloatingPanel({
  title,
  headerStart,
  headerActions,
  onClose,
  showClose = true,
  className = "",
  transparent = false,
  initial = { x: 80, y: 90 },
  zIndex = 30,
  children,
}: {
  title: string;
  headerStart?: React.ReactNode;
  headerActions?: React.ReactNode;
  onClose: () => void;
  showClose?: boolean;
  className?: string;
  transparent?: boolean;
  initial?: { x: number; y: number };
  zIndex?: number;
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState(initial);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      startX: event.clientX - position.x,
      startY: event.clientY - position.y,
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition({
      x: Math.max(0, event.clientX - drag.startX),
      y: Math.max(0, event.clientY - drag.startY),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className={`fixed w-[400px] max-w-[95vw] overflow-hidden rounded-[10px] border border-gray-200 bg-white text-gray-800 shadow-[0_1px_2px_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)] ${className}`}
      style={{
        left: position.x,
        top: position.y,
        zIndex,
        ...(transparent
          ? { backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none" }
          : {}),
      }}
    >
      <div
        className="flex h-8 cursor-move select-none items-center gap-2 border-b border-gray-200 px-3"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {headerStart}
        <span className="flex-1 truncate text-sm font-medium">{title}</span>
        {headerActions}
        <button
          className="flex size-6 items-center justify-center text-gray-600 hover:text-gray-900"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Ausklappen" : "Einklappen"}
        >
          <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronDown} />
        </button>
        {showClose && (
          <button
            className="flex size-6 items-center justify-center text-gray-600 hover:text-gray-900"
            onClick={onClose}
            title="Schließen"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="max-h-[72vh] overflow-y-auto p-2">{children}</div>
      )}
    </div>
  );
}

function Histogram({
  field,
  clampMin,
  clampMax,
}: {
  field: ColorizerFieldInfo;
  clampMin: number;
  clampMax: number;
}) {
  const range = field.max - field.min || 1;
  const lowFraction = (clampMin - field.min) / range;
  const highFraction = (clampMax - field.min) / range;
  return (
    <div className="relative h-7 w-full overflow-hidden rounded border border-gray-200 bg-gray-50">
      <div className="absolute inset-0 flex items-end">
        {field.histogram.map((value, index) => {
          const fraction = (index + 0.5) / field.histogram.length;
          const inClamp = fraction >= lowFraction && fraction <= highFraction;
          return (
            <div
              key={index}
              className={inClamp ? "bg-cyan-600" : "bg-gray-300"}
              style={{
                width: `${100 / field.histogram.length}%`,
                height: `${Math.max(3, value * 100)}%`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function CategoryEditor({
  slot,
  categories,
  classification,
  classificationLabels,
  onChange,
}: {
  slot: ColorSlotConfig;
  categories: Array<{ value: number; count: number }>;
  classification: boolean;
  classificationLabels?: Readonly<Record<number, string>>;
  onChange: (slot: ColorSlotConfig) => void;
}) {
  const categoryStyles = slot.categoryStyles ?? {};
  const patchCategory = (value: number, patch: Partial<CategoryStyle>) => {
    const key = String(value);
    const current = categoryStyles[key] ?? {
      color: categoryColor(slot.ramp, value, slot.inverted),
      opacity: 1,
      visible: true,
    };
    onChange({
      ...slot,
      categoryStyles: {
        ...categoryStyles,
        [key]: { ...current, ...patch },
      },
    });
  };

  return (
    <div className="mt-1 max-h-52 overflow-y-auto rounded border border-gray-200 bg-gray-50/60">
      {categories.map(({ value, count }) => {
        const style = categoryStyles[String(value)] ?? {
          color: categoryColor(slot.ramp, value, slot.inverted),
          opacity: 1,
          visible: true,
        };
        const label =
          style.label ??
          (classification ? classificationLabels?.[value] ?? "" : "");
        return (
          <div
            key={value}
            className="grid min-h-8 grid-cols-[26px_28px_minmax(80px,1fr)_30px_64px_34px] items-center gap-1 border-b border-gray-200 px-1 last:border-b-0"
          >
            <button
              className="flex size-6 items-center justify-center text-gray-600 hover:text-gray-900"
              title={style.visible ? "Wert ausblenden" : "Wert einblenden"}
              onClick={() => patchCategory(value, { visible: !style.visible })}
            >
              <FontAwesomeIcon icon={style.visible ? faEye : faEyeSlash} />
            </button>
            {classification ? (
              <>
                <span
                  className={`text-right text-xs font-medium tabular-nums ${
                    style.visible ? "text-gray-700" : "text-gray-400"
                  }`}
                  title={`Klasse ${value} · ${count.toLocaleString(
                    "de-DE"
                  )} Punkte`}
                >
                  {value}
                </span>
                <Input
                  size="small"
                  className={style.visible ? "" : "text-gray-400"}
                  aria-label={`Bezeichnung für Klasse ${value}`}
                  placeholder="Bezeichnung"
                  value={label}
                  onChange={(event) =>
                    patchCategory(value, { label: event.target.value })
                  }
                />
              </>
            ) : (
              <span
                className={`col-span-2 truncate text-xs tabular-nums ${
                  style.visible ? "text-gray-700" : "text-gray-400 line-through"
                }`}
                title={`Wert ${value} · ${count.toLocaleString(
                  "de-DE"
                )} Punkte`}
              >
                {value}
              </span>
            )}
            <label
              className="relative size-6 cursor-pointer overflow-hidden rounded border border-gray-300"
              title="Farbe ändern"
              style={{ backgroundColor: style.color }}
            >
              <input
                className="absolute inset-0 cursor-pointer opacity-0"
                type="color"
                value={style.color}
                onChange={(event) =>
                  patchCategory(value, { color: event.target.value })
                }
              />
            </label>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={style.opacity}
              disabled={!style.visible}
              tooltip={{
                formatter: (opacity) => `${Math.round((opacity ?? 0) * 100)}%`,
              }}
              onChange={(opacity) => patchCategory(value, { opacity })}
            />
            <span className="text-right text-[11px] tabular-nums text-gray-500">
              {Math.round(style.opacity * 100)}%
            </span>
          </div>
        );
      })}
      {categories.length === 0 && (
        <div className="px-2 py-1 text-xs text-gray-500">
          Keine diskreten Werte geladen.
        </div>
      )}
    </div>
  );
}

function SlotEditor({
  index,
  slot,
  fields,
  lazyFieldNames,
  hasRgb,
  classificationLabels,
  onChange,
  onRemove,
}: {
  index: number;
  slot: ColorSlotConfig;
  fields: ColorizerFieldInfo[];
  lazyFieldNames: readonly string[];
  hasRgb: boolean;
  classificationLabels?: Readonly<Record<number, string>>;
  onChange: (slot: ColorSlotConfig) => void;
  onRemove?: () => void;
}) {
  const isBase = index === 0;
  const source = slot.source;
  const fieldInfo =
    source?.kind === "field"
      ? fields.find((field) => field.name === source.field) ?? null
      : null;
  const resolvedFieldNameRef = useRef<string | null>(
    fieldInfo && source?.kind === "field" ? source.field : null
  );
  useEffect(() => {
    const selectedFieldName = source?.kind === "field" ? source.field : null;
    const wasResolved = resolvedFieldNameRef.current === selectedFieldName;
    resolvedFieldNameRef.current = fieldInfo ? selectedFieldName : null;
    if (
      selectedFieldName &&
      fieldInfo &&
      !wasResolved &&
      slot.clampMin === 0 &&
      slot.clampMax === 1
    ) {
      onChange({
        ...slot,
        clampMin: fieldInfo.min,
        clampMax: fieldInfo.max,
      });
    }
  }, [fieldInfo, onChange, slot, source]);
  const classificationInfo =
    fields.find((field) => field.name.toLowerCase() === "classification") ??
    null;
  const classificationAvailable =
    classificationInfo !== null &&
    !classificationInfo.empty &&
    (classificationInfo.categories?.length ?? 0) > 0;
  const qualitative =
    (source?.kind === "classification" && classificationAvailable) ||
    (source?.kind === "field" && isQualitativeRamp(slot.ramp));
  const categories =
    source?.kind === "classification"
      ? classificationInfo?.categories ?? []
      : qualitative
      ? fieldInfo?.categories ?? []
      : [];

  const sortedFields = useMemo(
    () =>
      [...fields].sort(
        (a, b) => Number(a.empty || a.meta) - Number(b.empty || b.meta)
      ),
    [fields]
  );

  const options = [
    ...(hasRgb ? [{ value: "rgb", label: "RGB" }] : []),
    {
      value:
        source?.kind === "solid" ? sourceKey(source) : "solid:#ffffff",
      label: "Farbe (statisch)",
    },
    ...(classificationAvailable
      ? [{ value: "classification", label: "Klassifikation" }]
      : []),
    ...lazyFieldNames
      .filter(
        (name) =>
          !fields.some(
            (field) => field.name.toLowerCase() === name.toLowerCase()
          )
      )
      .map((name) => ({
        value: `field:${name}`,
        label: formatColorizerFieldLabel(name),
      })),
    ...sortedFields
      .filter(
        (field) => !field.empty && field.name.toLowerCase() !== "classification"
      )
      .map((field) => ({
        value: `field:${field.name}`,
        label: `${formatColorizerFieldLabel(field.name)}${
          field.empty ? " (leer)" : ""
        }${field.meta ? " (Meta)" : ""}`,
      })),
  ];

  const selectSource = (key: string) => {
    const source = sourceFromKey(key);
    const categoryStyles =
      sourceKey(slot.source) === key ? slot.categoryStyles : {};
    if (source?.kind === "field") {
      // auto-clamp to the field's full valid range on selection
      const info = fields.find((field) => field.name === source.field);
      const ramp =
        !info?.categories?.length && isQualitativeRamp(slot.ramp)
          ? "viridis"
          : slot.ramp;
      onChange({
        ...slot,
        source,
        ramp,
        categoryStyles,
        clampMin: info?.min ?? 0,
        clampMax: info?.max ?? 1,
      });
    } else {
      onChange({
        ...slot,
        source,
        categoryStyles,
        ramp:
          source?.kind === "classification" && !isQualitativeRamp(slot.ramp)
            ? "classification"
            : slot.ramp,
      });
    }
  };

  const step = fieldInfo ? (fieldInfo.max - fieldInfo.min) / 200 || 0.01 : 0.01;

  return (
    <div className="mb-1.5 rounded border border-gray-200 bg-white p-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-12 text-xs font-medium text-gray-500">
          {isBase ? "Basis" : `Ebene ${index + 1}`}
        </span>
        <Select
          size="small"
          className="w-40"
          placeholder="Quelle wählen…"
          value={
            source?.kind === "classification" && !classificationAvailable
              ? undefined
              : slot.source
              ? sourceKey(slot.source)
              : undefined
          }
          onChange={selectSource}
          options={options}
        />
        {!isBase && slot.source && (
          <>
            <Select
              size="small"
              className="w-24"
              value={slot.blendMode}
              onChange={(blendMode) => onChange({ ...slot, blendMode })}
              options={BLEND_OPTIONS}
            />
            <div className="w-20 pt-1">
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={slot.opacity}
                onChange={(opacity) => onChange({ ...slot, opacity })}
              />
            </div>
            <span className="w-9 text-xs text-gray-500">
              {(slot.opacity * 100).toFixed(0)}%
            </span>
          </>
        )}
        {onRemove && (
          <button
            className="ml-auto flex size-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            title="Blend-Komponente entfernen"
            aria-label="Blend-Komponente entfernen"
            onClick={onRemove}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>

      {((slot.source?.kind === "classification" && classificationAvailable) ||
        (slot.source?.kind === "field" &&
          fieldInfo &&
          (!fieldInfo.empty || qualitative))) && (
        <div className="flex flex-col gap-1 pt-1.5">
          <div className="flex items-center gap-2">
            <Select
              size="small"
              className="w-36"
              value={slot.ramp}
              onChange={(ramp) => onChange({ ...slot, ramp })}
              options={(source?.kind === "classification"
                ? QUALITATIVE_RAMP_NAMES
                : RAMP_NAMES
              ).map((name) => ({
                value: name,
                label: (
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-8 h-2 rounded"
                      style={{
                        background: rampCssGradient(name, slot.inverted),
                      }}
                    />
                    {name === "classification" ? "Stadtkarte" : name}
                  </span>
                ),
              }))}
            />
            <button
              className={`flex size-6 items-center justify-center rounded text-xs hover:bg-gray-100 ${
                slot.inverted ? "bg-gray-100 text-cyan-700" : "text-gray-600"
              }`}
              title="Farbskala umkehren"
              aria-label="Farbskala umkehren"
              aria-pressed={slot.inverted}
              onClick={() => onChange({ ...slot, inverted: !slot.inverted })}
            >
              <FontAwesomeIcon icon={faArrowsLeftRight} />
            </button>
            {!qualitative && (
              <>
                <span className="text-xs text-gray-500">Gamma</span>
                <div className="min-w-[48px] flex-1 pt-1">
                  <Slider
                    min={0.2}
                    max={4}
                    step={0.05}
                    value={slot.gamma}
                    onChange={(gamma) => onChange({ ...slot, gamma })}
                  />
                </div>
                <InputNumber
                  size="small"
                  className="w-14"
                  min={0.05}
                  max={10}
                  step={0.05}
                  value={slot.gamma}
                  onChange={(gamma) =>
                    gamma !== null && onChange({ ...slot, gamma })
                  }
                />
              </>
            )}
          </div>
          {qualitative ? (
            <CategoryEditor
              slot={slot}
              categories={categories}
              classification={source?.kind === "classification"}
              classificationLabels={classificationLabels}
              onChange={onChange}
            />
          ) : (
            fieldInfo && (
              <>
                <Histogram
                  field={fieldInfo}
                  clampMin={slot.clampMin}
                  clampMax={slot.clampMax}
                />
                <div className="pt-1">
                  <HistogramRangeSlider
                    min={fieldInfo.min}
                    max={fieldInfo.max}
                    step={step}
                    value={[slot.clampMin, slot.clampMax]}
                    onChange={([low, high]) =>
                      onChange({ ...slot, clampMin: low, clampMax: high })
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                  <InputNumber
                    size="small"
                    className="w-20"
                    min={fieldInfo.min}
                    max={slot.clampMax}
                    step={step}
                    value={slot.clampMin}
                    onChange={(value) =>
                      value !== null && onChange({ ...slot, clampMin: value })
                    }
                  />
                  <Switch
                    size="small"
                    checked={slot.rangeModeMin === "clip"}
                    onChange={(clip) =>
                      onChange({ ...slot, rangeModeMin: clip ? "clip" : "clamp" })
                    }
                    checkedChildren="Clip"
                    unCheckedChildren="Clamp"
                  />
                  <span className="text-xs text-gray-500">Min</span>
                  <Switch
                    size="small"
                    checked={slot.rangeModeMax === "clip"}
                    onChange={(clip) =>
                      onChange({ ...slot, rangeModeMax: clip ? "clip" : "clamp" })
                    }
                    checkedChildren="Clip"
                    unCheckedChildren="Clamp"
                  />
                  <InputNumber
                    size="small"
                    className="w-20"
                    min={slot.clampMin}
                    max={fieldInfo.max}
                    step={step}
                    value={slot.clampMax}
                    onChange={(value) =>
                      value !== null && onChange({ ...slot, clampMax: value })
                    }
                  />
                  <span className="text-xs text-gray-500">Max</span>
                </div>
              </>
            )
          )}
        </div>
      )}

      {slot.source?.kind === "solid" && (
        <div className="flex items-center gap-2 pt-1.5">
          <span className="text-xs text-gray-500">Farbe</span>
          <input
            type="color"
            value={slot.source.color}
            aria-label="Statische Mischfarbe"
            className="h-7 w-12 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
            onChange={(event) =>
              onChange({
                ...slot,
                source: { kind: "solid", color: event.target.value },
              })
            }
          />
          <span className="font-mono text-xs text-gray-500">
            {slot.source.color}
          </span>
        </div>
      )}
      {slot.source?.kind === "field" && fieldInfo?.empty && !qualitative && (
        <div className="pt-1 text-xs text-gray-500">
          Feld ist leer/konstant.
        </div>
      )}
    </div>
  );
}

export function PointColorizer({
  fields,
  hasRgb,
  value,
  onChange,
  onDeriveField,
  showDerivedFieldEditor = false,
  lazyFieldNames = [],
  classificationLabels,
  storageKey = "carma-pointcloud-color-presets",
}: {
  fields: ColorizerFieldInfo[];
  hasRgb: boolean;
  value: ColorizationConfig;
  onChange: (config: ColorizationConfig) => void;
  /** Create an ad-hoc derived field from an expression; rejects
   *  with a readable message on invalid input */
  onDeriveField?: (name: string, expression: string) => Promise<void>;
  /** Keep the experimental expression editor out of the regular asset UI. */
  showDerivedFieldEditor?: boolean;
  /** Selectable derived fields whose values are materialized on demand. */
  lazyFieldNames?: readonly string[];
  /** Dataset-specific verified labels; numeric class IDs remain authoritative. */
  classificationLabels?: Readonly<Record<number, string>>;
  storageKey?: string;
}) {
  const [presets, setPresets] = useState<ColorPreset[]>(() =>
    loadPresets(storageKey)
  );
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [absoluteClamp, setAbsoluteClamp] = useState(true);
  const [expression, setExpression] = useState("");
  const [expressionError, setExpressionError] = useState<string | null>(null);
  const [addedBlendSlots, setAddedBlendSlots] = useState<Set<number>>(
    () => new Set()
  );
  const importRef = useRef<HTMLInputElement>(null);

  const patchLayer = (index: number, slot: ColorSlotConfig) => {
    const layers = [...value.layers] as ColorizationConfig["layers"];
    layers[index] = slot;
    onChange({ layers });
  };

  const removeBlendLayer = (index: number) => {
    patchLayer(index, { ...DEFAULT_SLOT });
    setAddedBlendSlots((current) => {
      const next = new Set(current);
      next.delete(index);
      return next;
    });
  };

  const savePresets = (next: ColorPreset[]) => {
    setPresets(next);
    storePresets(storageKey, next);
  };

  const relativeClamp = (slot: ColorSlotConfig): [number, number] => {
    const source = slot.source;
    const info =
      source?.kind === "field"
        ? fields.find((field) => field.name === source.field)
        : null;
    if (!info) return [0, 1];
    const range = info.max - info.min || 1;
    return [
      (slot.clampMin - info.min) / range,
      (slot.clampMax - info.min) / range,
    ];
  };

  const saveCurrentAsPreset = () => {
    if (!presetName.trim()) return;
    const preset: ColorPreset = {
      version: 2,
      name: presetName.trim(),
      absoluteClamp,
      layers: value.layers.map((slot) => ({
        sourceKey: sourceKey(slot.source),
        ramp: slot.ramp,
        clamp: absoluteClamp
          ? [slot.clampMin, slot.clampMax]
          : relativeClamp(slot),
        rangeModeMin: slot.rangeModeMin,
        rangeModeMax: slot.rangeModeMax,
        gamma: slot.gamma,
        inverted: slot.inverted,
        categoryStyles: slot.categoryStyles,
        blendMode: slot.blendMode,
        opacity: slot.opacity,
      })),
    };
    savePresets([
      ...presets.filter((existing) => existing.name !== preset.name),
      preset,
    ]);
    setPresetName("");
    setSelectedPreset(preset.name);
  };

  const applyPreset = (preset: ColorPreset) => {
    const layers = preset.layers.slice(0, 3).map((stored) => {
      const source = sourceFromKey(stored.sourceKey);
      const ramp = RAMP_NAMES.includes(stored.ramp as RampName)
        ? stored.ramp
        : source?.kind === "classification"
        ? "classification"
        : "viridis";
      let clampMin = stored.clamp[0];
      let clampMax = stored.clamp[1];
      let resolvedSource = source;
      if (source?.kind === "field") {
        const info = fields.find((field) => field.name === source.field);
        if (!info) {
          // field missing in this cloud — disable the layer
          resolvedSource = null;
        } else if (!preset.absoluteClamp) {
          const range = info.max - info.min || 1;
          clampMin = info.min + stored.clamp[0] * range;
          clampMax = info.min + stored.clamp[1] * range;
        }
      }
      return {
        source: resolvedSource,
        ramp,
        clampMin,
        clampMax,
        rangeModeMin: stored.rangeModeMin ?? stored.rangeMode ?? "clamp",
        rangeModeMax: stored.rangeModeMax ?? stored.rangeMode ?? "clamp",
        gamma: stored.gamma,
        inverted: stored.inverted ?? false,
        categoryStyles: stored.categoryStyles ?? {},
        blendMode: stored.blendMode,
        opacity: stored.opacity,
      };
    });
    while (layers.length < 3) layers.push({ ...DEFAULT_SLOT });
    setAddedBlendSlots(new Set());
    onChange({ layers: layers as ColorizationConfig["layers"] });
  };

  const importPresets = (file: File) => {
    file.text().then((text) => {
      try {
        const imported = JSON.parse(text) as ColorPreset[] | ColorPreset;
        const list = (Array.isArray(imported) ? imported : [imported]).filter(
          (entry) => entry.version === 2
        );
        savePresets([
          ...presets.filter(
            (existing) => !list.some((entry) => entry.name === existing.name)
          ),
          ...list,
        ]);
      } catch {
        console.error("[colorizer] preset import failed: invalid JSON");
      }
    });
  };

  const runDerive = () => {
    if (!onDeriveField || !expression.trim()) return;
    setExpressionError(null);
    const name = `= ${expression.trim()}`;
    onDeriveField(name, expression.trim())
      .then(() => {
        // select the new field on the base layer
        patchLayer(0, {
          ...value.layers[0],
          source: { kind: "field", field: name },
        });
        setExpression("");
      })
      .catch((error: unknown) =>
        setExpressionError(error instanceof Error ? error.message : `${error}`)
      );
  };

  const nextBlendSlot = [1, 2].find(
    (index) => !value.layers[index].source && !addedBlendSlots.has(index)
  );

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {value.layers.map((slot, index) =>
        index === 0 || slot.source || addedBlendSlots.has(index) ? (
          <SlotEditor
            key={index}
            index={index}
            slot={slot}
            fields={fields}
            lazyFieldNames={lazyFieldNames}
            hasRgb={hasRgb}
            classificationLabels={classificationLabels}
            onChange={(next) => patchLayer(index, next)}
            onRemove={index === 0 ? undefined : () => removeBlendLayer(index)}
          />
        ) : null
      )}

      {nextBlendSlot !== undefined && (
        <Button
          size="small"
          type="dashed"
          icon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() =>
            setAddedBlendSlots((current) => new Set(current).add(nextBlendSlot))
          }
        >
          Blend-Komponente hinzufügen
        </Button>
      )}

      {showDerivedFieldEditor && onDeriveField && (
        <div className="rounded border border-gray-200 bg-white p-1.5">
          <div className="pb-1 text-xs text-gray-500">
            Abgeleitetes Feld (Ausdruck über Feldnamen, R/G/B, min/max/clamp/…)
          </div>
          <div className="flex items-center gap-1">
            <Input
              size="small"
              placeholder="z.B. intensity * (R+G+B)/3"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              onPressEnter={runDerive}
            />
            <Button size="small" type="primary" onClick={runDerive}>
              →
            </Button>
          </div>
          {expressionError && (
            <div className="pt-1 text-xs text-red-600">{expressionError}</div>
          )}
          <div className="flex gap-1 flex-wrap pt-1">
            {EXPRESSION_SHORTHANDS.map((shorthand) => (
              <button
                key={shorthand.label}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
                onClick={() => setExpression(shorthand.expression)}
                title={shorthand.expression}
              >
                {shorthand.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 rounded border border-gray-200 bg-white p-1.5">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-gray-500">Presets</span>
          <Select
            size="small"
            className="w-36"
            placeholder="wählen…"
            value={selectedPreset}
            onChange={(name) => {
              setSelectedPreset(name);
              const preset = presets.find((entry) => entry.name === name);
              if (preset) applyPreset(preset);
            }}
            options={presets.map((preset) => ({
              value: preset.name,
              label: preset.name,
            }))}
          />
          <Button
            size="small"
            disabled={!selectedPreset}
            onClick={() => {
              savePresets(
                presets.filter((preset) => preset.name !== selectedPreset)
              );
              setSelectedPreset(null);
            }}
          >
            ✕
          </Button>
          <Button
            size="small"
            onClick={() => downloadJson("color-presets.json", presets)}
          >
            Export
          </Button>
          <Button size="small" onClick={() => importRef.current?.click()}>
            Import
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importPresets(file);
              event.target.value = "";
            }}
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Input
            size="small"
            className="w-32"
            placeholder="Preset-Name"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <Checkbox
            checked={absoluteClamp}
            onChange={(event) => setAbsoluteClamp(event.target.checked)}
          >
            <span className="text-xs text-gray-600">
              Clamps absolut (feldgebunden)
            </span>
          </Checkbox>
          <Button
            size="small"
            disabled={!presetName.trim()}
            onClick={saveCurrentAsPreset}
          >
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
