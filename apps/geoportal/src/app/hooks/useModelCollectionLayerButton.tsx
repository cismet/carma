import { useMemo } from "react";
import { useDispatch, useStore } from "react-redux";

import {
  useModelCollectionLayerButton as useAddonModelCollectionLayerButton,
  type ModelCollectionLayerBridge,
} from "@carma-mapping/addons";

import type { RootState } from "../store";
import {
  appendLayer,
  getLayerStack,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";

export { MODEL_COLLECTION_LAYER_ID } from "@carma-mapping/addons";

export const useModelCollectionLayerButton = () => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const bridge = useMemo<ModelCollectionLayerBridge>(
    () => ({
      baseHref: globalThis.location.href,
      getLayerStack: () => getLayerStack(store.getState()),
      subscribe: (listener) => store.subscribe(listener),
      append: (layer) => dispatch(appendLayer(layer)),
      update: (layer) => dispatch(updateLayer(layer)),
      remove: (id) => dispatch(removeLayer(id)),
    }),
    [dispatch, store]
  );
  useAddonModelCollectionLayerButton(bridge);
};
