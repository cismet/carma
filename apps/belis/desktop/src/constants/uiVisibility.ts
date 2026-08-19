/**
 * Switches for UI that is finished but kept out of sight for the upcoming
 * merge. Nothing here is deleted — the components, their state and their wiring
 * all stay live; only the rendering is gated. Flip a flag back to `true` to
 * bring the control back, no other change needed.
 *
 * Annotated `boolean` on purpose: without it TS narrows to the literal `false`
 * and the guarded JSX reads as dead code (same reason as
 * SHOW_EDITED_COUNT_IN_DRAFT_BADGE in FormHeader).
 */

/** "Expertensuche" toggle in the Erweiterte-Suche modal header. */
export const SHOW_EXPERT_SEARCH_TOGGLE: boolean = false;

/** CSV export + print buttons in the map toolbar. */
export const SHOW_MAP_EXPORT_AND_PRINT: boolean = false;

/**
 * Wiederholfelder ("repeatable changes") clipboard controls: the copy / paste /
 * reset group in the Datenblatt header and the batch paste button in the map
 * card header. Gated together — a paste button with no way to copy is useless.
 */
export const SHOW_REPEATABLE_CHANGES_UI: boolean = false;
