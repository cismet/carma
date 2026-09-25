import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import maplibregl from "maplibre-gl";
import bbox from "@turf/bbox";
import booleanIntersects from "@turf/boolean-intersects";
import centroid from "@turf/centroid";
import distance from "@turf/distance";
import { feature as turfFeature, point } from "@turf/helpers";

import { useMapSelection } from "@carma-mapping/contexts";
import { getCarmaConf } from "@carma-mapping/engines/maplibre";
import { utils } from "@carma-appframeworks/portals";

import {
  addCompletedVectorLayer,
  findOverlappingIndex,
  getPreferredLayerId,
  getPreferredVectorLayerId,
  getSelectedFeature,
  setSecondaryInfoBoxElements,
  setFeatures,
  setOverlappingFeatures,
  setSelectedFeature,
  setPreferredLayerId,
  type VectorFeatureInfo,
} from "../../store/slices/features";
import { getLayers } from "../../store/slices/mapping";
import {
  getTriggerFeatureInfoUpdate,
  getUIMode,
  UIMode,
} from "../../store/slices/ui";

import store from "../../store";
import {
  PLACEHOLDER_FEATURE_ID,
  createPlaceholderVectorFeature,
  createVectorFeature,
  onClickTopicMap,
  onSelectionChangedVector,
} from "../../components/GeoportalMap/topicmap.utils";
import { addFeatureInfoCrosshair } from "../../components/feature-info/featureInfoMarker";
import { useSelectionForwarding } from "./useSelectionForwarding";

const MAX_SELECTION_COUNT = 10;
// a big crack can hold many small ones
const MAX_OVERLAPPING_COUNT = 20;

const RECLICK_DELAY_MS = 250;

type ClickPos = [number, number] | null;

type SelectionEvent = {
  hits: maplibregl.MapGeoJSONFeature[];
  hit: maplibregl.MapGeoJSONFeature | undefined;
  latlng: maplibregl.LngLat;
  semanticIdentifier?: string;
};

const getStyleLayerIdCandidates = (hit: maplibregl.MapGeoJSONFeature) => {
  const styleLayerId = hit.layer?.id;
  if (!styleLayerId) {
    return [];
  }
  const candidates = [styleLayerId];
  const layerId = hit.layer?.metadata?.["layer-id"];
  if (typeof layerId === "string") {
    for (const separator of ["::", "-"]) {
      const prefix = `${layerId}${separator}`;
      if (styleLayerId.startsWith(prefix)) {
        candidates.push(styleLayerId.slice(prefix.length));
        break;
      }
    }
  }
  return candidates;
};

/**
 * The hits of the same source and source-layer as the picked one (e.g. all
 * cracks under the cursor, but not the road polygon below them), topmost
 * first. Features cut at tile borders come back once per tile, so they are
 * deduplicated.
 */
const getOverlappingHits = (
  hits: maplibregl.MapGeoJSONFeature[],
  picked: maplibregl.MapGeoJSONFeature,
  maxCount: number
) => {
  const byKey = new Map<unknown, maplibregl.MapGeoJSONFeature>();
  for (const hit of hits) {
    if (hit.source !== picked.source || hit.sourceLayer !== picked.sourceLayer) {
      continue;
    }
    const key = hit.id ?? JSON.stringify(hit.properties);
    if (!byKey.has(key) || hit === picked) {
      byKey.set(key, hit);
    }
  }
  const overlapping = [...byKey.values()].slice(0, maxCount);
  if (!overlapping.includes(picked)) {
    return [picked, ...overlapping.slice(0, maxCount - 1)];
  }
  return overlapping;
};

/**
 * Features of the picked one's source that lie in or overlap its shape, e.g.
 * a small crack inside a big one, which a click on the big one doesn't hit.
 * Nearest to the click first. Only what is rendered in the viewport is found.
 */
const getHitsInShape = (
  map: maplibregl.Map,
  picked: maplibregl.MapGeoJSONFeature,
  latlng: maplibregl.LngLat
) => {
  const shape = turfFeature(picked.geometry);
  const [west, south, east, north] = bbox(shape);
  const candidates = map
    .queryRenderedFeatures([
      map.project([west, north]),
      map.project([east, south]),
    ])
    .filter(
      (hit) =>
        hit.source === picked.source &&
        hit.sourceLayer === picked.sourceLayer &&
        !hit.layer.id.includes("selection") &&
        booleanIntersects(turfFeature(hit.geometry), shape)
    );
  const click = point([latlng.lng, latlng.lat]);
  const distanceOf = (hit: maplibregl.MapGeoJSONFeature) =>
    distance(click, centroid(turfFeature(hit.geometry)));
  return candidates
    .map((hit) => ({ hit, distance: distanceOf(hit) }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ hit }) => hit);
};

