import { useEffect } from "react";

import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";

import { createFloodingSceneStyle } from "../config/cesium/store.config";

type HgkKeys = Record<number, { hws?: string; noHws?: string }>;

/**
 * Drives the active Cesium scene style from the flooding control state. Each
 * (simulation, HW-Schutz) combination maps to one flood water-surface terrain
 * handed to setCurrentSceneStyle for the runtime orchestration to diff and apply.
 */
export const useFloodingSceneStyleSync = (
  selectedSimulation: number,
  isHWS: boolean,
  HGK_KEYS: HgkKeys
) => {
  const { setCurrentSceneStyle } = useCesiumContext();

  useEffect(() => {
    const useHws = isHWS && selectedSimulation !== 2;
    const terrainProviderId =
      HGK_KEYS[selectedSimulation]?.[useHws ? "hws" : "noHws"];
    if (!terrainProviderId) return;
    setCurrentSceneStyle(createFloodingSceneStyle(terrainProviderId));
  }, [selectedSimulation, isHWS, HGK_KEYS, setCurrentSceneStyle]);
};
