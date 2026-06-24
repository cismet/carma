import { useEffect } from "react";

import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";

import { createFloodingSceneStyle } from "../config/cesium/store.config";

type HgkKeys = Record<number, { hws?: string; noHws?: string }>;

/**
 * Drives the active Cesium scene style from the flooding control state.
 *
 * Each (simulation, HW-Schutz) combination maps to one flood water-surface
 * terrain. On change we CREATE a scene style carrying that terrain and hand the
 * style object to setCurrentSceneStyle; the runtime scene-style orchestration
 * (useSceneStyles) diffs it against the previous style and applies the delta —
 * the same flow the main app uses. Replaces the former imperative
 * useHGKCesiumTerrain, which assigned scene.terrainProvider directly and fought
 * the orchestration.
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
