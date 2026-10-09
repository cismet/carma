import { useMemo } from "react";

import type { ControlsHideRequest } from "@carma-api";

import { createContributionStore } from "./contribution-store";

/**
 * The open requests to take the app's controls off the screen, the store
 * behind `carma.ui.hideControls`. See `contribution-store.ts`.
 */
const store = createContributionStore<ControlsHideRequest>();

/** add or replace a request; the remover takes it out again, once */
export const requestHideControls = store.add;

export const getControlsHideRequests = store.get;

export type ControlsHidden = {
  /** whether any request is open */
  hidden: boolean;
  /** the layer bar rows every open request lets stay, in request order */
  keepLayerRows: readonly string[];
};

const NOTHING_HIDDEN: ControlsHidden = { hidden: false, keepLayerRows: [] };

/**
 * What the app should hide right now, as react state for the components that
 * render the controls. Folded over the open requests: the controls stay
 * hidden while any request is open, and a row kept by any of them stays.
 */
export const useControlsHidden = (): ControlsHidden => {
  const requests = store.use();
  return useMemo(() => {
    if (requests.length === 0) {
      return NOTHING_HIDDEN;
    }
    const keepLayerRows = Array.from(
      new Set(requests.flatMap((request) => request.keepLayerRows ?? []))
    );
    return { hidden: true, keepLayerRows };
  }, [requests]);
};
