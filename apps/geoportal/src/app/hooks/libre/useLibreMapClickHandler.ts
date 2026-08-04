import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import maplibregl from "maplibre-gl";

import { useMapSelection } from "@carma-mapping/contexts";
import { utils } from "@carma-appframeworks/portals";

import {
  addCompletedVectorLayer,
  getPreferredLayerId,
  getPreferredVectorLayerId,
  getSelectedFeature,
  setSecondaryInfoBoxElements,
  setFeatures,
  setSelectedFeature,
  setPreferredLayerId,
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

const MAX_SELECTION_COUNT = 10;

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

  const { selectFeature: selectMapFeature, clearSelection: clearMapSelection } =
    useMapSelection();
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
        const isReclick =
          selectedVectorFeature.id != null &&
          (currentSelected?.id === layer.id ||
            currentSelected?.id === PLACEHOLDER_FEATURE_ID) &&
          currentSelected?.vectorId === selectedVectorFeature.id;

        if (!layer.queryable) {
          const placeholder = createPlaceholderVectorFeature(
            layer,
            selectedVectorFeature
          );
          dispatch(setSelectedFeature(placeholder));
          if (isReclick && map) {
            utils.zoomToFeature({
              selectedFeature: placeholder,
              libreMap: map,
            });
          }
          return;
        }

        const feature = await createVectorFeature(
          layer,
          selectedVectorFeature,
          map,
          e.latlng
        );
        if (feature) {
          dispatch(setSelectedFeature(feature));
          if (isReclick && map) {
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
