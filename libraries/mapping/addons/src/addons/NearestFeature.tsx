import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GeoJSONSource,
  MapMouseEvent,
  Map as MaplibreMap,
} from "maplibre-gl";

import { faCrosshairs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { useMapSelection } from "@carma-mapping/contexts";
import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../lib/registry";
import {
  collectNearestFromIndex,
  primeFeatureIndexes,
} from "../lib/featureIndex";

/**
 * Nearest-feature addon for the MapLibre map.
 *
 * A control button toggles the mode. While it is on, a click on the map drops
 * a single point marker at the click position; the next click moves it there,
 * so there is never more than one. Turning the mode off, or a route switch,
 * removes the point.
 *
 * Each placed point ranks the `nearestCount` features closest to it, logs them
 * to the console (`[NEAREST FEATURE INDEX]`) and lists them in a panel in the
 * top right corner with their distance in meters.
 *
 * The ranking comes from `featureIndex`: the tilesets' own `features.json`, one
 * id and one bounding box per feature, fetched once per tileset. Camera
 * position, zoom and layer visibility therefore play no role, a feature hidden
 * by a filter or simply off screen is ranked like any other, and a click costs
 * no requests at all. Only the layer stack's own sources take part (recognized
 * by the `metadata["layer-id"]` stamp `styleComposer` writes), so debug
 * overlays and the click marker itself never show up; a source whose tileset
 * publishes no index drops out of the ranking and is listed under
 * `withoutIndex` in the console log.
 *
 * A row in the panel is clickable: it selects that feature on the map through
 * `MapSelectionContext`, which is the same channel a result list uses. Only the
 * identifier is sent, so the feature is highlighted but the info box stays
 * closed; opening that needs the raw feature, which the index does not carry.
 *
 * MapLibre only: without a MapLibre map neither the button nor the point
 * appears.
 */

export type NearestFeatureConfig = {
  /** Render the toggle button in the control column. Default: true */
  showControl?: boolean;
  /** Corner the button is registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 75 */
  controlOrder?: number;
  /** Fill color of the click point. Default: "#1677ff" */
  pointColor?: string;
  /** Radius of the click point in pixels. Default: 7 */
  pointRadius?: number;
  /** How many nearest features are logged and listed per click. Default: 5 */
  nearestCount?: number;
  /**
   * Fetch the tilesets' feature indexes as soon as their sources appear in the
   * style, rather than on the first click. Default: true.
   */
  preloadSources?: boolean;
  /** Render the result panel while the mode is on. Default: true */
  showPanel?: boolean;
  /** Corner the panel is registered in. Default: "topright" */
  panelPosition?: Positions;
  /** Sort order within that corner. Default: 20 */
  panelOrder?: number;
};

/** geoportal's topleft column: measurement is 60, highlight 70, terrain 80 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 75;
/** below the stats panel, which registers at topright/10 */
const DEFAULT_PANEL_POSITION: Positions = "topright";
const DEFAULT_PANEL_ORDER = 20;
/** active-control blue, as used by the other geoportal controls */
const ACTIVE_COLOR = "#1677ff";

const SOURCE_ID = "nearest-feature-click-point";
const LAYER_ID = "nearest-feature-click-point";

type ClickPoint = { lng: number; lat: number };

const toFeature = (point: ClickPoint): GeoJSON.Feature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [point.lng, point.lat] },
  properties: {},
});

const DEFAULT_NEAREST_COUNT = 5;

/**
 * Presentational: crosshair icon, blue while the mode is on.
 *
 * Stateless by design — `Control` re-registers its children on every render,
 * so state kept here would be dropped. The mode lives in the addon.
 */
const NearestFeatureButton = ({
  isOn,
  onClick,
}: {
  isOn: boolean;
  onClick: () => void;
}) => (
  <Tooltip
    title={
      isOn
        ? "Nearest-Feature-Modus ausschalten"
        : "Nearest-Feature-Modus einschalten"
    }
    placement="right"
  >
    <ControlButtonStyler onClick={onClick} dataTestId="nearest-feature-control">
      <FontAwesomeIcon
        icon={faCrosshairs}
        style={isOn ? { color: ACTIVE_COLOR } : undefined}
      />
    </ControlButtonStyler>
  </Tooltip>
);

/**
 * The geoportal body stack, set explicitly rather than inherited so the panel
 * reads the same in every host, as in `VisibleFeatureStatsPanel`.
 */
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';

const PANEL_INK = {
  title: "#0d366b",
  primary: "#0b0b0b",
  secondary: "#52514e",
};

const formatMeters = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 1,
}).format;

/** what the panel needs of a ranked hit, and all it needs */
type PanelRow = {
  distanceInMeters: number;
  layerId: string;
  /** the style source the feature came from; what selection is keyed on */
  sourceId: string;
  sourceLayer?: string;
  id?: string | number;
};

/**
 * Identity of one row for selection purposes. `id` alone is not enough: the
 * pipeline's ids are unique per source-layer, not across a tileset, so ALKIS
 * repeats them between `landparcel` and `building`.
 */
const rowKey = (row: PanelRow) =>
  `${row.sourceId}::${row.sourceLayer ?? ""}::${String(row.id)}`;

