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
  const shadowEnabled = shadowState?.enabled ?? false;
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
            visible: shadowEnabled,
            pinned: "last",
            tools: [shadowAddon],
          }
        : null,
    [shadowAddon, shadowEnabled]
  );

  useEffect(() => {
    const layerIndex = layerStack.findIndex(
      (entry) => entry.id === SHADOW_SIMULATION_LAYER_ID
    );
    const currentLayer = layerIndex >= 0 ? layerStack[layerIndex] : undefined;
    const justEnabled = shadowEnabled && !wasEnabled.current;
    wasEnabled.current = shadowEnabled;

    if (!shadowAddon || !shadowLayer) {
      if (shadowEnabled) {
        setShadowState((previous) => {
          if (!previous || !previous.enabled) return previous!;
          return { ...previous, enabled: false };
        });
      }
      if (currentLayer) {
        dispatch(removeLayer(SHADOW_SIMULATION_LAYER_ID));
      }
      return;
    }

    if (shadowEnabled && !currentLayer) {
      dispatch(appendLayer(shadowLayer));
      // Switching the simulation on opens its info view; the appended entry
      // lands at the end of the stack.
      dispatch(setSelectedLayerIndex(layerStack.length));
      return;
    }

    if (!currentLayer || currentLayer.type === "group") {
      return;
    }

    if (currentLayer.visible !== shadowEnabled) {
      dispatch(updateLayer({ ...currentLayer, visible: shadowEnabled }));
    }

    if (justEnabled) {
      dispatch(setSelectedLayerIndex(layerIndex));
    }
  }, [
    dispatch,
    layerStack,
    setShadowState,
    shadowAddon,
    shadowEnabled,
    shadowLayer,
  ]);
};
