import { useCallback, useMemo } from "react";

import {
  DEFAULT_HIGHLIGHT_RADIUS_METERS,
  newSceneId,
} from "@carma-mapping/show-remote";

import { useAddonState } from "../../lib/AddonStateContext";
import { nextSpotTitle } from "./spot-geometry";
import { EMPTY_SPOT_CONTENT, type Spot } from "./spot-layer";

/**
 * The spot layer as the addon's parts share it: the control button, the map
 * editor, the ribbon and the row hook sit in different subtrees. The row in
 * the host's layer stack is what persists and travels into a scene; this is
 * the working copy, which the row hook keeps in step with it.
 */
export type SpotHighlightsState = {
  /** the control button's wish; the row hook adds or removes the row for it */
  isOn: boolean;
  /** whether the host has the row, mirrored by the row hook */
  hasRow: boolean;
  /** the row's eye */
  visible: boolean;
  spots: Spot[];
  /** how dark everything outside the spots gets, 0 to 1 */
  dim: number;
  /** the ribbon is open: the wheel and drags on the map change the spots */
  isEditing: boolean;
  /** the next click on the map places a spot */
  isPlacing: boolean;
};

export const INITIAL_SPOT_STATE: SpotHighlightsState = {
  isOn: false,
  hasRow: false,
  visible: true,
  ...EMPTY_SPOT_CONTENT,
  isEditing: false,
  isPlacing: false,
};

const changeSpot = (
  spots: readonly Spot[],
  id: string,
  change: (spot: Spot) => Spot
): Spot[] => spots.map((spot) => (spot.id === id ? change(spot) : spot));

export const useSpotHighlightsActions = () => {
  const [stored, setState] = useAddonState("spotHighlights");
  const state = stored ?? INITIAL_SPOT_STATE;

  /** a change worked out from the newest state, not the one rendered last */
  const change = useCallback(
    (
      update: (
        current: SpotHighlightsState
      ) => Partial<SpotHighlightsState> | null
    ) =>
      setState((previous) => {
        const current = previous ?? INITIAL_SPOT_STATE;
        const next = update(current);
        return next ? { ...current, ...next } : current;
      }),
    [setState]
  );

  const actions = useMemo(
    () => ({
      change,
      toggle: () => change(({ isOn }) => ({ isOn: !isOn })),
      startPlacing: () => change(() => ({ isPlacing: true })),
      cancelPlacing: () =>
        change(({ isPlacing }) => (isPlacing ? { isPlacing: false } : null)),
      /**
       * A new spot at `center` (EPSG:3857), named after the ones there are
       * and as large as the one placed before it
       */
      placeSpot: (center: [number, number]) =>
        change(({ spots }) => ({
          isPlacing: false,
          spots: [
            ...spots,
            {
              id: newSceneId(),
              title: nextSpotTitle(spots),
              center,
              radiusMeters:
                spots.at(-1)?.radiusMeters ?? DEFAULT_HIGHLIGHT_RADIUS_METERS,
            },
          ],
        })),
      updateSpot: (id: string, update: (spot: Spot) => Spot) =>
        change(({ spots }) => ({ spots: changeSpot(spots, id, update) })),
      renameSpot: (id: string, title: string) =>
        change(({ spots }) => ({
          spots: changeSpot(spots, id, (spot) => ({ ...spot, title })),
        })),
      removeSpot: (id: string) =>
        change(({ spots }) => ({
          spots: spots.filter((spot) => spot.id !== id),
        })),
      setDim: (update: (dim: number) => number) =>
        change(({ dim }) => ({ dim: update(dim) })),
    }),
    [change]
  );

  return { ...state, ...actions };
};
