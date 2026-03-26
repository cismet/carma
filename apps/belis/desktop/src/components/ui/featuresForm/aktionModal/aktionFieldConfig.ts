/**
 * Central config for all action modal field definitions.
 * Change any fachobjekt type's action forms from this single file.
 */

// ── Field type discriminants ──────────────────────────────────────

interface BaseField {
  /** Unique key used as Ant Design Form field name */
  name: string;
  /** Display label shown above the field */
  label: string;
}

export interface DateSelectField extends BaseField {
  type: "date-select";
  /** Key into keyTablesData for the select options (omit for date-only) */
  keyTableName?: string;
  /** Template for option display text, e.g. "{schluessel} - {bezeichnung}" */
  optionTemplate?: string;
}

export interface SelectField extends BaseField {
  type: "select";
  /** Key into keyTablesData for the options */
  keyTableName: string;
  /** Template for option display text */
  optionTemplate: string;
}

export interface TextField extends BaseField {
  type: "text";
}

export interface TextAreaField extends BaseField {
  type: "textarea";
  minRows?: number;
  maxRows?: number;
  /** When true, old value comparison is skipped (always shows as "new") */
  skipOldValue?: boolean;
}

export interface CheckboxField extends BaseField {
  type: "checkbox";
  /** Text displayed next to the checkbox */
  checkboxLabel?: string;
}

export interface DateField extends BaseField {
  type: "date";
}

/** Union of all field types */
export type AktionFieldConfig =
  | DateSelectField
  | SelectField
  | TextField
  | TextAreaField
  | CheckboxField
  | DateField;

/** Definition of a single action within a fachobjekt type */
export interface AktionDefinition {
  /** Display name shown in the Tag and Modal title */
  label: string;
  /** Ordered list of fields in this action's modal form */
  fields: AktionFieldConfig[];
}

/** Maps fachobjekt type to its list of action definitions */
export type AktionenConfig = Record<string, AktionDefinition[]>;

/** Form values produced by an action modal submission */
export type AktionFormValues = Record<string, unknown>;

// ── Config ────────────────────────────────────────────────────────

