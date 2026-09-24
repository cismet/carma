import { useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";

import {
  applyAddonOverrides,
  resolveAddonEntries,
  useAddonState,
  usePersistedAddonOverrides,
  useRouteAddons,
} from "@carma-mapping/addons";
import type { Layer } from "@carma-mapping/layers";
import type { RootState } from "../store";

import {
  appendLayer,
  getLayerStack,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";

/** ID carried by the generated BuGa ad-hoc layer JSON. */
export const MODEL_COLLECTION_LAYER_ID = "dzb-prm-buga";
const LEGACY_MODEL_COLLECTION_LAYER_ID = "__dzb_prm_model_collection__";

export const useModelCollectionLayerButton = () => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const layerStack = useSelector(getLayerStack);
  const routeAddons = useRouteAddons();
  const [overrides] = usePersistedAddonOverrides();
  const [modelState, setModelState] = useAddonState("modelCollection");
  const wasPresent = useRef(false);
  const visibleRef = useRef(modelState?.visible);
  visibleRef.current = modelState?.visible;
  const addon = useMemo(
    () =>
      applyAddonOverrides(resolveAddonEntries(routeAddons), overrides).find(
        (entry) => entry.kind === "modelCollection"
      ),
    [overrides, routeAddons]
  );
  const addonRef = useRef(addon);
  addonRef.current = addon;

  // Load the generated ad-hoc JSON once on route startup. A later user removal
  // is intentional and must not make a synthetic row reappear.
  useEffect(() => {
    const currentAddon = addonRef.current;
    if (!currentAddon) return;
    let cancelled = false;
    const layerUrl = new URL(
      "buga.layer.json",
      new URL(currentAddon.config.manifestUrl, globalThis.location.href)
    );
    void fetch(layerUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`BuGa layer HTTP ${response.status}`);
        return response.json() as Promise<Layer>;
      })
      .then((layer) => {
        if (cancelled) return;
        if (layer.id !== MODEL_COLLECTION_LAYER_ID || layer.type !== "object") {
          throw new Error("Invalid BuGa ad-hoc layer JSON");
        }
        if (!getLayerStack(store.getState()).some((entry) => entry.id === layer.id)) {
          dispatch(
            appendLayer({
              ...layer,
              visible: visibleRef.current ?? layer.visible,
              tools: [currentAddon],
            })
          );
        }
      })
      .catch((error: unknown) => console.error("[modelCollection]", error));
    return () => {
      cancelled = true;
    };
  }, [addon?.config.manifestUrl, dispatch, store]);

  useEffect(() => {
    if (
      layerStack.some((entry) => entry.id === LEGACY_MODEL_COLLECTION_LAYER_ID)
    ) {
      dispatch(removeLayer(LEGACY_MODEL_COLLECTION_LAYER_ID));
    }
    const current = layerStack.find(
      (entry) => entry.id === MODEL_COLLECTION_LAYER_ID
    );
    if (!addon) {
      if (current) dispatch(removeLayer(MODEL_COLLECTION_LAYER_ID));
      return;
    }
    if (!current || current.type === "group") {
      if (wasPresent.current && modelState?.visible) {
        setModelState({ ...modelState, visible: false });
      }
      wasPresent.current = false;
      return;
    }
    wasPresent.current = true;
    const desiredVisible = modelState?.visible ?? current.visible;
    if (
      current.visible !== desiredVisible ||
      JSON.stringify(current.tools?.[0]) !== JSON.stringify(addon)
    ) {
      dispatch(
        updateLayer({
          ...current,
          visible: desiredVisible,
          tools: [addon],
        })
      );
    }
  }, [addon, dispatch, layerStack, modelState, setModelState]);
};
