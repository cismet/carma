import type { Rule } from "antd/es/form";

export type SortMode = "none" | "alphabetical" | "numeric";
export type GroupingMode = "byKey" | "byStreet";

/**
 * Configuration for how items in a key table should be displayed in the list.
 */
export interface KeyTableDisplayRule {
  template: string;
  emptyText?: string;
  separator?: string;
  sortMode?: SortMode;
  readOnly?: boolean;
  customForm?: string;
  groupedDisplay?: boolean;
  defaultGroupingMode?: GroupingMode;
  apiClassName?: string; // API class name when it differs from the key
  fieldLabels?: Record<string, string>; // Override labels for form fields (key -> display label)
  displayName?: string; // Custom display name for the table in Column 1 (e.g., "Unterhalt - Mast")
  fieldOrder?: string[]; // Order of fields in the form (fields not listed appear at the end)
  fieldRules?: Record<string, Rule[]>; // Ant Design validation rules per field
}

export type KeyTableDisplayConfig = Record<string, KeyTableDisplayRule>;

/**
 * Reverse mapping from API class names to table names (keys in keyTableDisplayConfig).
 * Used for cross-tab sync to identify which table to refresh when an action completes.
 */
export const apiClassNameToTableName: Record<string, string> = {
  // Tables with custom apiClassName
  team: "teams",
  tkey_masttyp: "masttyp",
  tkey_leuchtentyp: "leuchtentyp",
  rundsteuerempfaenger: "rundsteuerempfänger",
  tkey_doppelkommando: "doppelkommando",
  tkey_unterh_mast: "unterhaltMast",
  tkey_unterh_leuchte: "unterhaltLeuchte",
  tkey_energielieferant: "energielieferant",
  tkey_kennziffer: "kennziffer",
  tkey_mastart: "mastart",
  tkey_klassifizierung: "klassifizierung",
  infobaustein_template: "infobausteinTemplate",
  material_leitung: "materialLeitung",
  material_mauerlasche: "materialMauerlasche",
  // Tables where key equals apiClassName
  bauart: "bauart",
  leuchtmittel: "leuchtmittel",
  anlagengruppe: "anlagengruppe",
  arbeitsprotokollstatus: "arbeitsprotokollstatus",
  veranlassungsart: "veranlassungsart",
  leitungstyp: "leitungstyp",
};