/**
 * Readout for the last click: one row per ranked feature, its catalog layer as
 * the primary label, source layer and feature id below, distance on the right.
 *
 * Stateless by design — `Control` re-registers its children on every render,
 * so state kept here would be dropped. The entries live in the addon.
 */
const NearestFeaturePanel = ({
  entries,
  isLoading,
  onSelect,
  selectedKey,
}: {
  /** `null` while no point is placed yet */
  entries: PanelRow[] | null;
  /** the ranking for the last click is still being computed */
  isLoading: boolean;
  /** select the row's feature on the map; rows without an id are not clickable */
  onSelect: (row: PanelRow) => void;
  /** `rowKey` of what is selected on the map right now, or `null` */
  selectedKey: string | null;
}) => (
  <div
    className="pointer-events-auto w-[280px] rounded-lg bg-white/95 px-3.5 py-3 shadow-lg ring-1 ring-black/10"
    style={{ fontFamily: FONT_STACK }}
    data-test-id="nearest-feature-panel"
  >
    <div className="flex items-baseline justify-between gap-2">
      <span
        className="text-[11px] font-semibold uppercase leading-none tracking-[0.09em]"
        style={{ color: PANEL_INK.title }}
      >
        Nächste Features
      </span>
      {isLoading && (
        <span className="text-[11px]" style={{ color: PANEL_INK.secondary }}>
          lädt …
        </span>
      )}
    </div>

    {entries === null ? (
      <p className="mt-2 text-[12px]" style={{ color: PANEL_INK.secondary }}>
        Auf die Karte klicken, um die nächstgelegenen Objekte zu ermitteln.
      </p>
    ) : entries.length === 0 ? (
      <p className="mt-2 text-[12px]" style={{ color: PANEL_INK.secondary }}>
        keine Objekte im Ausschnitt
      </p>
    ) : (
      <ol className="mt-2.5 flex flex-col gap-1">
        {entries.map((entry, index) => {
          // a feature with no id cannot be addressed by `setFeatureState`, so
          // its row stays inert rather than pretending to be clickable
          const isSelectable = entry.id != null;
          const isSelected = isSelectable && rowKey(entry) === selectedKey;
          return (
            <li key={`${entry.layerId}-${entry.id ?? index}`}>
              <button
                type="button"
                disabled={!isSelectable}
                onClick={() => onSelect(entry)}
                title={
                  isSelectable
                    ? `${entry.layerId} · ${entry.id}`
                    : `${entry.layerId} · ohne Id, nicht auswählbar`
                }
                data-test-id="nearest-feature-row"
                className={[
                  "-mx-1.5 flex w-[calc(100%+0.75rem)] items-baseline gap-2.5",
                  "rounded px-1.5 py-1 text-left transition-colors",
                  isSelectable
                    ? "cursor-pointer hover:bg-black/[0.06]"
                    : "cursor-default",
                ].join(" ")}
                style={isSelected ? { backgroundColor: "#e6f0ff" } : undefined}
              >
                <span
                  className="flex-1 truncate text-[13px] font-medium"
                  style={{
                    color: isSelected ? ACTIVE_COLOR : PANEL_INK.primary,
                  }}
                >
                  {entry.sourceLayer}
                </span>
                <span
                  className="whitespace-nowrap text-[13px] font-medium tabular-nums"
                  style={{
                    color: isSelected ? ACTIVE_COLOR : PANEL_INK.primary,
                  }}
                >
                  {formatMeters(entry.distanceInMeters)} m
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    )}
  </div>
);

export const NearestFeature = ({
  config,
  libreMap,
}: AddonComponentProps<"nearestFeature">) => {
  const {
    showControl = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    pointColor = ACTIVE_COLOR,
    pointRadius = 7,
    nearestCount = DEFAULT_NEAREST_COUNT,
    preloadSources = true,
    showPanel = true,
    panelPosition = DEFAULT_PANEL_POSITION,
    panelOrder = DEFAULT_PANEL_ORDER,
  } = config ?? {};

  // the geoportal's programmatic selection channel. `LibreMap` watches
  // `selectedFeatureId` and writes the `selected` feature state, and the host's
  // `useSelectionForwarding` fans it out to the companion source-layers a style
  // lists in `carmaConf.selectionForwardingTo` (ALKIS: parcel + label + arrows).
  // Outside a `MapSelectionProvider` this is the context's inert default, so the
  // rows simply do nothing rather than throwing.
  const { selectFeature, selectedFeatureId } = useMapSelection();

  const [isOn, setIsOn] = useState(false);
  const [point, setPoint] = useState<ClickPoint | null>(null);
  const [nearest, setNearest] = useState<PanelRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Select the row's feature on the map. Only the identifier is passed: the
   * index knows a feature's id, not its properties, so `LibreMap` applies the
   * highlight but runs no `createFeature` and the info box stays closed. That
   * needs the raw feature, which is the next step and not this one.
   */
  const selectRow = useCallback(
    (row: PanelRow) => {
      if (row.id == null) {
        return;
      }
      console.log("[NEAREST FEATURE] selecting", {
        source: row.sourceId,
        sourceLayer: row.sourceLayer,
        id: row.id,
      });
      selectFeature({
        source: row.sourceId,
        sourceLayer: row.sourceLayer,
        id: row.id,
      });
    },
    [selectFeature]
  );

  // what the map has selected right now, in the panel's own row key, so the
  // marked row follows the map rather than the last click in here
  const selectedKey = useMemo(
    () =>
      selectedFeatureId?.id == null
        ? null
        : `${selectedFeatureId.source}::${
            selectedFeatureId.sourceLayer ?? ""
          }::${String(selectedFeatureId.id)}`,
    [selectedFeatureId]
  );

  const endMode = useCallback(() => {
    setIsOn(false);
    setPoint(null);
    setNearest(null);
    setIsLoading(false);
  }, []);

  // fetch the indexes as soon as their sources are in the style, so a click has
  // nothing left to fetch. `styledata` fires constantly; priming is a no-op
  // while the set of sources is unchanged, and each index is fetched once for
  // the whole session, so the repeated calls cost nothing.
  useEffect(() => {
    if (!libreMap || !preloadSources) {
      return;
    }
    const prime = () => primeFeatureIndexes(libreMap);
    prime();
    libreMap.on("styledata", prime);
    return () => {
      libreMap.off("styledata", prime);
    };
  }, [libreMap, preloadSources]);

  // click-to-place while the mode is on, with a crosshair cursor as feedback
  useEffect(() => {
    if (!libreMap || !isOn) {
      return;
    }
    const onClick = (event: MapMouseEvent) => {
      setPoint({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    };
    libreMap.on("click", onClick);
    const canvas = libreMap.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";
    return () => {
      libreMap.off("click", onClick);
      canvas.style.cursor = previousCursor;
    };
  }, [libreMap, isOn]);

  // rank the features by distance to the placed point, log the closest ones and
  // keep them for the panel. One linear scan over the loaded indexes, so this
  // resolves in the same tick once they are there; only the first click after a
  // style change waits, and a click that lands while it does discards it.
  useEffect(() => {
    if (!libreMap || !point) {
      return;
    }
    let isPending = true;
    setIsLoading(true);
    collectNearestFromIndex(libreMap, {
      lng: point.lng,
      lat: point.lat,
      count: nearestCount,
    })
      .then(({ entries, statuses }) => {
        if (!isPending) {
          return;
        }
        console.log("[NEAREST FEATURE INDEX]", {
          click: { lng: point.lng, lat: point.lat },
          indexed: statuses.filter((one) => one.featureCount !== null),
          withoutIndex: statuses
            .filter((one) => one.featureCount === null)
            .map((one) => one.layerId),
          nearest: entries,
        });
        setNearest(entries);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!isPending) {
          return;
        }
        console.warn("[NEAREST FEATURE INDEX] ranking failed:", error);
        setIsLoading(false);
      });
    return () => {
      isPending = false;
    };
  }, [libreMap, point, nearestCount]);

  // draw the point: one source, one circle layer, replaced on every click.
  // A style rebuild drops both, so they are reinstalled on `styledata`.
  useEffect(() => {
    if (!libreMap || !point) {
      return;
    }
    const ensurePoint = (map: MaplibreMap) => {
      try {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        if (source) {
          source.setData(toFeature(point));
        } else {
          map.addSource(SOURCE_ID, {
            type: "geojson",
            data: toFeature(point),
          });
        }
        if (!map.getLayer(LAYER_ID)) {
          map.addLayer({
            id: LAYER_ID,
            type: "circle",
            source: SOURCE_ID,
            paint: {
              "circle-radius": pointRadius,
              "circle-color": pointColor,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          });
        }
      } catch {
        // style is mid-rebuild; the next styledata installs it
      }
    };
    const onStyleData = () => ensurePoint(libreMap);
    ensurePoint(libreMap);
    libreMap.on("styledata", onStyleData);
    return () => {
      libreMap.off("styledata", onStyleData);
      try {
        if (libreMap.getLayer(LAYER_ID)) {
          libreMap.removeLayer(LAYER_ID);
        }
        if (libreMap.getSource(SOURCE_ID)) {
          libreMap.removeSource(SOURCE_ID);
        }
      } catch {
        // map is being torn down
      }
    };
  }, [libreMap, point, pointColor, pointRadius]);

  // no MapLibre map, nothing at all (leaflet-only hosts, or before the map exists)
  if (!libreMap) {
    return null;
  }

  // registers the button and the result panel into the surrounding
  // `ControlLayout`, which draws them in their corners; nothing renders here
  return (
    <>
      {showControl && (
        <Control position={controlPosition} order={controlOrder}>
          <NearestFeatureButton
            isOn={isOn}
            onClick={isOn ? endMode : () => setIsOn(true)}
          />
        </Control>
      )}
      {showPanel && isOn && (
        <Control position={panelPosition} order={panelOrder}>
          <NearestFeaturePanel
            entries={nearest}
            isLoading={isLoading}
            onSelect={selectRow}
            selectedKey={selectedKey}
          />
        </Control>
      )}
    </>
  );
};
