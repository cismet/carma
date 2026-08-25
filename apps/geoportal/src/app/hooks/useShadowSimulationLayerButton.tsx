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
import { setUIShowInfo, setUIShowInfoText } from "../store/slices/ui";

export const SHADOW_SIMULATION_LAYER_ID = "__shadow_simulation__";

export const formatShadowSelection = (selection: {
  year: number;
  dayOfYear: number;
  minutes: number;
}) => {
  const date = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(selection.year, 0, selection.dayOfYear)));
  const roundedMinutes = Math.round(selection.minutes);
  const hours = String(Math.floor(roundedMinutes / 60)).padStart(2, "0");
  const minutes = String(roundedMinutes % 60).padStart(2, "0");
  return `${date} · ${hours}:${minutes}`;
};

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
            title: "Schattensimulation",
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
      dispatch(setSelectedLayerIndex(layerStack.length));
      dispatch(setUIShowInfo(true));
      dispatch(setUIShowInfoText(false));
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
      dispatch(setUIShowInfo(true));
      dispatch(setUIShowInfoText(false));
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
