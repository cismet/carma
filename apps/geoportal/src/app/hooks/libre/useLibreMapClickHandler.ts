import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import maplibregl from "maplibre-gl";

import { useMapSelection } from "@carma-mapping/contexts";
import {
  getCarmaConf,
  resolvePropertyTarget,
} from "@carma-mapping/engines/maplibre";
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
import { useSelectionForwarding } from "./useSelectionForwarding";

const MAX_SELECTION_COUNT = 10;

const RECLICK_DELAY_MS = 250;

/** The identity a feature keeps across tiles and queries. */
const featureKeyOf = (
  feature:
    | { source?: string; sourceLayer?: string; id?: string | number }
    | null
    | undefined
) =>
  feature?.id === undefined || feature?.id === null || !feature.source
    ? undefined
    : `${feature.source}|${feature.sourceLayer ?? ""}|${String(feature.id)}`;

/**
 * What a click adds to a hit before the infobox mapping ever sees it.
 *
 * `SelectionManager.enrichHits` attaches `carmaInfo` to every hit it returns,
 * and `targetProperties` where the layer configures a property target. A
 * feature published by an addon comes straight from `queryRenderedFeatures` and
 * has neither, and the mapping functions read them: without `carmaInfo` the
 * ALKIS mapping returns null, `createVectorFeature` then returns undefined, and
 * nothing is dispatched — the feature is drawn as selected and the infobox
 * keeps showing whatever was clicked last.
 */
const enrichSelectedFeature = (
  feature: maplibregl.MapGeoJSONFeature,
  map: maplibregl.Map | null | undefined
): maplibregl.MapGeoJSONFeature => {
  const carmaConf = getCarmaConf(feature);
  const properties: Record<string, unknown> = {
    ...feature.properties,
    carmaInfo: {
      source: feature.source,
      sourceLayer: feature.sourceLayer,
      layerId: feature.layer?.id,
    },
  };

  if (map && carmaConf?.propertyTarget) {
    const targetProps = resolvePropertyTarget(
      map,
      feature.id,
      carmaConf.propertyTarget
    );
    if (targetProps) properties.targetProperties = targetProps;
  }

  return {
    ...feature,
    geometry: feature.geometry,
    properties,
  } as maplibregl.MapGeoJSONFeature;
};

/**
 * A point inside the feature's extent, standing in for the click position.
 *
 * `createVectorFeature` takes the click's lng/lat, which a selection published
 * by an addon does not have. It is only used for the legacy GetFeatureInfo URL
 * and the position readout, so the centre of the geometry's extent is a fair
 * stand-in for "where the user is looking".
 */
const extentCentreOf = (
  geometry: GeoJSON.Geometry | undefined
): maplibregl.LngLat | undefined => {
  if (!geometry || geometry.type === "GeometryCollection") return undefined;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      const [lng, lat] = value as [number, number];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const entry of value) visit(entry);
  };
  visit(geometry.coordinates);
  if (minLng === Infinity) return undefined;
  return new maplibregl.LngLat((minLng + maxLng) / 2, (minLat + maxLat) / 2);
};

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

  const {
    selectFeature: selectMapFeature,
    clearSelection: clearMapSelection,
    rawFeature: contextRawFeature,
    selectionVersion,
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

  /**
   * The other direction: a selection published into the map selection context
   * becomes the app's selected feature.
   *
   * Everything above flows one way, from the store into the context, because
   * clicking was the only way this app selected anything. An addon that
   * publishes a selection — arrow-key navigation does — was therefore drawn as
   * selected and nothing else: the infobox kept showing the feature clicked
   * before it, and the store still held that one, so clicking it again counted
   * as a re-click and zoomed to it.
   *
   * It goes through `handleSelectionChanged` rather than beside it, as the hit a
   * click would have produced, so the infobox is built by exactly the code a
   * click runs. The store's feature carries the `sourceFeature` it was built
   * from, so comparing identities tells an addon's selection from the echo of
   * this app's own and ends the round trip.
   */
  useEffect(() => {
    if (!contextRawFeature) return;

    const current = getSelectedFeature(store.getState()) as {
      sourceFeature?: maplibregl.MapGeoJSONFeature;
    } | null;
    if (
      featureKeyOf(contextRawFeature) === featureKeyOf(current?.sourceFeature)
    ) {
      return;
    }

    const map = libreMapRef.current;
    const latlng = extentCentreOf(contextRawFeature.geometry);
    if (!map || !latlng) return;

    // `SelectionManager` enriches real hits before the app ever sees them;
    // a feature from `queryRenderedFeatures` needs the same treatment
    const hit = enrichSelectedFeature(contextRawFeature, map);
    const layerId = hit.layer?.metadata?.["layer-id"];
    const layer = getLayers(store.getState()).find(
      (entry) => entry.id === layerId
    );
    console.info("[SELECTION_SYNC] building infobox feature", {
      layerId,
      layerFound: !!layer,
      propertyKeys: Object.keys(hit.properties ?? {}),
      infoboxMapping: Array.isArray(layer?.conf?.infoboxMapping)
        ? (layer.conf.infoboxMapping as string[]).join("\n")
        : layer?.conf?.infoboxMapping,
    });
    if (!layer) return;

    void createVectorFeature(layer, hit, map, latlng).then((feature) => {
      console.info("[SELECTION_SYNC] built", { hasFeature: !!feature });
      if (feature) dispatch(setSelectedFeature(feature));
    });
    // `selectionVersion` stands for a reselection of the same feature object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextRawFeature, selectionVersion, dispatch]);

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
