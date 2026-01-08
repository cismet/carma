/**
 * Configuration for how items in a key table should be displayed in the list.
 */
export interface KeyTableDisplayRule {
  template: string;
  emptyText?: string;
  separator?: string;
}

export type KeyTableDisplayConfig = Record<string, KeyTableDisplayRule>;

export const keyTableDisplayConfig: KeyTableDisplayConfig = {
  masttyp: {
    template: "{masttyp} {bezeichnung}",
    separator: " - ",
  },
  leuchtentyp: {
    template: "{leuchtentyp} {fabrikat}",
    separator: " - ",
  },
  rundsteuerempfänger: {
    template: "{rs_typ} {fabrikat}",
    separator: " - ",
  },
  doppelkommando: {
    template: "{pk} - {beschreibung}",
  },
  leuchtmittel: {
    template: "{hersteller} {lichtfarbe}",
  },
  unterhaltMast: {
    template: "{pk} - {unterhalt_mast}",
  },
  unterhaltLeuchte: {
    template: "{pk} - {unterhaltspflichtiger_leuchte}",
  },
  energielieferant: {
    template: "{energielieferant}",
  },
  anlagengruppe: {
    template: "{nummer} - {bezeichnung}",
  },
  bezirk: {
    template: "{bezirk} - {unterhaltspflichtiger_leuchte}",
  },
  arbeitsprotokollstatus: {
    template: "{schluessel} - {bezeichnung}",
  },
  kennziffer: {
    template: "{kennziffer} - {beschreibung}",
  },
  mastart: {
    template: "{mastart}",
  },
  veranlassungsart: {
    template: "{schluessel} - {bezeichnung}",
  },
  klassifizierung: {
    template: "{pk} - {klassifizierung}",
  },
  infobausteinTemplate: {
    template: "{schluessel} - {bezeichnung}",
  },
};
