import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type maplibregl from "maplibre-gl";

import {
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

  const handleSelectionChanged = useCallback(
    async (e: SelectionEvent) => {
      setPos([e.latlng.lat, e.latlng.lng]);

      const currentIsModeFeatureInfo =
        uiModeRef.current === UIMode.FEATURE_INFO;
      const map = libreMapRef.current;

      if (currentIsModeFeatureInfo) {
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
        dispatch(setSelectedFeature(null));
        dispatch(setSecondaryInfoBoxElements([]));
        dispatch(setFeatures([]));
        dispatch(setPreferredLayerId(""));

        if (e.hits.length === 0) {
          return;
        }

        const selectedVectorFeature = e.hits[0];
        const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];
        const currentLayers = getLayers(store.getState());
        const layer = currentLayers.find((l) => l.id === layerId);
        if (!layer) {
          return;
        }
        const feature = await createFeature(selectedVectorFeature, layer);
        if (feature) {
          dispatch(setSelectedFeature(feature));
        }
      }
    },
    [dispatch]
  );

  return { pos, onSelectionChanged: handleSelectionChanged };
};
