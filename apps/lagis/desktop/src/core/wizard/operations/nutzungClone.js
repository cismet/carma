/**
 * Port of LagisBroker.cloneNutzung.
 *
 * The Swing version walked the bean graph property by property: deep-copying
 * the Nutzung and its Buchungen, and keeping flat references to Nutzungsart,
 * Anlageklasse, Bebauung and Flächennutzung. Here the same shape is expressed
 * as one nested Hasura insert, so the whole tree is written in a single
 * mutation instead of one round trip per node.
 */
export const buildNutzungClone = (nutzung, flurstueckId) => ({
  fk_flurstueck: flurstueckId,
  historisch: false,
  nutzung_buchungArrayRelationShip: {
    data: (nutzung.nutzung_buchungArrayRelationShip ?? []).map((buchung) => ({
      bemerkung: buchung.bemerkung ?? null,
      flaeche: buchung.flaeche ?? null,
      gueltig_von: buchung.gueltig_von ?? null,
      gueltig_bis: buchung.gueltig_bis ?? null,
      ist_buchwert: buchung.ist_buchwert ?? null,
      quadratmeterpreis: buchung.quadratmeterpreis ?? null,
      // flat copies — the catalogue rows themselves are shared, not cloned
      fk_nutzungsart: buchung.fk_nutzungsart ?? null,
      fk_anlageklasse: buchung.fk_anlageklasse ?? null,
      ar_bebauungenArray: {
        data: (buchung.ar_bebauungenArray ?? []).map((row) => ({
          fk_bebauung: row.fk_bebauung,
        })),
      },
      ar_flaechennutzungenArray: {
        data: (buchung.ar_flaechennutzungenArray ?? []).map((row) => ({
          fk_flaechennutzung: row.fk_flaechennutzung,
        })),
      },
    })),
  },
});
