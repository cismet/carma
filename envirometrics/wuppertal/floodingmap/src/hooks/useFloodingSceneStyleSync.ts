import { useEffect } from "react";

import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";

type HgkKeys = Record<number, { hws?: string; noHws?: string }>;

/**
 * Drives the active Cesium scene style from the flooding control state.
 *
 * Each flood-simulation water surface is modelled as its own scene style (keyed
 * by the HGK terrain-provider id). Switching the simulation or the HW-Schutz
 * toggle simply selects the matching style; the runtime scene-style
 * orchestration (useSceneStyles) then swaps the terrain provider and applies
 * the globe look. This replaces the former imperative useHGKCesiumTerrain,
 * which assigned scene.terrainProvider directly and fought the orchestration.
 */
export const useFloodingSceneStyleSync = (
  selectedSimulation: number,
  isHWS: boolean,
  HGK_KEYS: HgkKeys
) => {
  const { setCurrentSceneStyle } = useCesiumContext();

  useEffect(() => {
    const useHws = isHWS && selectedSimulation !== 2;
    const styleId = HGK_KEYS[selectedSimulation]?.[useHws ? "hws" : "noHws"];
    if (!styleId) return;
    setCurrentSceneStyle(styleId);
  }, [selectedSimulation, isHWS, HGK_KEYS, setCurrentSceneStyle]);
};
