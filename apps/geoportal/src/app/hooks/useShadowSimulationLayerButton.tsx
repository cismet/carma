import { useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createSelector } from "@reduxjs/toolkit";

import {
  createShadowTextureLayer,
  getAddonKind,
  getLayerLaunchedAddons,
  resolveShadowTextureAddon,
  SHADOW_TEXTURE_LAYER_ID,
  useAddonState,
  usePersistedAddonOverrides,
  useRouteAddons,
} from "@carma-mapping/addons";

import {
  createShadowSimulationLayer,
  resolveShadowSimulationAddon,
  SHADOW_SIMULATION_LAYER_ID,
} from "../helper/shadow-simulation-layer";
import {
  appendLayer,
  getLayers,
  getLayerStack,
  removeLayer,
  setSelectedLayerIndex,
  updateLayer,
} from "../store/slices/mapping";

export { SHADOW_SIMULATION_LAYER_ID } from "../helper/shadow-simulation-layer";
export { SHADOW_TEXTURE_LAYER_ID } from "@carma-mapping/addons";

/**
 * The layer whose style launched the shadow texture, if one did. That layer is
 * the face of the shadows: its button carries their controls and no row of
 * their own is added.
 */
export const getShadowTextureLauncherId = createSelector(
  [getLayers],
  (layers) =>
    getLayerLaunchedAddons(layers).find(
      ({ entry }) => getAddonKind(entry) === "shadowTexture"
    )?.layerId
);

export const useShadowSimulationLayerButton = () => {
  const dispatch = useDispatch();
  const layerStack = useSelector(getLayerStack);
  const launcherId = useSelector(getShadowTextureLauncherId);
  const routeAddons = useRouteAddons();
  const [addonOverrides] = usePersistedAddonOverrides();
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const shadowEnabled = shadowState?.enabled ?? false;
  const wasEnabled = useRef(false);

  const shadowAddon = useMemo(
    () => resolveShadowSimulationAddon(routeAddons, addonOverrides),
    [addonOverrides, routeAddons]
  );
  const textureAddon = useMemo(
    () => resolveShadowTextureAddon(routeAddons, addonOverrides),
    [addonOverrides, routeAddons]
  );
  const shadowLayer = useMemo(
    () =>
      createShadowTextureLayer(textureAddon, shadowEnabled) ??
      createShadowSimulationLayer(shadowAddon, shadowEnabled),
    [shadowAddon, shadowEnabled, textureAddon]
  );

  useEffect(() => {
    if (launcherId) {
      // the launching layer's button is the shadows' row
      wasEnabled.current = shadowEnabled;
      for (const rowId of [SHADOW_SIMULATION_LAYER_ID, SHADOW_TEXTURE_LAYER_ID]) {
        if (layerStack.some((entry) => entry.id === rowId)) {
          dispatch(removeLayer(rowId));
        }
      }
      return;
    }
    const layerId = shadowLayer?.id;
    const layerIndex = layerStack.findIndex((entry) => entry.id === layerId);
    const currentLayer = layerIndex >= 0 ? layerStack[layerIndex] : undefined;
    const justEnabled = shadowEnabled && !wasEnabled.current;
    wasEnabled.current = shadowEnabled;

    for (const staleId of [
      SHADOW_SIMULATION_LAYER_ID,
      SHADOW_TEXTURE_LAYER_ID,
    ]) {
      if (
        staleId !== layerId &&
        layerStack.some((entry) => entry.id === staleId)
      ) {
        dispatch(removeLayer(staleId));
      }
    }

    if (!shadowLayer) {
      if (shadowEnabled) {
        setShadowState((previous) => {
          if (!previous || !previous.enabled) return previous!;
          return { ...previous, enabled: false };
        });
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

    // The layer stack keeps the target addon's config for the secondary UI.
    // Refresh it when route/HMR config changes; otherwise the headless runtime
    // and the visible controls can operate on different terrain sources.
    if (
      currentLayer.tools?.[0] !== shadowLayer.tools?.[0] ||
      currentLayer.title !== shadowLayer.title
    ) {
      dispatch(
        updateLayer({
          ...currentLayer,
          title: shadowLayer.title,
          tools: shadowLayer.tools,
        })
      );
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
    launcherId,
    layerStack,
    setShadowState,
    shadowAddon,
    shadowEnabled,
    shadowLayer,
  ]);
};
