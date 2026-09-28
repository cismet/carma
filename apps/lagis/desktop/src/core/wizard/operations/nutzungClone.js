// cids array props are plain arrays; `{ data: [...] }` is Hasura's wrapper
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
