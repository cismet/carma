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
}

export type KeyTableDisplayConfig = Record<string, KeyTableDisplayRule>;

export const keyTableDisplayConfig: KeyTableDisplayConfig = {
  bauart: {
    template: "{bezeichnung}",
    sortMode: "alphabetical",
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
  },
  leuchtentyp: {
    template: "{leuchtentyp} {fabrikat}",
    sortMode: "alphabetical",
    customForm: "leuchtentyp",
  },
  rundsteuerempfänger: {
    template: "{rs_typ} {fabrikat}",
    sortMode: "alphabetical",
    customForm: "rundsteuerempfaenger",
  },
  doppelkommando: {
    template: "{pk} - {beschreibung}",
    sortMode: "numeric",
    apiClassName: "tkey_doppelkommando",
  },
  leuchtmittel: {
    template: "{hersteller} {lichtfarbe}",
  },
  unterhaltMast: {
    template: "{pk} - {unterhalt_mast}",
    sortMode: "numeric",
    apiClassName: "tkey_unterh_mast",
    displayName: "Unterhalt - Mast",
    fieldLabels: {
      unterhalt_mast: "Unterhalt - Mast",
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
  },
  energielieferant: {
    template: "{energielieferant}",
    sortMode: "alphabetical",
    apiClassName: "tkey_energielieferant",
  },
  anlagengruppe: {
    template: "{nummer} - {bezeichnung}",
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
  },
  kennziffer: {
    template: "{kennziffer} - {beschreibung}",
    sortMode: "numeric",
    apiClassName: "tkey_kennziffer",
  },
  mastart: {
    template: "{mastart}",
    sortMode: "alphabetical",
    apiClassName: "tkey_mastart",
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
  },
  infobausteinTemplate: {
    template: "{schluessel} - {bezeichnung}",
    sortMode: "numeric",
    customForm: "infobausteinTemplate",
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
