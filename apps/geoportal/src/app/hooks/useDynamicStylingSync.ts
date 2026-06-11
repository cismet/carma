import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  applyDynamicStyling,
  getDynamicStylingOptionsConfigs,
  getDynamicStylingSelections,
  getLastAppliedSelection,
  setLastAppliedSelection,
} from "@carma-mapping/components";

import {
  getLayers,
  getMaplibreMaps,
  updateLayerFromLayerInfo,
} from "../store/slices/mapping";

export const useDynamicStylingSync = () => {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const maplibreMaps = useSelector(getMaplibreMaps);

  useEffect(() => {
    layers.forEach((layer) => {
      const configs = getDynamicStylingOptionsConfigs(layer.dynamicStyling);
      if (!configs.length) {
        return;
      }

      const mapEntry = maplibreMaps?.find((entry) => entry.id === layer.id);
      if (!mapEntry?.map) {
        return;
      }

      const selections = getDynamicStylingSelections(
        layer.dynamicStylingSelection
      );

      configs.forEach((config, idx) => {
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
    });
  }, [layers, maplibreMaps, dispatch]);
};
