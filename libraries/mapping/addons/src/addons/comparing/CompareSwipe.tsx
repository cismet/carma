import { useMemo, useState } from "react";

import { SwipeOverlay } from "@carma-mapping/core";
import { useMapLayers } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";
import { CompareStage } from "./stage/CompareStage";
import { deriveImplicitRoles } from "./stage/roles";
import { useComparingActions } from "./comparing-actions";

export type CompareSwipeConfig = {
  /** panels in a row and a vertical divider, or stacked with a horizontal one */
  orientation?: "horizontal" | "vertical";
  /** glyph endpoint for the panels' own maps, when the app overrides the default */
  overrideGlyphs?: string;
};

/**
 * Compares the layers on the map by splitting the window between two panels
 * showing the same place, with a divider the user can drag.
 *
 * The content is whatever the app's map was given: this reads the layer list
 * back off the map instance (see `mapLayers` in the maplibre engine) and hands
 * each panel a slice of it, so there is no second content configuration to keep
 * in step with the layer bar.
 *
 * Which layer goes where is not configurable yet. Until the control panel
 * exists, the topmost two go one to each side and everything below them stays
 * under both, which for a normal session is the base map.
 */
export const CompareSwipe = ({
  config,
  libreMap,
}: AddonComponentProps<"compareSwipe">) => {
  const orientation = config?.orientation ?? "horizontal";
  const { isOn } = useComparingActions();
  const layers = useMapLayers(libreMap);
  const roles = useMemo(() => deriveImplicitRoles(layers), [layers]);
  const [positions, setPositions] = useState<number[]>([0.5]);

  const clipPaths = useMemo(() => {
    const split = (positions[0] ?? 0.5) * 100;
    const left = split.toFixed(4);
    const right = (100 - split).toFixed(4);
    return orientation === "horizontal"
      ? [`inset(0 ${right}% 0 0)`, `inset(0 0 0 ${left}%)`]
      : [`inset(0 0 ${right}% 0)`, `inset(${left}% 0 0 0)`];
  }, [positions, orientation]);

  // nothing is mounted while the mode is off, so the app map is untouched and
  // no second map exists until the user actually asks for the comparison
  if (!isOn || !libreMap || roles.panels.length < 2) {
    return null;
  }

  return (
    <CompareStage
      appMap={libreMap}
      roles={roles}
      clipPaths={clipPaths}
      overrideGlyphs={config?.overrideGlyphs}
    >
      <SwipeOverlay
        orientation={orientation}
        positions={positions}
        onPositionsChange={setPositions}
      />
    </CompareStage>
  );
};
