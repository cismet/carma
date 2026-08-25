import { Control, type Positions } from "@carma-mapping/map-controls-layout";
import { WUPPERTAL_TERRAIN_SOURCE_ID } from "@carma-mapping/engines/maplibre";
import { LibreTerrainControl } from "@carma-mapping/components";

import type { AddonComponentProps } from "../lib/registry";

const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 80;

export type LibreTerrainConfig = {
  appKey?: string;
  source?: string;
  exaggeration?: number;
  controlPosition?: Positions;
  controlOrder?: number;
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
  } = config ?? {};

  if (!libreMap) {
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
