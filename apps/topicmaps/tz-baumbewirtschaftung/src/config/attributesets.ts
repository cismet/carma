/**
 * Attributesets (wupp #4128): one record per Anwendungsfall of the tree app.
 *
 * Which record applies is decided per Kampagne (wupp #4145). The campaigns
 * DAQ delivers `attributeset`, `workflow` and `baumdaten` for every Kampagne
 * from the server table `tzb_attributeset`; the record here is looked up by
 * that `attributeset` name. A Kampagne without one, or with an unknown name,
 * gets the default record, which is exactly the behaviour the app had before
 * attributesets existed.
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
  /**
   * Tree attributes the datasheet should show, from `baumdaten` on the
   * server. Undefined means the datasheet's built-in set.
   */
  datasheetFields?: string[];
};

/**
 * What the campaigns DAQ carries per Kampagne. All optional: the cloud DB
 * does not deliver them yet, and the app has to keep working there.
 */
export type ServerAttributeset = {
  attributeset?: string | null;
  workflow?: string | null;
  baumdaten?: string | null;
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

// Values of `tzb_attributeset.workflow` on the server.
const workflowFromServer = (
  raw: string | null | undefined
): WorkflowKind | undefined => {
  switch (raw?.trim().toLowerCase()) {
    case "fotologik":
      return "photo";
    case "bestätigungsbutton":
      return "confirm";
    default:
      return undefined;
  }
};

const datasheetFieldsFromServer = (
  raw: string | null | undefined
): string[] | undefined => {
  const fields = raw
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fields && fields.length > 0 ? fields : undefined;
};

/**
 * Record for a Kampagne: the client record picked by `attributeset`, with the
 * server's `workflow` and `baumdaten` applied on top when they are present.
 * Without any server fields the shared default record is returned as is, so
 * the identity stays stable for memoisation.
 */
export const resolveCampaignAttributeset = (
  campaign: ServerAttributeset | null | undefined
): AttributesetConfig => {
  const base = resolveAttributeset(campaign?.attributeset);
  const workflow = workflowFromServer(campaign?.workflow);
  const datasheetFields = datasheetFieldsFromServer(campaign?.baumdaten);
  if (!workflow && !datasheetFields) return base;
  return {
    ...base,
    ...(workflow ? { workflow } : {}),
    ...(datasheetFields ? { datasheetFields } : {}),
  };
};
