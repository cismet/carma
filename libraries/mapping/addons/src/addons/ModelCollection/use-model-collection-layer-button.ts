import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { Layer, LayerStackEntry } from "@carma-mapping/layers";

import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import { applyAddonOverrides } from "../../lib/addon-overrides";
import { usePersistedAddonOverrides } from "../../lib/addon-overrides-storage";
import { resolveAddonEntries } from "../../lib/registry";
import { loadDzbPrmLayer, MODEL_COLLECTION_LAYER_ID } from "./dzb-prm-layer";

const LEGACY_MODEL_COLLECTION_LAYER_ID = "__dzb_prm_model_collection__";

export type ModelCollectionLayerBridge = {
  baseHref: string;
  getLayerStack: () => readonly LayerStackEntry[];
  subscribe: (listener: () => void) => () => void;
  append: (layer: Layer) => void;
  update: (layer: Layer) => void;
  remove: (id: string) => void;
};

export const useModelCollectionLayerButton = (
  bridge: ModelCollectionLayerBridge
) => {
  const layerStack = useSyncExternalStore(
    bridge.subscribe,
    bridge.getLayerStack
  );
  const routeAddons = useRouteAddons();
  const [overrides] = usePersistedAddonOverrides();
  const [modelState, setModelState] = useAddonState("modelCollection");
  const [shadowState] = useAddonState("shadowSimulation");
  const shadowEnabled = shadowState?.enabled === true;
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

  // A shadow workflow (or an explicit shadow URL) adds the model layer.
  // A later user removal is intentional until the next workflow activation.
  useEffect(() => {
    const currentAddon = addonRef.current;
    if (!currentAddon || !shadowEnabled) return;
    let cancelled = false;
    void loadDzbPrmLayer(currentAddon.config.manifestUrl, bridge.baseHref)
      .then((layer) => {
        if (cancelled) return;
        if (!bridge.getLayerStack().some((entry) => entry.id === layer.id)) {
          bridge.append({
            ...layer,
            visible: visibleRef.current ?? layer.visible,
            tools: [currentAddon],
          });
        }
      })
      .catch((error: unknown) => console.error("[modelCollection]", error));
    return () => {
      cancelled = true;
    };
  }, [addon?.config.manifestUrl, bridge, shadowEnabled]);

  useEffect(() => {
    if (
      layerStack.some((entry) => entry.id === LEGACY_MODEL_COLLECTION_LAYER_ID)
    ) {
      bridge.remove(LEGACY_MODEL_COLLECTION_LAYER_ID);
    }
    const current = layerStack.find(
      (entry) => entry.id === MODEL_COLLECTION_LAYER_ID
    );
    if (!addon) {
      if (current) bridge.remove(MODEL_COLLECTION_LAYER_ID);
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
      bridge.update({
        ...current,
        visible: desiredVisible,
        tools: [addon],
      });
    }
  }, [addon, bridge, layerStack, modelState, setModelState]);
};
