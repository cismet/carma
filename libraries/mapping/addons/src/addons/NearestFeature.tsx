import { useCallback, useEffect, useState } from "react";
import type {
  GeoJSONFeature,
  GeoJSONSource,
  MapMouseEvent,
  Map as MaplibreMap,
} from "maplibre-gl";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import distance from "@turf/distance";
import { lineString, point as turfPoint } from "@turf/helpers";
import pointToLineDistance from "@turf/point-to-line-distance";

import { faCrosshairs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../lib/registry";

/**
 * Nearest-feature addon for the MapLibre map.
 *
 * A control button toggles the mode. While it is on, a click on the map drops
 * a single point marker at the click position; the next click moves it there,
 * so there is never more than one. Turning the mode off, or a route switch,
 * removes the point.
 *
 * Each placed point ranks the `nearestCount` features closest to it, logs
 * them to the console (`[NEAREST FEATURE]`) and lists them in a panel in the
 * top right corner, with their distance in meters: direct distance for points,
 * perpendicular distance for lines, and zero for a polygon the point lies in
 * (its boundary distance otherwise). Features are read from the sources of
 * the layer stack's style layers (recognized by the `metadata["layer-id"]`
 * stamp `styleComposer` writes), so ad-hoc layers like debug overlays or the
 * click marker itself never show up, and the style's current visibility does
 * not matter: features hidden by a filter, a zoom range or symbol collision
 * are still ranked. Loaded tiles remain the limit — features whose tiles are
 * not loaded (far outside the viewport) are not seen.
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

const METERS = { units: "meters" } as const;

/** min distance from the click to one ring/line, in meters; short parts skipped */
const distanceToLine = (
  click: GeoJSON.Feature<GeoJSON.Point>,
  coordinates: GeoJSON.Position[]
): number =>
  coordinates.length < 2
    ? Infinity
    : pointToLineDistance(click, lineString(coordinates), METERS);

/**
 * Distance from the click to a geometry, in meters. Points measure directly,
 * lines perpendicular, polygons are zero when the click lies inside and the
 * boundary distance otherwise. Queried geometries are tile-clipped, so the
 * result reflects the loaded pieces, not the full source geometry.
 */
const distanceToGeometry = (
  click: GeoJSON.Feature<GeoJSON.Point>,
  geometry: GeoJSON.Geometry
): number => {
  switch (geometry.type) {
    case "Point":
      return distance(click, turfPoint(geometry.coordinates), METERS);
    case "MultiPoint":
      return Math.min(
        Infinity,
        ...geometry.coordinates.map((position) =>
          distance(click, turfPoint(position), METERS)
        )
      );
    case "LineString":
      return distanceToLine(click, geometry.coordinates);
    case "MultiLineString":
      return Math.min(
        Infinity,
        ...geometry.coordinates.map((line) => distanceToLine(click, line))
      );
    case "Polygon":
      if (booleanPointInPolygon(click, geometry)) {
        return 0;
      }
      return Math.min(
        Infinity,
        ...geometry.coordinates.map((ring) => distanceToLine(click, ring))
      );
    case "MultiPolygon":
      return Math.min(
        Infinity,
        ...geometry.coordinates.map((polygon) =>
          distanceToGeometry(click, { type: "Polygon", coordinates: polygon })
        )
      );
    case "GeometryCollection":
      return Math.min(
        Infinity,
        ...geometry.geometries.map((member) =>
          distanceToGeometry(click, member)
        )
      );
    default:
      return Infinity;
  }
};

/** one `querySourceFeatures` call: a source (or one of its source-layers) */
type QueryTarget = {
  sourceId: string;
  sourceLayer?: string;
  /** the layer-stack entry the source belongs to, from the metadata stamp */
  catalogLayerId: string;
};

/**
 * The distinct source/source-layer pairs behind the style layers that belong
 * to the map's layer stack, recognized by the `metadata["layer-id"]` stamp
 * `styleComposer` writes on every layer it installs. Layers added outside the
 * composer (debug overlays, drawing tools, the click marker) carry no stamp
 * and are excluded. Sources are namespaced per stack entry, so each pair maps
 * to exactly one catalog layer. Raster sources hold no queryable features and
 * are skipped.
 */
const stackedQueryTargets = (map: MaplibreMap): QueryTarget[] => {
  const targets = new Map<string, QueryTarget>();
  for (const layer of map.getStyle()?.layers ?? []) {
    const metadata = (layer as { metadata?: Record<string, unknown> }).metadata;
    const stamped = metadata?.["layer-id"];
    if (typeof stamped !== "string" || stamped === "") {
      continue;
    }
    if (!("source" in layer) || typeof layer.source !== "string") {
      continue;
    }
    const sourceType = map.getSource(layer.source)?.type;
    if (sourceType !== "vector" && sourceType !== "geojson") {
      continue;
    }
    const sourceLayer =
      "source-layer" in layer ? layer["source-layer"] : undefined;
    const key = `${layer.source}|${sourceLayer ?? ""}`;
    if (!targets.has(key)) {
      targets.set(key, {
        sourceId: layer.source,
        sourceLayer,
        catalogLayerId: stamped,
      });
    }
  }
  return [...targets.values()];
};

/** one ranked result: what the console log shows and the panel lists */
export type NearestFeatureEntry = {
  distanceInMeters: number;
  layerId: string;
  sourceLayer?: string;
  id?: string | number;
  properties: GeoJSONFeature["properties"];
  feature: GeoJSONFeature;
};

/**
 * The `count` source features closest to the click, ranked by distance over
 * everything the loaded tiles hold. Queried per source rather than per
 * rendered layer, so the current style visibility plays no role, and
 * unstamped ad-hoc sources (the click marker included) are never ranked.
 * The catalog layer is carried from the query target: source-query results
 * have no `feature.layer` to read the stamp from.
 */
const computeNearestFeatures = (
  map: MaplibreMap,
  point: ClickPoint,
  count: number
): NearestFeatureEntry[] => {
  const click = turfPoint([point.lng, point.lat]);

  const candidates = stackedQueryTargets(map).flatMap((target) =>
    map
      .querySourceFeatures(
        target.sourceId,
        target.sourceLayer ? { sourceLayer: target.sourceLayer } : undefined
      )
      .map((feature) => ({
        feature,
        target,
        distanceInMeters: distanceToGeometry(click, feature.geometry),
      }))
  );

  const ranked = candidates
    .filter(({ distanceInMeters }) => Number.isFinite(distanceInMeters))
    .sort((a, b) => a.distanceInMeters - b.distanceInMeters);

  // one entry per map object: tiles split a geometry into several pieces and
  // a source may repeat a feature id across them. Deduped on the sorted list,
  // so the nearest piece speaks for the object; id-less features all pass.
  const seen = new Set<string>();
  const nearest: NearestFeatureEntry[] = [];
  for (const { feature, target, distanceInMeters } of ranked) {
    if (feature.id != null) {
      const key = `${target.catalogLayerId}-${String(feature.id)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
    }
    nearest.push({
      distanceInMeters: Math.round(distanceInMeters * 100) / 100,
      layerId: target.catalogLayerId,
      sourceLayer: target.sourceLayer,
      id: feature.id,
      properties: feature.properties,
      feature,
    });
    if (nearest.length === count) {
      break;
    }
  }
  return nearest;
};

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

/**
 * Readout for the last click: one row per ranked feature, its catalog layer as
 * the primary label, source layer and feature id below, distance on the right.
 *
 * Stateless by design — `Control` re-registers its children on every render,
 * so state kept here would be dropped. The entries live in the addon.
 */
const NearestFeaturePanel = ({
  entries,
}: {
  /** `null` while no point is placed yet */
  entries: NearestFeatureEntry[] | null;
}) => (
  <div
    className="pointer-events-auto w-[280px] rounded-lg bg-white/95 px-3.5 py-3 shadow-lg ring-1 ring-black/10"
    style={{ fontFamily: FONT_STACK }}
    data-test-id="nearest-feature-panel"
  >
    <span
      className="text-[11px] font-semibold uppercase leading-none tracking-[0.09em]"
      style={{ color: PANEL_INK.title }}
    >
      Nächste Features
    </span>

    {entries === null ? (
      <p className="mt-2 text-[12px]" style={{ color: PANEL_INK.secondary }}>
        Auf die Karte klicken, um die nächstgelegenen Objekte zu ermitteln.
      </p>
    ) : entries.length === 0 ? (
      <p className="mt-2 text-[12px]" style={{ color: PANEL_INK.secondary }}>
        keine Objekte im Ausschnitt
      </p>
    ) : (
      <ol className="mt-2.5 flex flex-col gap-2">
        {entries.map((entry, index) => {
          return (
            <li key={`${entry.layerId}-${entry.id ?? index}`}>
              <div className="flex items-baseline gap-2.5">
                <span
                  className="flex-1 truncate text-[13px] font-medium"
                  style={{ color: PANEL_INK.primary }}
                  title={entry.layerId}
                >
                  {entry.sourceLayer}
                </span>
                <span
                  className="whitespace-nowrap text-[13px] font-medium tabular-nums"
                  style={{ color: PANEL_INK.primary }}
                >
                  {formatMeters(entry.distanceInMeters)} m
                </span>
              </div>
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
    showPanel = true,
    panelPosition = DEFAULT_PANEL_POSITION,
    panelOrder = DEFAULT_PANEL_ORDER,
  } = config ?? {};

  const [isOn, setIsOn] = useState(false);
  const [point, setPoint] = useState<ClickPoint | null>(null);
  const [nearest, setNearest] = useState<NearestFeatureEntry[] | null>(null);

  const endMode = useCallback(() => {
    setIsOn(false);
    setPoint(null);
    setNearest(null);
  }, []);

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

  // rank the rendered features by distance to the placed point, log the
  // closest ones and keep them for the panel. Before the draw effect below, so
  // the marker is not rendered yet; its layer is unstamped and skipped anyway.
  useEffect(() => {
    if (!libreMap || !point) {
      return;
    }
    const entries = computeNearestFeatures(libreMap, point, nearestCount);
    console.log("[NEAREST FEATURE]", {
      click: { lng: point.lng, lat: point.lat },
      nearest: entries,
    });
    setNearest(entries);
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
          <NearestFeaturePanel entries={nearest} />
        </Control>
      )}
    </>
  );
};
