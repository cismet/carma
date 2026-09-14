import { useCallback, useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import type { LngLatBoundsLike, MapGeoJSONFeature } from "maplibre-gl";
import { stampSourceLayerFromProperty } from "@carma-mapping/utils";

import { useMapSelection } from "../contexts/MapSelectionContext";
import { enrichHitsWithCarmaInfo } from "../lib/SelectionManager";

export interface SelectFeatureByIdOptions {
  map: maplibregl.Map | null;
  /** Source id inside the style; styleBuilder namespaces it as "<layer name>::<source id>" */
  sourceId: string;
  /** Property that identifies an item, e.g. "fid" */
  idProperty: string;
  /** The complete data the source renders, null while loading */
  collection: GeoJSON.FeatureCollection | null;
  /** Zoom for point items and upper bound when fitting a polygon. MapLibre
   *  zoom (512px tiles), one below the Leaflet-style zoom in the url hash;
   *  the default 19 matches the old zoomToFeature (url zoom 20). */
  maxZoom?: number;
  /** Padding around a fitted polygon in pixels */
  padding?: number;
}

type Position = GeoJSON.Position;

const collectPositions = (geometry: GeoJSON.Geometry, out: Position[]) => {
  switch (geometry.type) {
    case "Point":
      out.push(geometry.coordinates);
      break;
    case "MultiPoint":
    case "LineString":
      out.push(...geometry.coordinates);
      break;
    case "MultiLineString":
    case "Polygon":
      geometry.coordinates.forEach((ring) => out.push(...ring));
      break;
    case "MultiPolygon":
      geometry.coordinates.forEach((polygon) =>
        polygon.forEach((ring) => out.push(...ring))
      );
      break;
    case "GeometryCollection":
      geometry.geometries.forEach((g) => collectPositions(g, out));
      break;
  }
};

const boundsOf = (geometries: GeoJSON.Geometry[]): LngLatBoundsLike | null => {
  const positions: Position[] = [];
  geometries.forEach((g) => collectPositions(g, positions));
  if (positions.length === 0) {
    return null;
  }
  let [minX, minY] = positions[0];
  let [maxX, maxY] = positions[0];
  for (const [x, y] of positions) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
};

/** Resolves on the next idle, or after a grace period if the map has nothing to do */
const nextIdle = (map: maplibregl.Map, timeoutMs = 1500) =>
  new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        map.off("idle", done);
        resolve();
      }
    };
    map.once("idle", done);
    setTimeout(done, timeoutMs);
  });

/**
 * Programmatic selection of an item by its id for topic maps that render a
 * complete GeoJSON through a vector style: moves the map to the item, then
 * selects the rendered feature the same way a click would (visual
 * feature-state, infobox), via MapSelectionContext.
 */
export const useSelectFeatureById = ({
  map,
  sourceId,
  idProperty,
  collection,
  maxZoom = 19,
  padding = 60,
}: SelectFeatureByIdOptions) => {
  const { selectFeature } = useMapSelection();

  return useCallback(
    async (id: string | number): Promise<boolean> => {
      if (!map || !collection) {
        return false;
      }
      const wanted = String(id);
      const features = collection.features.filter(
        (feature) =>
          String(
            (feature.properties as Record<string, unknown> | null)?.[idProperty]
          ) === wanted
      );
      if (features.length === 0) {
        console.warn("[SELECT BY ID] no feature with", idProperty, id);
        return false;
      }

      const point = features.find((f) => f.geometry.type === "Point");
      const areas = features.filter((f) => f.geometry.type !== "Point");
      const bounds = boundsOf(areas.map((f) => f.geometry));
      const anchor: Position | null = point
        ? (point.geometry as GeoJSON.Point).coordinates
        : bounds
        ? [
            ((bounds as Position[])[0][0] + (bounds as Position[])[1][0]) / 2,
            ((bounds as Position[])[0][1] + (bounds as Position[])[1][1]) / 2,
          ]
        : null;
      if (!anchor) {
        return false;
      }

      if (bounds) {
        map.fitBounds(bounds, { padding, maxZoom });
      } else {
        map.easeTo({ center: anchor as [number, number], zoom: maxZoom });
      }

      // The style may still be rebuilding with the data; give it a few idles.
      for (let attempt = 0; attempt < 3; attempt++) {
        await nextIdle(map);
        const hit = map
          .queryRenderedFeatures(map.project(anchor as [number, number]))
          .find(
            (feature) =>
              feature.source.endsWith(`::${sourceId}`) &&
              !feature.layer.id.includes("selection")
          ) as MapGeoJSONFeature | undefined;
        if (hit) {
          stampSourceLayerFromProperty(hit);
          enrichHitsWithCarmaInfo(map, [hit]);
          selectFeature(
            {
              source: hit.source,
              sourceLayer: hit.sourceLayer,
              id: hit.id as string | number,
            },
            hit
          );
          return true;
        }
      }
      console.warn("[SELECT BY ID] feature not rendered at", anchor, id);
      return false;
    },
    [map, collection, sourceId, idProperty, maxZoom, padding, selectFeature]
  );
};

export interface UrlFeatureSelectionByIdOptions {
  selectById: (id: string) => Promise<boolean>;
  /** Data and map are there; the hook waits for this before reading the url */
  ready: boolean;
  /** Hash query parameter carrying the id; react-cismap's name by default */
  param?: string;
}

const removeHashParam = (param: string) => {
  const [path, query = ""] = window.location.hash.slice(1).split("?", 2);
  const params = new URLSearchParams(query);
  params.delete(param);
  const rest = params.toString();
  // replaceState: no navigation, the map's own hash writer merges from here
  window.history.replaceState(
    window.history.state,
    "",
    `#${path}${rest ? `?${rest}` : ""}`
  );
};

/**
 * Deep link to one item: `#/?...&tmSelectionObject=<id>` selects it once the
 * map has its data, then drops the parameter. Replacement for
 * useUrlFeatureSelection of the react-cismap FeatureCollection.
 */
export const useUrlFeatureSelectionById = ({
  selectById,
  ready,
  param = "tmSelectionObject",
}: UrlFeatureSelectionByIdOptions) => {
  const handled = useRef(false);
  useEffect(() => {
    if (!ready || handled.current) {
      return;
    }
    const query = window.location.hash.split("?", 2)[1];
    const id = query ? new URLSearchParams(query).get(param) : null;
    if (!id) {
      handled.current = true;
      return;
    }
    handled.current = true;
    removeHashParam(param);
    void selectById(id);
  }, [ready, param, selectById]);
};