export const AKTIONEN_CONFIG: AktionenConfig = {
  // ── MAST ────────────────────────────────────────────────────────
  tdta_standort_mast: [
    {
      label: "Anstricharbeiten",
      fields: [
        { type: "date-select", name: "mastanstrich", label: "Mastanstrich" },
        { type: "text", name: "anstrichfarbe", label: "Anstrichfarbe" },
      ],
    },
    {
      label: "Elektrische Prüfung",
      fields: [
        {
          type: "date-select",
          name: "elek_pruefung",
          label: "Elektrische Prüfung am Mast",
        },
        {
          type: "checkbox",
          name: "erdung",
          label: "Erdung in Ordnung",
          checkboxLabel: "Erdung in Ordnung",
        },
      ],
    },
    {
      label: "Masterneuerung",
      fields: [
        {
          type: "date-select",
          name: "inbetriebnahme_mast",
          label: "Inbetriebnahme",
        },
        { type: "text", name: "montagefirma", label: "Montagefirma" },
      ],
    },
    {
      label: "Revision",
      fields: [
        { type: "date-select", name: "revision", label: "Revision" },
      ],
    },
    {
      label: "Standsicherheitsprüfung",
      fields: [
        {
          type: "date-select",
          name: "standsicherheitspruefung",
          label: "Standsicherheitsprüfung",
        },
        { type: "text", name: "verfahren", label: "Verfahren" },
        {
          type: "date",
          name: "naechstes_pruefdatum",
          label: "Nächstes Prüfdatum",
        },
      ],
    },
    {
      label: "Sonstiges",
      fields: [
        {
          type: "textarea",
          name: "bemerkung",
          label: "Informationen zu den durchgeführten Tätigkeiten",
          minRows: 4,
          maxRows: 8,
          skipOldValue: true,
        },
      ],
    },
  ],

  // ── LEUCHTE ─────────────────────────────────────────────────────
  tdta_leuchten: [
    {
      label: "Sonderturnus",
      fields: [
        { type: "date-select", name: "sonderturnus", label: "Sonderturnus" },
      ],
    },
    {
      label: "Leuchtenerneuerung",
      fields: [
        {
          type: "date-select",
          name: "inbetriebnahme_leuchte",
          label: "Inbetriebnahme",
        },
        {
          type: "select",
          name: "fk_leuchttyp",
          label: "Leuchtentyp",
          keyTableName: "leuchtentyp",
          optionTemplate: "{leuchtentyp} {fabrikat}",
        },
      ],
    },
    {
      label: "Leuchtmittelwechsel",
      fields: [
        { type: "date-select", name: "wechseldatum", label: "Wechseldatum" },
        {
          type: "select",
          name: "leuchtmittel",
          label: "eingesetztes Leuchtmittel",
          keyTableName: "leuchtmittel",
          optionTemplate: "{hersteller} {lichtfarbe}",
        },
        {
          type: "text",
          name: "lebensdauer",
          label: "Lebensdauer des Leuchtmittels",
        },
      ],
    },
    {
      label: "Leuchtmittelwechsel (mit EP)",
      fields: [
        {
          type: "date-select",
          name: "elek_pruefung",
          label: "Elektrische Prüfung am Mast",
        },
        {
          type: "checkbox",
          name: "erdung",
          label: "Erdung in Ordnung",
          checkboxLabel: "Erdung in Ordnung",
        },
        { type: "date-select", name: "wechseldatum", label: "Wechseldatum" },
        {
          type: "select",
          name: "leuchtmittel",
          label: "eingesetztes Leuchtmittel",
          keyTableName: "leuchtmittel",
          optionTemplate: "{hersteller} {lichtfarbe}",
        },
        {
          type: "text",
          name: "lebensdauer",
          label: "Lebensdauer des Leuchtmittels",
        },
      ],
    },
    {
      label: "Vorschaltgerätwechsel",
      fields: [
        {
          type: "date-select",
          name: "wechselvorschaltgeraet",
          label: "erneuert am",
        },
        {
          type: "text",
          name: "vorschaltgeraet",
          label: "Vorschaltgerät",
        },
      ],
    },
    {
      label: "Rundsteuerempfängerwechsel",
      fields: [
        { type: "date-select", name: "einbaudatum", label: "Einbaudatum" },
        {
          type: "select",
          name: "rundsteuerempfaenger",
          label: "Rundsteuerempfänger",
          keyTableName: "rundsteuerempfänger",
          optionTemplate: "{rs_typ}",
        },
      ],
    },
    {
      label: "Sonstiges",
      fields: [
        {
          type: "textarea",
          name: "bemerkung",
          label: "Informationen zu den durchgeführten Tätigkeiten",
          minRows: 4,
          maxRows: 8,
          skipOldValue: true,
        },
      ],
    },
  ],

  // ── SCHALTSTELLE ────────────────────────────────────────────────
  schaltstelle: [
    {
      label: "Revision",
      fields: [
        { type: "date-select", name: "pruefdatum", label: "Prüfdatum" },
      ],
    },
    {
      label: "Sonstiges",
      fields: [
        {
          type: "textarea",
          name: "bemerkung",
          label: "Informationen zu den durchgeführten Tätigkeiten",
          minRows: 4,
          maxRows: 8,
          skipOldValue: true,
        },
      ],
    },
  ],

  // ── MAUERLASCHE ─────────────────────────────────────────────────
  mauerlasche: [
    {
      label: "Prüfung",
      fields: [
        { type: "date-select", name: "pruefdatum", label: "Prüfdatum" },
        // Dokumente + Vorschau panels: future extension
      ],
    },
    {
      label: "Sonstiges",
      fields: [
        {
          type: "textarea",
          name: "bemerkung",
          label: "Informationen zu den durchgeführten Tätigkeiten",
          minRows: 4,
          maxRows: 8,
          skipOldValue: true,
        },
      ],
    },
  ],

  // ── ABZWEIGDOSE / LEITUNG / GEOM ───────────────────────────────
  abzweigdose: [
    {
      label: "Sonstiges",
      fields: [
        {
          type: "textarea",
          name: "bemerkung",
          label: "Informationen zu den durchgeführten Tätigkeiten",
          minRows: 4,
          maxRows: 8,
          skipOldValue: true,
        },
      ],
    },
  ],
  leitung: [
    {
      label: "Sonstiges",
      fields: [
        {
          type: "textarea",
          name: "bemerkung",
          label: "Informationen zu den durchgeführten Tätigkeiten",
          minRows: 4,
          maxRows: 8,
          skipOldValue: true,
        },
      ],
    },
  ],
  geom: [
    {
      label: "Sonstiges",
      fields: [
        {
          type: "textarea",
          name: "bemerkung",
          label: "Informationen zu den durchgeführten Tätigkeiten",
          minRows: 4,
          maxRows: 8,
          skipOldValue: true,
        },
      ],
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────

/** Replace `{key}` placeholders in a template with values from an object */
export const applyTemplate = (
  template: string,
  item: Record<string, unknown>,
): string =>
  template
    .replace(/\{(\w+)\}/g, (_, key: string) => String(item[key] ?? ""))
    .trim();

/** Get action labels for a fachobjekt type (replaces old AKTIONEN_BY_FACHOBJEKT_TYPE) */
export const getAktionLabels = (fachobjektType: string): string[] =>
  (AKTIONEN_CONFIG[fachobjektType] ?? []).map((a) => a.label);

/** Find an AktionDefinition by fachobjekt type + action label */
export const findAktionDefinition = (
  fachobjektType: string,
  label: string,
): AktionDefinition | undefined =>
  (AKTIONEN_CONFIG[fachobjektType] ?? []).find((a) => a.label === label);
