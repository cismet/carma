/**
 * Attributesets (wupp #4128): one record per Anwendungsfall of the tree app.
 *
 * Which record applies is decided per logged-in user through the config
 * attribute `APP_CONFIG.attributesetConfigAttributeKey` (wupp #4145). A user
 * without that attribute, or with an unknown value, gets the default record,
 * which is exactly the behaviour the app had before attributesets existed.
 */

export type ActionStatus = "open" | "done" | "exception";

/**
 * "photo": Gestartet / Abgeschlossen / Ausnahme with a mandatory photo.
 * "confirm": a single confirmation button, no photo, the action is stored as
 * `done` right away.
 */
export type WorkflowKind = "photo" | "confirm";

export type VectorOverlay = {
  key: string;
  style: string;
  opacity?: number;
};

export type AttributesetConfig = {
  id: string;
  workflow: WorkflowKind;
  /** `key` stamped on every uploaded action. Must exist in `tzb_action`. */
  actionKey: string;
  /** Infobox header without the status suffix, e.g. "Baumbewirtschaftung". */
  headerLabel: string;
  /** Stored as `description` on the action. */
  statusDescription: Record<ActionStatus, string>;
  /** Label of the single button in the "confirm" workflow. */
  confirmLabel?: string;
  /** Extra vector layers shown to "*" users (Auftraggeber) only. */
  adminOverlays?: VectorOverlay[];
};

export const DEFAULT_ATTRIBUTESET_ID = "crownmaintenance";

export const ATTRIBUTESETS: Record<string, AttributesetConfig> = {
  crownmaintenance: {
    id: "crownmaintenance",
    workflow: "photo",
    actionKey: "shoot_cutting",
    headerLabel: "Baumbewirtschaftung",
    statusDescription: {
      open: "Zurückschneiden von Stamm und Stockaustrieb",
      done: "Arbeiten abgeschlossen",
      exception: "Ausnahme bei der Bearbeitung",
    },
  },
  irrigation: {
    id: "irrigation",
    workflow: "confirm",
    actionKey: "irrigation",
    headerLabel: "Baumbewässerung",
    statusDescription: {
      open: "Bewässerung begonnen",
      done: "Bewässerung durchgeführt",
      exception: "Ausnahme bei der Bewässerung",
    },
    confirmLabel: "Bewässerung bestätigen",
    adminOverlays: [
      {
        // Watermark-Bodenfeuchtesensoren, same layer as in the geoportal
        // (wuppSensorsBoden:soilMoistureWatermark).
        key: "soil-moisture-watermark",
        style:
          "https://tiles.cismet.de/bodenfeuchtesensoren/style.watermark.json",
      },
    ],
  },
};

export const resolveAttributeset = (
  raw: string | null | undefined
): AttributesetConfig => {
  const id = raw?.trim().toLowerCase() ?? "";
  return ATTRIBUTESETS[id] ?? ATTRIBUTESETS[DEFAULT_ATTRIBUTESET_ID];
};
