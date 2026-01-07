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
};
