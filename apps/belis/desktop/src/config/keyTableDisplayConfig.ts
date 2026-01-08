export type SortMode = "none" | "alphabetical" | "numeric";

/**
 * Configuration for how items in a key table should be displayed in the list.
 */
export interface KeyTableDisplayRule {
  template: string;
  emptyText?: string;
  separator?: string;
  sortMode?: SortMode;
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
  },
  masttyp: {
    template: "{masttyp} {bezeichnung}",
    sortMode: "numeric",
  },
  leuchtentyp: {
    template: "{leuchtentyp} {fabrikat}",
    sortMode: "alphabetical",
  },
  rundsteuerempfänger: {
    template: "{rs_typ} {fabrikat}",
    sortMode: "alphabetical",
  },
  doppelkommando: {
    template: "{pk} - {beschreibung}",
    sortMode: "numeric",
  },
  leuchtmittel: {
    template: "{hersteller} {lichtfarbe}",
  },
  unterhaltMast: {
    template: "{pk} - {unterhalt_mast}",
    sortMode: "numeric",
  },
  unterhaltLeuchte: {
    template: "{pk} - {unterhaltspflichtiger_leuchte}",
    sortMode: "numeric",
  },
  energielieferant: {
    template: "{energielieferant}",
    sortMode: "alphabetical",
  },
  anlagengruppe: {
    template: "{nummer} - {bezeichnung}",
  },
  bezirk: {
    template: "{bezirk} - {unterhaltspflichtiger_leuchte}",
    sortMode: "alphabetical",
  },
  arbeitsprotokollstatus: {
    template: "{schluessel} - {bezeichnung}",
    sortMode: "numeric",
  },
  kennziffer: {
    template: "{kennziffer} - {beschreibung}",
  },
  mastart: {
    template: "{mastart}",
    sortMode: "alphabetical",
  },
  veranlassungsart: {
    template: "{schluessel} - {bezeichnung}",
    sortMode: "alphabetical",
  },
  klassifizierung: {
    template: "{pk} - {klassifizierung}",
  },
  infobausteinTemplate: {
    template: "{schluessel} - {bezeichnung}",
    sortMode: "numeric",
  },
  leitungstyp: {
    template: "{bezeichnung}",
    sortMode: "alphabetical",
  },

  materialLeitung: {
    template: "{bezeichnung}",
    sortMode: "alphabetical",
  },
};