/**
 * Mirrors resolveHit/getSemanticMatch of the Leaflet path: a gazetteer hit that
 * carries a semantic identifier (e.g. a land parcel) selects the hit belonging
 * to the matching layer instead of the topmost one. Hits are already ordered
 * topmost first, so the first match wins.
 */
const resolveSemanticHit = (
  hits: maplibregl.MapGeoJSONFeature[],
  layers: ReturnType<typeof getLayers>,
  semanticIdentifier: string | undefined
) => {
  if (!semanticIdentifier) {
    return undefined;
  }
  return hits.find((hit) => {
    const layerId = hit.layer?.metadata?.["layer-id"];
    const layer = layers.find((l) => l.id === layerId);
    const semanticInfo = layer?.conf?.semanticInfo as
      | Record<string, { layers: string[] }>
      | undefined;
    const semanticEntry = semanticInfo?.[semanticIdentifier];
    if (!semanticEntry) {
      return false;
    }
    const candidates = getStyleLayerIdCandidates(hit);
    return candidates.some((id) => semanticEntry.layers?.includes(id));
  });
};

/**
 * Wires the geoportal's click-to-infobox flow onto a maplibre map via the
 * onSelectionChanged callback exposed by LibreMap / CarmaMap. Mirrors the
 * shape used by useCreateCismapLayers for the Leaflet path so the same
 * dispatch logic (onClickTopicMap, onSelectionChangedVector, createFeature)
 * drives the Redux selectedFeature without registering a second click
 * handler on the map.
 */
