import { useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  applyAddonOverrides,
  resolveAddonEntries,
  useAddonState,
  usePersistedAddonOverrides,
  useRouteAddons,
} from "@carma-mapping/addons";
import type { Layer } from "@carma-mapping/layers";

import {
  appendLayer,
  getLayerStack,
  removeLayer,
  setSelectedLayerIndex,
  updateLayer,
} from "../store/slices/mapping";

export const SHADOW_SIMULATION_LAYER_ID = "__shadow_simulation__";

export const useShadowSimulationLayerButton = () => {
  const dispatch = useDispatch();
  const layerStack = useSelector(getLayerStack);
  const routeAddons = useRouteAddons();
  const [addonOverrides] = usePersistedAddonOverrides();
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const wasEnabled = useRef(false);

  const shadowAddon = useMemo(
    () =>
      applyAddonOverrides(
        resolveAddonEntries(routeAddons),
        addonOverrides
      ).find((entry) => entry.kind === "shadowSimulation"),
    [addonOverrides, routeAddons]
  );
  const shadowLayer = useMemo<Layer | null>(
    () =>
      shadowAddon
        ? {
            id: SHADOW_SIMULATION_LAYER_ID,
            title: "Schatten",
            description:
              "Sonnenstand und Schattenwurf in der gemeinsamen Three.js-Szene.",
            type: "object",
            icon: "shadow-simulation",
            iconColor: "#d97706",
            visible: shadowState?.enabled ?? false,
            pinned: "last",
            tools: [shadowAddon],
          }
        : null,
    [shadowAddon, shadowState?.enabled]
  );

  useEffect(() => {
    const layerIndex = layerStack.findIndex(
      (entry) => entry.id === SHADOW_SIMULATION_LAYER_ID
    );
    const currentLayer = layerIndex >= 0 ? layerStack[layerIndex] : undefined;
    const enabled = shadowState?.enabled ?? false;
    const justEnabled = enabled && !wasEnabled.current;
    wasEnabled.current = enabled;

    if (!shadowAddon || !shadowLayer) {
      if (enabled && shadowState) {
        setShadowState({ ...shadowState, enabled: false });
      }
      if (currentLayer) {
        dispatch(removeLayer(SHADOW_SIMULATION_LAYER_ID));
      }
      return;
    }

    if (enabled && !currentLayer) {
      dispatch(appendLayer(shadowLayer));
      // Switching the simulation on opens its info view; the appended entry
      // lands at the end of the stack.
      dispatch(setSelectedLayerIndex(layerStack.length));
      return;
    }

    if (!currentLayer || currentLayer.type === "group") {
      return;
    }

    if (currentLayer.visible !== enabled) {
      dispatch(updateLayer({ ...currentLayer, visible: enabled }));
    }

    if (justEnabled) {
      dispatch(setSelectedLayerIndex(layerIndex));
    }
  }, [
    dispatch,
    layerStack,
    setShadowState,
    shadowAddon,
    shadowLayer,
    shadowState,
  ]);
};
