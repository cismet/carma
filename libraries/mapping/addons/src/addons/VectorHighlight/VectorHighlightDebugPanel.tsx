import { useCallback, useEffect, useMemo, useState } from "react";
import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";

import { Button, Checkbox, Select, Tooltip } from "antd";
import { faArrowRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Control, type Positions } from "@carma-mapping/map-controls-layout";
import { useVisibleMapFeatures } from "@carma-mapping/utils";

import type { AddonComponentProps } from "../../lib/registry";
import { useMapCanvasSize } from "../../lib/useMapCanvasSize";
import { useHighlightModeActions } from "./highlight-actions";

/** Dev harness: pick a layer, tick ids, Send. A sent id behaves like a search
 *  hit, since it drives the mode `vectorHighlight` owns. */

export type VectorHighlightDebugPanelConfig = {
  /** Corner the panel is registered in. Default: "topright" */
  position?: Positions;
  /** Sort order within that corner. Default: 20 */
  order?: number;
  /** Ids listed per layer. Default: 20 */
  limit?: number;
  /** Property the ids are matched against. Default: "id" */
  property?: string;
};

const DEFAULT_POSITION: Positions = "topright";
const DEFAULT_ORDER = 20;
const DEFAULT_LIMIT = 20;
const DEFAULT_PROPERTY = "id";

/** past its cap `useVisibleMapFeatures` returns nothing at all, not a slice */
const NO_FEATURE_CAP = Number.MAX_SAFE_INTEGER;

/** first one a feature carries becomes the row's label */
const LABEL_PROPERTIES = [
  "name",
  "lage",
  "titel",
  "title",
  "bezeichnung",
  "beschreibung",
  "strasse",
  "adresse",
];

/** geojson features carry `properties._sourceLayer` instead of `sourceLayer` */
const sourceLayerOf = (feature: MapGeoJSONFeature): string => {
  if (feature.sourceLayer) return feature.sourceLayer;
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  return String(props._sourceLayer ?? "");
};