export const useLibreMapSelectionHandler = (
  libreMap: maplibregl.Map | null | undefined
) => {
  const dispatch = useDispatch();
  const uiMode = useSelector(getUIMode);
  const uiModeRef = useRef(uiMode);
  useEffect(() => {
    uiModeRef.current = uiMode;
  }, [uiMode]);

  const libreMapRef = useRef(libreMap);
  useEffect(() => {
    libreMapRef.current = libreMap;
  }, [libreMap]);

  const [pos, setPos] = useState<ClickPos>(null);
  const posRef = useRef<ClickPos>(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  const featureInfoMarkerRef = useRef<maplibregl.Marker | null>(null);

  const removeFeatureInfoMarker = useCallback(() => {
    if (featureInfoMarkerRef.current) {
      featureInfoMarkerRef.current.remove();
      featureInfoMarkerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (uiMode !== UIMode.FEATURE_INFO) {
      removeFeatureInfoMarker();
      setPos(null);
    }
  }, [uiMode, removeFeatureInfoMarker]);

  useEffect(() => removeFeatureInfoMarker, [removeFeatureInfoMarker]);

  const {
    selectFeature: selectMapFeature,
    clearSelection: clearMapSelection,
    selectedFeatureId: mapSelectedFeatureId,
    selectionVersion: mapSelectionVersion,
  } = useMapSelection();
  const selectedFeature = useSelector(getSelectedFeature);
  useEffect(() => {
    const feature = selectedFeature as {
      sourceFeature?: maplibregl.MapGeoJSONFeature;
    } | null;
    const sourceFeature = feature?.sourceFeature;
    if (!sourceFeature?.source) {
      clearMapSelection();
      return;
    }
    selectMapFeature(
      {
        source: sourceFeature.source,
        sourceLayer: sourceFeature.sourceLayer,
        id: sourceFeature.id as string | number | undefined,
      },
      sourceFeature
    );
  }, [selectedFeature, selectMapFeature, clearMapSelection]);

  // The other direction: a selection cleared through the context by someone
  // other than the map (an addon dropping the feature it picked) must take the
  // redux feature with it, or the info box stays and the next click on that
  // feature counts as a re-click and zooms. The map's own click cycle clears
  // the context as well, right after handing the click to
  // handleSelectionChanged, so the change that follows a click is the map's and
  // is skipped; the redux feature for that click arrives on its own.
  const clickClearPendingRef = useRef(false);
  useEffect(() => {
    if (clickClearPendingRef.current) {
      clickClearPendingRef.current = false;
      return;
    }
    if (mapSelectedFeatureId) {
      return;
    }
    const current = getSelectedFeature(store.getState()) as {
      sourceFeature?: maplibregl.MapGeoJSONFeature;
    } | null;
    if (current?.sourceFeature?.source) {
      dispatch(setSelectedFeature(null));
    }
  }, [mapSelectionVersion, mapSelectedFeatureId, dispatch]);

  // styles that draw one object from several source-layers need `selected` on
  // every one of them; this runs after LibreMap has applied it to the primary
  useSelectionForwarding(libreMap);

  const layers = useSelector(getLayers);
  const triggerFeatureInfoUpdate = useSelector(getTriggerFeatureInfoUpdate);
  const layerStackSignature = useMemo(
    () => layers.map((l) => `${l.id}:${l.visible ? 1 : 0}`).join("|"),
    [layers]
  );

  const replayFeatureInfoClick = useCallback(() => {
    const map = libreMapRef.current;
    const clickPos = posRef.current;
    if (!map || !clickPos || uiModeRef.current !== UIMode.FEATURE_INFO) {
      return;
    }
    const fireClick = () => {
      const lngLat = new maplibregl.LngLat(clickPos[1], clickPos[0]);
      const point = map.project(lngLat);
      map.fire("click", { lngLat, point });
    };
    if (map.isStyleLoaded()) {
      fireClick();
    } else {
      map.once("idle", fireClick);
    }
  }, []);

  const didMountLayerSyncRef = useRef(false);
  useEffect(() => {
    if (!didMountLayerSyncRef.current) {
      didMountLayerSyncRef.current = true;
      return;
    }
    if (uiModeRef.current !== UIMode.FEATURE_INFO || !posRef.current) {
      return;
    }
    const timeout = setTimeout(replayFeatureInfoClick, RECLICK_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [layerStackSignature, triggerFeatureInfoUpdate, replayFeatureInfoClick]);

  const handleSelectionChanged = useCallback(
    async (e: SelectionEvent) => {
      // the map clears the context in this same click; see the effect above
      clickClearPendingRef.current = true;
      setPos([e.latlng.lat, e.latlng.lng]);

      const currentIsModeFeatureInfo =
        uiModeRef.current === UIMode.FEATURE_INFO;
      const map = libreMapRef.current;

      if (currentIsModeFeatureInfo) {
        if (map) {
          if (featureInfoMarkerRef.current) {
            featureInfoMarkerRef.current.setLngLat([
              e.latlng.lng,
              e.latlng.lat,
            ]);
          } else {
            featureInfoMarkerRef.current = addFeatureInfoCrosshair(map, {
              lat: e.latlng.lat,
              lng: e.latlng.lng,
            });
          }
        }

        const currentLayers = getLayers(store.getState());
        const hitsByLayer = currentLayers
          .map((layer) => ({
            hits: e.hits.filter(
              (hit) => hit.layer?.metadata?.["layer-id"] === layer.id
            ),
            layerId: layer.id,
          }))
          .filter((entry) => entry.hits.length > 0);

        hitsByLayer.forEach((layerHit) => {
          const layer = currentLayers.find((l) => l.id === layerHit.layerId);
          if (!layer) {
            return;
          }
          const limitedHits = layerHit.hits.slice(0, MAX_SELECTION_COUNT);
          const normalizedLimitedHits: maplibregl.MapGeoJSONFeature[] = [];
          limitedHits.forEach((hit) => {
            if (!normalizedLimitedHits.some((h) => h.id === hit.id)) {
              normalizedLimitedHits.push(hit);
            }
          });

          onSelectionChangedVector(
            {
              hits: normalizedLimitedHits,
              hit: normalizedLimitedHits[0],
              latlng: e.latlng,
            },
            {
              layer,
              dispatch,
              // selectionHandler is used by the Leaflet flow to collect hits
              // into a globalHits state for cross-effects; the CarmaMap path
              // does not need that state, so we pass a no-op.
              selectionHandler: () => {},
              map,
              store,
            }
          );
        });

        // Mark vector layers that received no hits as completed. Otherwise
        // the polling await inside onClickTopicMap (waiting for every
        // queryable vector layer to appear in completedVectorLayers) never
        // resolves on an empty-area click, leaving the stale infobox in
        // place. onSelectionChangedVector dispatches this itself for layers
        // it processes; here we cover the layers it never sees.
        const layersWithHits = new Set(hitsByLayer.map((h) => h.layerId));
        currentLayers
          .filter((l) => l.layerType === "vector" && !layersWithHits.has(l.id))
          .forEach((l) => {
            dispatch(addCompletedVectorLayer(l.id));
          });

        onClickTopicMap(
          {
            latlng: e.latlng,
          },
          {
            dispatch,
            mode: uiModeRef.current,
            store,
            zoom: map ? map.getZoom() + 1 : 0,
            map,
          }
        );
      } else {
        dispatch(setSecondaryInfoBoxElements([]));
        dispatch(setFeatures([]));
        dispatch(setPreferredLayerId(""));

        if (e.hits.length === 0) {
          dispatch(setSelectedFeature(null));
          return;
        }

        const currentLayers = getLayers(store.getState());
        const selectedVectorFeature =
          resolveSemanticHit(e.hits, currentLayers, e.semanticIdentifier) ??
          e.hits[0];
        const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];
        const layer = currentLayers.find((l) => l.id === layerId);
        if (!layer) {
          dispatch(setSelectedFeature(null));
          return;
        }

        const currentSelected = getSelectedFeature(store.getState()) as {
          id?: string | number;
          vectorId?: string | number;
        } | null;
        // a style layer opts out with `metadata.carmaConf.zoomOnReclick: false`
        const zoomOnReclick =
          selectedVectorFeature.id != null &&
          (currentSelected?.id === layer.id ||
            currentSelected?.id === PLACEHOLDER_FEATURE_ID) &&
          currentSelected?.vectorId === selectedVectorFeature.id &&
          getCarmaConf(selectedVectorFeature)?.zoomOnReclick !== false;

        if (!layer.queryable) {
          const placeholder = createPlaceholderVectorFeature(
            layer,
            selectedVectorFeature
          );
          dispatch(setSelectedFeature(placeholder));
          if (zoomOnReclick && map) {
            utils.zoomToFeature({
              selectedFeature: placeholder,
              libreMap: map,
            });
          }
          return;
        }

        const buildFeatures = async (hits: maplibregl.MapGeoJSONFeature[]) =>
          (
            await Promise.all(
              hits.map((hit) => createVectorFeature(layer, hit, map, e.latlng))
            )
          ).filter((f): f is NonNullable<typeof f> => !!f);

        const hitsAtClick = getOverlappingHits(
          e.hits,
          selectedVectorFeature,
          MAX_OVERLAPPING_COUNT
        );
        const featuresAtClick = await buildFeatures(hitsAtClick);
        const pickedFeature = featuresAtClick.find(
          (f) => f.sourceFeature === selectedVectorFeature
        );

        // Stepping happens on the highlight photo, so only then the group
        // grows by the features inside the picked one's shape.
        let overlappingFeatures = featuresAtClick;
        if (map && pickedFeature?.properties?.fotoHighlight) {
          const inShape = getOverlappingHits(
            [...hitsAtClick, ...getHitsInShape(map, selectedVectorFeature, e.latlng)],
            selectedVectorFeature,
            MAX_OVERLAPPING_COUNT
          ).slice(hitsAtClick.length);
          overlappingFeatures = [
            ...featuresAtClick,
            ...(await buildFeatures(inShape)),
          ];
        }

        // After stepping through the overlapping features, a click on the
        // same spot keeps the one shown (if it is under the cursor) and
        // counts as a reclick, instead of jumping back to the topmost.
        const currentAtClick =
          featuresAtClick[
            findOverlappingIndex(
              featuresAtClick,
              currentSelected as VectorFeatureInfo | null
            )
          ];
        const feature = currentAtClick ?? pickedFeature;
        const zoom = currentAtClick
          ? getCarmaConf(currentAtClick.sourceFeature)?.zoomOnReclick !== false
          : zoomOnReclick;

        dispatch(setOverlappingFeatures(overlappingFeatures));
        if (feature) {
          dispatch(setSelectedFeature(feature));
          if (zoom && map) {
            utils.zoomToFeature({ selectedFeature: feature, libreMap: map });
          }
        } else {
          dispatch(setSelectedFeature(null));
        }
      }
    },
    [dispatch]
  );

  // Pre-select the preferred hit (sticky layer from the infobox thumbnail
  // switcher) before CarmaMap applies its default visual selection on the
  // topmost hit. Without this, clicks in feature-info mode flicker: CarmaMap
  // briefly highlights the topmost feature, then onClickTopicMap resolves
  // async and dispatches the preferred feature, which switches the highlight.
  // Reading directly from the store keeps the callback closure-free.
  const selectFromHits = useCallback((hits: maplibregl.MapGeoJSONFeature[]) => {
    if (uiModeRef.current !== UIMode.FEATURE_INFO) {
      return hits[0];
    }
    const state = store.getState();
    const preferredLayerId = getPreferredLayerId(state);
    const preferredVectorLayerId = getPreferredVectorLayerId(state);

    if (preferredLayerId) {
      const match = hits.find(
        (h) => h.layer?.metadata?.["layer-id"] === preferredLayerId
      );
      if (match) {
        return match;
      }
    }
    if (preferredVectorLayerId) {
      const match = hits.find((h) => h.id === preferredVectorLayerId);
      if (match) {
        return match;
      }
    }
    return hits[0];
  }, []);

  return {
    pos,
    onSelectionChanged: handleSelectionChanged,
    selectFromHits,
  };
};
