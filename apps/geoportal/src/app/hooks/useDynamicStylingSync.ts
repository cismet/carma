import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  applyDynamicStyling,
  applyDynamicStylingToStylesheet,
  extractLayerInfo,
  extractCarmaConf,
  getDynamicStylingOptionsConfigs,
  getDynamicStylingSelections,
  getLastAppliedSelection,
  setLastAppliedSelection,
} from "@carma-mapping/components";
import { useLibreContext } from "@carma-mapping/contexts";

import {
  getLayers,
  getMaplibreMaps,
  updateLayerFromLayerInfo,
} from "../store/slices/mapping";

// Cache fetched per-layer stylesheets so we don't re-download just to
// re-extract layerInfo when the user flips between dynamic styling options.
const stylesheetCache = new Map<string, Promise<unknown>>();

const resolveLayerStylesheet = (source: unknown): Promise<any> => {
  if (typeof source === "string") {
    let pending = stylesheetCache.get(source);
    if (!pending) {
      pending = fetch(source).then((r) => r.json());
      stylesheetCache.set(source, pending);
    }
    return pending as Promise<any>;
  }
  return Promise.resolve(source);
};

export const useDynamicStylingSync = () => {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const maplibreMaps = useSelector(getMaplibreMaps);
  const { map: libreContextMap } = useLibreContext();

  useEffect(() => {
    let cancelled = false;

    layers.forEach((layer) => {
      const configs = getDynamicStylingOptionsConfigs(layer.dynamicStyling);
      if (!configs.length) {
        return;
      }

      const selections = getDynamicStylingSelections(
        layer.dynamicStylingSelection
      );

      const mapEntry = maplibreMaps?.find((entry) => entry.id === layer.id);

      // Leaflet path: each layer has its own maplibre map — mutate it in place.
      if (mapEntry?.map) {
        configs.forEach((config, idx) => {
          if (config.type !== "list" && config.type !== "toggle") {
            return;
          }
          const currentSelection = selections[idx] ?? config.default;
          const lastApplied =
            getLastAppliedSelection(layer.id, idx) ?? config.default;
          if (currentSelection === lastApplied) {
            return;
          }

          const result = applyDynamicStyling(
            mapEntry.map,
            layer.id,
            config,
            currentSelection
          );
          setLastAppliedSelection(layer.id, idx, currentSelection);
          if (result?.layerInfo || result?.carmaConf) {
            dispatch(
              updateLayerFromLayerInfo({
                id: layer.id,
                layerInfo: result.layerInfo ?? {},
                carmaConf: result.carmaConf ?? undefined,
              })
            );
          }
        });
        return;
      }

      // LibreMap path: visual transform is baked in by styleBuilder via
      // userStyleTransform. We still need to surface layerInfo changes (title,
      // icon, keywords, etc.) into Redux so the layer button rerenders.
      if (!libreContextMap) {
        return;
      }
      const styleSource = (layer.props as { style?: unknown })?.style;
      if (!styleSource) {
        return;
      }

      const pendingSelections = configs
        .map((config, idx) => ({
          config,
          idx,
          currentSelection: selections[idx] ?? config.default,
        }))
        .filter(({ config, idx, currentSelection }) => {
          if (config.type !== "list" && config.type !== "toggle") {
            return false;
          }
          const lastApplied =
            getLastAppliedSelection(layer.id, idx) ?? config.default;
          return currentSelection !== lastApplied;
        });
      if (!pendingSelections.length) {
        return;
      }

      resolveLayerStylesheet(styleSource).then((stylesheet) => {
        if (cancelled || !stylesheet) {
          return;
        }
        pendingSelections.forEach(({ config, idx, currentSelection }) => {
          const transformed = applyDynamicStylingToStylesheet(
            stylesheet,
            layer.id,
            config,
            currentSelection
          );
          setLastAppliedSelection(layer.id, idx, currentSelection);
          if (!transformed) {
            return;
          }
          const layerInfo = extractLayerInfo(transformed);
          const carmaConf = extractCarmaConf(transformed);
          if (layerInfo || carmaConf) {
            dispatch(
              updateLayerFromLayerInfo({
                id: layer.id,
                layerInfo: layerInfo ?? {},
                carmaConf: carmaConf ?? undefined,
              })
            );
          }
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [layers, maplibreMaps, libreContextMap, dispatch]);
};
