import type { InfoBoxNote } from "@carma-api";

import { createContributionStore } from "./contribution-store";

/**
 * The lines of text contributed to the selected feature's info box at runtime,
 * the store behind `carma.ui.addInfoBoxNote`. See `contribution-store.ts`.
 */
const store = createContributionStore<InfoBoxNote>();

/** add or replace a note; the remover takes it out again, once */
export const addInfoBoxNote = store.add;

export const getInfoBoxNotes = store.get;

/** the contributed notes as react state, for the info box that renders them */
export const useInfoBoxNotes = store.use;
