import { useEffect } from "react";

import { Control, type Positions } from "@carma-mapping/map-controls-layout";
import { WUPPERTAL_TERRAIN_SOURCE_ID } from "@carma-mapping/engines/maplibre";
import { LibreTerrainControl } from "@carma-mapping/components";

import type { AddonComponentProps } from "../lib/registry";
import { use3dLayers } from "../lib/use3dLayers";

const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 80;

export type LibreTerrainConfig = {
  appKey?: string;
  source?: string;
  exaggeration?: number;
  controlPosition?: Positions;
  controlOrder?: number;
  /**
   * When the button is offered. "always" is the long-standing behaviour;
   * "while3dLayersActive" shows it only while the map draws something three
   * dimensional, which is the only time relief is visible at all. Default:
   * "always".
   */
  show?: "always" | "while3dLayersActive";
};

export const LibreTerrain = ({
  config,
  libreMap,
}: AddonComponentProps<"libreTerrain">) => {
  const {
    appKey = "carma",
    source = WUPPERTAL_TERRAIN_SOURCE_ID,
    exaggeration,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    show = "always",
  } = config ?? {};

  // Ahead of the early returns: hooks may not be skipped.
  const threeDActive = use3dLayers(libreMap, show === "while3dLayersActive");
  const hidden = show === "while3dLayersActive" && !threeDActive;

  // Taking the button away while terrain is on would leave it on with nothing
  // left to switch it off, so the button going away switches it off. Terrain
  // has nothing to show on a flat map anyway.
  useEffect(() => {
    if (!libreMap || !hidden) return;
    if (libreMap.getTerrain()) {
      libreMap.setTerrain(null);
    }
  }, [libreMap, hidden]);

  if (!libreMap) {
    return null;
  }

  if (hidden) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <LibreTerrainControl
        map={libreMap}
        appKey={appKey}
        source={source}
        exaggeration={exaggeration}
      />
    </Control>
  );
};
