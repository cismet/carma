import type { InfoBoxAction } from "@carma-api";

import { createContributionStore } from "./contribution-store";

/**
 * The buttons contributed to the selected feature's info box at runtime, the
 * store behind `carma.ui.addInfoBoxAction`. See `contribution-store.ts`.
 */
const store = createContributionStore<InfoBoxAction>();

/** add or replace an action; the remover takes it out again, once */
export const addInfoBoxAction = store.add;

export const getInfoBoxActions = store.get;

/** the contributed actions as react state, for the info box that renders them */
export const useInfoBoxActions = store.use;
