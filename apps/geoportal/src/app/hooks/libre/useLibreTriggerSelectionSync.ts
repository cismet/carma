import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import maplibregl from "maplibre-gl";
import pointOnFeature from "@turf/point-on-feature";

import type { Layer } from "@carma-mapping/layers";

import {
  clearTriggerSelectionById,
  getTriggerSelectionById,
} from "../../store/slices/features";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode, UIMode } from "../../store/slices/ui";
import { resolveAdhocStyleData } from "../../helper/adhoc-feature-utils";

// Safety net: if the map is already idle when the listener attaches (so no
// further "idle" event fires), the synthetic click still happens.
const IDLE_FALLBACK_MS = 2000;

type CancelableAutoSelect = { cancel: () => void };

const startDeferredAutoSelect = (
  map: maplibregl.Map,
  layer: Layer
): CancelableAutoSelect => {
  let cancelled = false;
  let idleHandler: (() => void) | null = null;
  let fallbackTimeoutId: number | null = null;

  const cleanup = () => {
    if (idleHandler) {
      map.off("idle", idleHandler);
      idleHandler = null;
    }
    if (fallbackTimeoutId !== null) {
      window.clearTimeout(fallbackTimeoutId);
      fallbackTimeoutId = null;
    }
  };

  void (async () => {
    const styleData = await resolveAdhocStyleData(layer.props?.style);
    if (cancelled || !styleData) {
      return;
    }

    const featuresWithGeometry: GeoJSON.Feature[] = [];
    for (const sourceKey in styleData.sources) {
      const source = styleData.sources[sourceKey] as any;
      if (source?.data?.type === "FeatureCollection" && source.data.features) {
        featuresWithGeometry.push(
          ...source.data.features.filter(
            (feature: GeoJSON.Feature) =>
              feature.geometry &&
              (feature.properties as { kind?: unknown } | null)?.kind !==
                "label"
          )
        );
      }
    }

    const autoSelect = layer.conf?.autoSelect;
    if (autoSelect === false) {
      return;
    }

    let featureToSelect: GeoJSON.Feature | undefined;
    if (typeof autoSelect === "string" || typeof autoSelect === "number") {
      featureToSelect = featuresWithGeometry.find(
        (feature) =>
          feature.id === autoSelect || feature.properties?.id === autoSelect
      );
    } else if (featuresWithGeometry.length === 1) {
      featureToSelect = featuresWithGeometry[0];
    }

    if (!featureToSelect?.geometry) {
      return;
    }

    const clickPoint = pointOnFeature(
      featureToSelect as GeoJSON.Feature<GeoJSON.Geometry>
    );
    const [lng, lat] = clickPoint.geometry.coordinates;

    const fireClick = () => {
      cleanup();
      if (cancelled) {
        return;
      }
      const lngLat = new maplibregl.LngLat(lng, lat);
      map.fire("click", { lngLat, point: map.project(lngLat) });
    };

    // The layer lands in the map style right after the add-flow zoom; wait
    // until the map finishes the zoom animation and renders the new layer,
    // so the synthetic click hits the rendered feature.
    idleHandler = fireClick;
    map.once("idle", idleHandler);
    fallbackTimeoutId = window.setTimeout(fireClick, IDLE_FALLBACK_MS);
  })();

  return {
    cancel: () => {
      cancelled = true;
      cleanup();
    },
  };
};

/**
 * Libre-build consumer of triggerSelectionById. Mirrors the auto-select the
 * Leaflet build performs in onMapLibreCoreMapReady (useCreateCismapLayer)
 * when an adhoc object layer is added: zoom happens in the add flow, this
 * hook selects the object afterwards via a synthetic map click.
 */
export const useLibreTriggerSelectionSync = (
  map: maplibregl.Map | null | undefined
) => {
  const dispatch = useDispatch();
  const triggerSelectionById = useSelector(getTriggerSelectionById);
  const layers = useSelector(getLayers);
  const uiMode = useSelector(getUIMode);
  const pendingRef = useRef<CancelableAutoSelect | null>(null);

  useEffect(() => {
    if (!map || !triggerSelectionById) {
      return;
    }

    // The trigger is dispatched before appendLayer lands in the store; the
    // effect reruns on layer updates until the layer is there.
    const layer = layers.find((l) => l.id === triggerSelectionById);
    if (!layer) {
      return;
    }

    dispatch(clearTriggerSelectionById());
    if (uiMode !== UIMode.DEFAULT) {
      return;
    }

    // The deferred click is managed outside the effect lifecycle on purpose:
    // clearing the trigger reruns this effect immediately, and an effect
    // cleanup would cancel the still-pending click.
    pendingRef.current?.cancel();
    pendingRef.current = startDeferredAutoSelect(map, layer as Layer);
  }, [dispatch, layers, map, triggerSelectionById, uiMode]);

  useEffect(
    () => () => {
      pendingRef.current?.cancel();
    },
    []
  );
};

export default useLibreTriggerSelectionSync;
