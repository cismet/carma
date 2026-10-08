/**
 * Central event taxonomy for the geoportal's Matomo tracking.
 *
 * Matomo cannot rename categories or actions after the fact: once an event is
 * recorded it keeps its label forever, and a renamed action shows up as a
 * second, unrelated row in every report that covers both periods. Keep the
 * labels here instead of spreading string literals over the call sites.
 *
 * The labels are German on purpose - they are read as-is in the Matomo reports.
 */

export const TrackingCategory = {
  LAYER: "Layer",
  COLLECTION: "Zusammenstellung",
  BACKGROUND: "Hintergrund",
  TOOL: "Werkzeug",
  MAP_MODE: "Kartenmodus",
} as const;

export const LayerAction = {
  ADD: "hinzugefügt",
  /**
   * A layer that is on the map, counted once per browser per calendar day -
   * whether it was restored from the last session, opened from a shared link or
   * just added. The "1x/Tag" is part of the label so nobody reads the number as
   * a click count later on.
   */
  USED: "täglich genutzt (1x/Tag)",
  REMOVE: "entfernt",
  UPDATE: "aktualisiert",
  PREVIEW: "Vorschau",
  DELETE_SAVED: "gelöscht",
} as const;

export const ToolAction = {
  ADD_LAYERS: "Karteninhalte hinzufügen",
  BACKGROUND_PALE: "Hintergrund abschwächen",
  BACKGROUND_RESET: "Hintergrund zurücksetzen",
  ZEN_MODE: "Zen-Modus",
  SAVE: "Speichern",
  PRINT: "Drucken",
  SHARE: "Teilen",
  SHARE_COPY_URL: "Teilen (Link direkt kopiert)",
} as const;

export const BackgroundAction = {
  /**
   * The base map was switched. Which one it is goes into the event name, since
   * the background categories come from configuration and a route may define
   * its own - a fixed action per category would not survive a new one.
   */
  SWITCH: "gewechselt",
  OPEN_SELECTION: "Auswahl geöffnet",
} as const;

export const MapModeAction = {
  TO_3D: "3D eingeschaltet",
  TO_2D: "2D eingeschaltet",
  OBLIQUE_ON: "Schrägluftbilder eingeschaltet",
  OBLIQUE_OFF: "Schrägluftbilder ausgeschaltet",
} as const;

/**
 * Event name for a catalog item. The title is what a human reads in the report,
 * the id is what stays stable when an item gets renamed in the catalog - so the
 * name carries both.
 */
export const formatItemName = (
  title: string | undefined,
  id: string
): string => (title ? `${title} (${id})` : id);

/** Coarse map context, used as the event name for tool usage. */
export const formatMapMode = (isCesium: boolean): string =>
  isCesium ? "3D" : "2D";