const labelOf = (props: Record<string, unknown>): string => {
  for (const name of LABEL_PROPERTIES) {
    const value = props[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

/** keyed from `metadata["layer-id"]`, so icon and shape stay one entry */
type LayerGroups = { byKey: Map<string, string>; all: string[] };

const EMPTY_GROUPS: LayerGroups = { byKey: new Map(), all: [] };

const readLayerGroups = (map: MaplibreMap): LayerGroups => {
  const byKey = new Map<string, string>();
  const all = new Set<string>();
  for (const layer of map.getStyle()?.layers ?? []) {
    const metadata = layer.metadata as Record<string, unknown> | undefined;
    const catalogId = metadata?.["layer-id"];
    if (typeof catalogId !== "string") continue;
    const source = "source" in layer ? layer.source : undefined;
    const sourceLayer =
      "source-layer" in layer ? layer["source-layer"] : undefined;
    // raster layers have no features to list
    if (typeof source !== "string" || typeof sourceLayer !== "string") continue;
    all.add(catalogId);
    byKey.set(`${source}::${sourceLayer}`, catalogId);
  }
  return { byKey, all: Array.from(all).sort((a, b) => a.localeCompare(b)) };
};

const useLayerGroups = (map: MaplibreMap | null): LayerGroups => {
  const [groups, setGroups] = useState<LayerGroups>(EMPTY_GROUPS);

  useEffect(() => {
    if (!map) {
      setGroups(EMPTY_GROUPS);
      return;
    }
    const rebuild = () => {
      const next = readLayerGroups(map);
      // `styledata` fires on every source update
      setGroups((prev) =>
        prev.all.join("|") === next.all.join("|") &&
        prev.byKey.size === next.byKey.size
          ? prev
          : next
      );
    };
    rebuild();
    map.on("styledata", rebuild);
    return () => {
      map.off("styledata", rebuild);
    };
  }, [map]);

  return groups;
};

type Row = { id: string; label: string };

export const VectorHighlightDebugPanel = ({
  config = {},
  libreMap,
}: AddonComponentProps<"vectorHighlightDebug">) => {
  const {
    position = DEFAULT_POSITION,
    order = DEFAULT_ORDER,
    limit = DEFAULT_LIMIT,
    property = DEFAULT_PROPERTY,
  } = config;

  const [layer, setLayer] = useState<string | undefined>(undefined);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // the panel never touches MapHighlightContext; the addon owns that
  const { highlightIds, clear } = useHighlightModeActions();

  const groups = useLayerGroups(libreMap);
  const { width, height } = useMapCanvasSize(libreMap);
  const { features } = useVisibleMapFeatures({
    // 0/0 yields no features
    maplibreMap: width > 0 && height > 0 ? libreMap : null,
    visibleMapWidth: width,
    visibleMapHeight: height,
    maxFeatures: NO_FEATURE_CAP,
  });

  /** per layer: the ids in view, sorted so panning does not reorder the rows,
   *  plus the property names its features have */
  const { rowsByLayer, propsByLayer } = useMemo(() => {
    const collected = new Map<string, Map<string, Row>>();
    const seenProps = new Map<string, Set<string>>();
    for (const feature of features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const key = `${feature.source}::${sourceLayerOf(feature)}`;
      const layerId = groups.byKey.get(key) ?? sourceLayerOf(feature);

      const names = seenProps.get(layerId) ?? new Set<string>();
      for (const name of Object.keys(props)) names.add(name);
      seenProps.set(layerId, names);

      const raw = props[property];
      if (raw == null || raw === "") continue;
      const rows = collected.get(layerId) ?? new Map<string, Row>();
      const id = String(raw);
      // icon and shape yield the same id twice, the label only on one of them
      const existing = rows.get(id);
      if (!existing || !existing.label) {
        rows.set(id, { id, label: labelOf(props) });
      }
      collected.set(layerId, rows);
    }
    return {
      rowsByLayer: new Map(
        Array.from(collected.entries()).map(([layerId, rows]) => [
          layerId,
          Array.from(rows.values()).sort((a, b) =>
            a.id.localeCompare(b.id, undefined, { numeric: true })
          ),
        ])
      ),
      propsByLayer: new Map(
        Array.from(seenProps.entries()).map(([layerId, names]) => [
          layerId,
          Array.from(names)
            .filter((name) => !name.startsWith("_"))
            .sort((a, b) => a.localeCompare(b)),
        ])
      ),
    };
  }, [features, property, groups]);

  /** every vector layer the style draws, not only those with ids in view */
  const options = useMemo(() => {
    const names = new Set([...groups.all, ...rowsByLayer.keys()]);
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [groups, rowsByLayer]);

  // until the user picks one, open on a layer that has something
  const firstWithRows = options.find(
    (option) => (rowsByLayer.get(option.value)?.length ?? 0) > 0
  );
  const activeLayer = layer ?? firstWithRows?.value ?? options[0]?.value;
  const rows = (activeLayer ? rowsByLayer.get(activeLayer) ?? [] : []).slice(
    0,
    limit
  );
  const available =
    (activeLayer ? propsByLayer.get(activeLayer) : undefined) ?? [];

  const toggleRow = useCallback((id: string) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Values go bare: an id splits at the first colon, and catalog source-layer
   *  names contain colons. Bare gets `"*"` and matches on every layer. */
  const send = useCallback(() => {
    const selected = rows.filter((row) => checked.has(row.id)).map((r) => r.id);
    highlightIds(selected, { property });
  }, [rows, checked, highlightIds, property]);

  const reset = useCallback(() => {
    setChecked(new Set());
    // shared with the toolbar's clean, so the two cannot drift apart
    clear();
  }, [clear]);

  if (!libreMap) {
    return null;
  }

  return (
    <Control position={position} order={order}>
      <div className="pointer-events-auto w-[280px] rounded-lg bg-white/95 px-3 py-2.5 text-[12px] shadow-lg ring-1 ring-black/10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-600">
          Highlight by ID
        </div>

        <Select
          size="small"
          showSearch
          className="mt-2 w-full"
          placeholder="kein Vektor-Layer auf der Karte"
          value={activeLayer}
          onChange={(next: string) => {
            setLayer(next);
            setChecked(new Set());
          }}
          options={options}
        />

        <div className="mt-2 max-h-[220px] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="py-2 text-slate-400">
              {/* naming what the layer has tells "no id column" from
                  "nothing in view" */}
              kein „{property}“ im Ausschnitt.
              {available.length > 0 && (
                <>
                  {" "}
                  Vorhanden:{" "}
                  <span className="font-mono text-slate-500">
                    {available.join(", ")}
                  </span>
                </>
              )}
            </div>
          ) : (
            rows.map((row) => (
              <label
                key={row.id}
                className="flex cursor-pointer items-center gap-1.5 py-0.5 leading-tight"
              >
                <Checkbox
                  checked={checked.has(row.id)}
                  onChange={() => toggleRow(row.id)}
                />
                <span className="shrink-0 font-mono text-slate-900">
                  {property}&nbsp;{row.id}
                </span>
                {row.label && (
                  <span className="min-w-0 flex-1 truncate text-slate-500">
                    {row.label}
                  </span>
                )}
              </label>
            ))
          )}
        </div>

        <div className="mt-2 flex justify-end gap-1.5 border-t border-slate-200 pt-2">
          <Tooltip title="Auswahl und Hervorhebung zurücksetzen">
            <Button
              size="small"
              aria-label="zurücksetzen"
              icon={<FontAwesomeIcon icon={faXmark} />}
              onClick={reset}
            />
          </Tooltip>
          <Tooltip title="gewählte IDs hervorheben">
            <Button
              size="small"
              type="primary"
              aria-label="hervorheben"
              icon={<FontAwesomeIcon icon={faArrowRight} />}
              onClick={send}
            />
          </Tooltip>
        </div>
      </div>
    </Control>
  );
};
