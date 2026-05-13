import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type maplibregl from "maplibre-gl";

import { useMapSelection } from "@carma-mapping/contexts";

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
import { getUIMode, UIMode } from "../../store/slices/ui";

import store from "../../store";
import {
  onClickTopicMap,
  onSelectionChangedVector,
} from "../../components/GeoportalMap/topicmap.utils";
import { createFeature } from "../../components/GeoportalMap/libremap.utils";
import { addFeatureInfoCrosshair } from "../../components/feature-info/featureInfoMarker";

const MAX_SELECTION_COUNT = 10;

type ClickPos = [number, number] | null;

type SelectionEvent = {
  hits: maplibregl.MapGeoJSONFeature[];
  hit: maplibregl.MapGeoJSONFeature | undefined;
  latlng: maplibregl.LngLat;
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
    }
  }, [uiMode, removeFeatureInfoMarker]);

  useEffect(() => removeFeatureInfoMarker, [removeFeatureInfoMarker]);

  // Sync the redux `selectedFeature` (driven by clicks and by the infobox
  // thumbnail switcher) to MapSelectionContext, so LibreMap re-applies its
  // visual highlight to the currently-selected feature. Without this, the
  // map keeps highlighting the first hit even after the user picks a
  // different feature in the infobox. When the selection is a pseudo-feature
  // with no `sourceFeature` (e.g. the "Position" entry, or no selection at
  // all), clear the map highlight, since nothing on the map matches it.
  const { selectFeature: selectMapFeature, clearSelection: clearMapSelection } =
    useMapSelection();
  const selectedFeature = useSelector(getSelectedFeature);
  useEffect(() => {
    const sourceFeature = (
      selectedFeature as { sourceFeature?: maplibregl.MapGeoJSONFeature } | null
    )?.sourceFeature;
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
          .filter(
            (l) => l.layerType === "vector" && !layersWithHits.has(l.id)
          )
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

        const selectedVectorFeature = e.hits[0];
        const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];
        const currentLayers = getLayers(store.getState());
        const layer = currentLayers.find((l) => l.id === layerId);
        if (!layer) {
          dispatch(setSelectedFeature(null));
          return;
        }
        const feature = await createFeature(selectedVectorFeature, layer);
        if (feature) {
          dispatch(setSelectedFeature(feature));
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
  const selectFromHits = useCallback(
    (hits: maplibregl.MapGeoJSONFeature[]) => {
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
    },
    []
  );

  return {
    pos,
    onSelectionChanged: handleSelectionChanged,
    selectFromHits,
  };
};
