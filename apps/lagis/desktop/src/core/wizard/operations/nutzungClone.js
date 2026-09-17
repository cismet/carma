/**
 * Port of LagisBroker.cloneNutzung.
 *
 * The Swing version walked the bean graph property by property: deep-copying
 * the Nutzung and its Buchungen, and keeping flat references to Nutzungsart,
 * Anlageklasse, Bebauung and Flächennutzung. Here the same shape is expressed
 * as one nested cids bean, so SaveObject persists the whole tree in a single
 * transactional call instead of one round trip per node. Array properties are
 * plain arrays here — the `{ data: [...] }` wrapper is Hasura's, not cids'.
 */
export const buildNutzungClone = (nutzung, flurstueckId) => ({
  fk_flurstueck: flurstueckId,
  historisch: false,
  nutzung_buchungArrayRelationShip: (
    nutzung.nutzung_buchungArrayRelationShip ?? []
  ).map((buchung) => ({
    bemerkung: buchung.bemerkung ?? null,
    flaeche: buchung.flaeche ?? null,
    gueltig_von: buchung.gueltig_von ?? null,
    gueltig_bis: buchung.gueltig_bis ?? null,
    ist_buchwert: buchung.ist_buchwert ?? null,
    quadratmeterpreis: buchung.quadratmeterpreis ?? null,
    // flat copies — the catalogue rows themselves are shared, not cloned
    fk_nutzungsart: buchung.fk_nutzungsart ?? null,
    fk_anlageklasse: buchung.fk_anlageklasse ?? null,
    ar_bebauungenArray: (buchung.ar_bebauungenArray ?? []).map((row) => ({
      fk_bebauung: row.fk_bebauung,
    })),
    ar_flaechennutzungenArray: (buchung.ar_flaechennutzungenArray ?? []).map(
      (row) => ({ fk_flaechennutzung: row.fk_flaechennutzung })
    ),
  })),
});
