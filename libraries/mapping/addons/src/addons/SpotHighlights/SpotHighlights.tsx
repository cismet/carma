import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullseye } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { useSpotHighlightsActions } from "./spot-actions";
import { wheeledDim, wheeledRadius } from "./spot-geometry";
import { useSpotEditing, useSpotMapLayers } from "./spot-map";

export type SpotHighlightsConfig = {
  controlPosition?: Positions;
  /** the show panel's button is 95, just under it */
  controlOrder?: number;
};

const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 94;

/** active-control blue */
const ACTIVE_COLOR = "#1677ff";

/**
 * Highlight spots as a layer: circles on the map with everything outside them
 * dimmed, the look the projection display gives a scene's highlights.
 *
 * The control button adds the layer and takes it away again. Its ribbon has
 * the "+" that places the next spot; while the ribbon is open, the wheel over
 * a spot sizes it, the wheel anywhere else darkens or lightens the rest, and
 * a spot can be dragged.
 *
 * The spots live in the layer's row (`spot-layer.ts`), so a pm-show scene
 * saved with the layer on the map keeps them, and publishing the show turns
 * them into the scene's highlights for the remote.
 */
export const SpotHighlights = ({
  config,
  libreMap,
}: AddonComponentProps<"spotHighlights">) => {
  const {
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config ?? {};
  const {
    hasRow,
    visible,
    spots,
    dim,
    isEditing,
    isPlacing,
    toggle,
    placeSpot,
    cancelPlacing,
    updateSpot,
    setDim,
  } = useSpotHighlightsActions();

  const isShown = hasRow && visible;
  useSpotMapLayers(libreMap, isShown ? { spots, dim } : null);
  useSpotEditing(libreMap, {
    isEditing: isShown && isEditing,
    isPlacing: isShown && isPlacing,
    spots,
    onPlace: placeSpot,
    onCancelPlacing: cancelPlacing,
    onResize: (id, pixels) =>
      updateSpot(id, (spot) => ({
        ...spot,
        radiusMeters: wheeledRadius(spot.radiusMeters, pixels),
      })),
    onDim: (pixels) => setDim((current) => wheeledDim(current, pixels)),
    onMove: (id, center) => updateSpot(id, (spot) => ({ ...spot, center })),
  });

  if (!libreMap) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <Tooltip
        title={hasRow ? "Hervorhebungen entfernen" : "Hervorhebungen hinzufügen"}
        placement="right"
      >
        <ControlButtonStyler onClick={toggle} dataTestId="spot-highlights-control">
          <FontAwesomeIcon
            icon={faBullseye}
            style={isEditing && hasRow ? { color: ACTIVE_COLOR } : undefined}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