export const keyTableDisplayConfig: KeyTableDisplayConfig = {
  bauart: {
    template: "{bezeichnung}",
    sortMode: "alphabetical",
    // fieldRules: {
    //   bezeichnung: [
    //     { required: true, message: "Bezeichnung ist erforderlich" },
    //   ],
    // },
  },
  teams: {
    template: "{name}",
    sortMode: "alphabetical",
    apiClassName: "team",
  },
  masttyp: {
    template: "{masttyp} {bezeichnung}",
    sortMode: "numeric",
    customForm: "masttyp",
    apiClassName: "tkey_masttyp",
    fieldRules: {
      masttyp: [{ max: 5, message: "Maximal 5 Zeichen erlaubt" }],
    },
  },
  leuchtentyp: {
    template: "{leuchtentyp} {fabrikat}",
    sortMode: "alphabetical",
    customForm: "leuchtentyp",
    apiClassName: "tkey_leuchtentyp",
    fieldRules: {
      leuchtentyp: [{ max: 13, message: "Maximal 13 Zeichen erlaubt" }],
    },
  },
  rundsteuerempfänger: {
    template: "{rs_typ} {fabrikat}",
    sortMode: "alphabetical",
    customForm: "rundsteuerempfaenger",
    apiClassName: "rundsteuerempfaenger",
    fieldRules: {
      programm: [{ max: 1, message: "Maximal 1 Zeichen erlaubt" }],
    },
  },
  doppelkommando: {
    template: "{pk} - {beschreibung}",
    sortMode: "numeric",
    apiClassName: "tkey_doppelkommando",
    fieldRules: {
      pk: [{ max: 5, message: "Maximal 5 Zeichen erlaubt" }],
      beschreibung: [{ max: 50, message: "Maximal 50 Zeichen erlaubt" }],
    },
  },
  leuchtmittel: {
    template: "{hersteller} {lichtfarbe}",
    fieldOrder: ["hersteller", "lichtfarbe"],
  },
  unterhaltMast: {
    template: "{pk} - {unterhalt_mast}",
    sortMode: "numeric",
    apiClassName: "tkey_unterh_mast",
    displayName: "Unterhalt - Mast",
    fieldLabels: {
      unterhalt_mast: "Unterhalt - Mast",
    },
    fieldRules: {
      pk: [{ pattern: /^-?\d*$/, message: "PK muss eine Ganzzahl sein" }],
      unterhalt_mast: [{ max: 50, message: "Maximal 50 Zeichen erlaubt" }],
    },
  },
  unterhaltLeuchte: {
    template: "{pk} - {unterhaltspflichtiger_leuchte}",
    sortMode: "numeric",
    apiClassName: "tkey_unterh_leuchte",
    fieldLabels: {
      unterhaltspflichtiger_leuchte: "Unterhaltspflichtige - Leuchte",
    },
    displayName: "Unterhalt - Leuchte",
    fieldRules: {
      pk: [{ pattern: /^-?\d*$/, message: "PK muss eine Ganzzahl sein" }],
      unterhaltspflichtiger_leuchte: [
        { max: 50, message: "Maximal 50 Zeichen erlaubt" },
      ],
    },
  },
  energielieferant: {
    template: "{energielieferant}",
    sortMode: "alphabetical",
    apiClassName: "tkey_energielieferant",
    fieldRules: {
      pk: [{ pattern: /^-?\d*$/, message: "PK muss eine Ganzzahl sein" }],
      energielieferant: [{ max: 50, message: "Maximal 50 Zeichen erlaubt" }],
    },
  },
  anlagengruppe: {
    template: "{nummer} - {bezeichnung}",
    sortMode: "numeric",
    fieldRules: {
      nummer: [
        { pattern: /^-?\d*$/, message: "Nummer muss eine Ganzzahl sein" },
      ],
    },
  },
  // bezirk: {
  //   template: "{bezirk} - {unterhaltspflichtiger_leuchte}",
  //   sortMode: "alphabetical",
  //   readOnly: true,
  // },
  arbeitsprotokollstatus: {
    template: "{schluessel} - {bezeichnung}",
    sortMode: "numeric",
    fieldLabels: {
      schluessel: "Schlüssel",
    },
    fieldRules: {
      bezeichnung: [
        { required: true, message: "Bezeichnung ist erforderlich" },
      ],
      schluessel: [
        { required: true, message: "Schlüssel ist erforderlich" },
        { pattern: /^\d+$/, message: "Schlüssel muss eine Zahl sein" },
      ],
    },
  },
  kennziffer: {
    template: "{kennziffer} - {beschreibung}",
    sortMode: "numeric",
    apiClassName: "tkey_kennziffer",
    fieldRules: {
      kennziffer: [
        { pattern: /^-?\d*$/, message: "Kennziffer muss eine Ganzzahl sein" },
      ],
      beschreibung: [{ max: 50, message: "Maximal 50 Zeichen erlaubt" }],
    },
  },
  mastart: {
    template: "{mastart}",
    sortMode: "alphabetical",
    apiClassName: "tkey_mastart",
    fieldOrder: ["mastart", "pk"],
    fieldRules: {
      pk: [{ max: 1, message: "Maximal 1 Zeichen erlaubt" }],
      mastart: [{ max: 50, message: "Maximal 50 Zeichen erlaubt" }],
    },
  },
  veranlassungsart: {
    template: "{schluessel} - {bezeichnung}",
    sortMode: "alphabetical",
    fieldLabels: {
      schluessel: "Schlüssel",
    },
  },
  klassifizierung: {
    template: "{pk} - {klassifizierung}",
    sortMode: "numeric",
    apiClassName: "tkey_klassifizierung",
    fieldRules: {
      pk: [{ pattern: /^-?\d*$/, message: "PK muss eine Ganzzahl sein" }],
      klassifizierung: [{ max: 50, message: "Maximal 50 Zeichen erlaubt" }],
    },
  },
  infobausteinTemplate: {
    template: "{schluessel} - {bezeichnung}",
    sortMode: "numeric",
    customForm: "infobausteinTemplate",
    apiClassName: "infobaustein_template",
    // readOnly: true,
  },
  leitungstyp: {
    template: "{bezeichnung}",
    sortMode: "alphabetical",
  },

  materialLeitung: {
    template: "{bezeichnung}",
    sortMode: "alphabetical",
    apiClassName: "material_leitung",
    displayName: "Material - Leitung",
  },
  materialMauerlasche: {
    template: "{bezeichnung}",
    sortMode: "alphabetical",
    apiClassName: "material_mauerlasche",
    displayName: "Material - Mauerlasche",
  },
  // straßenschlüssel: {
  //   template: "{pk} - {strasse}",
  //   readOnly: true,
  //   groupedDisplay: true,
  //   defaultGroupingMode: "byKey",
  // },
};
