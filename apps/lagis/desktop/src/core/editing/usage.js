import {
  ActionNotSuccessfulError,
  fetchFlurstueckBySchluesselId,
  fetchNutzungenForFlurstueck,
  toTimestamp,
  updateNutzung,
  updateNutzungBuchung,
} from "../wizard/api";
import { saveUsageData } from "../wizard/operations/usage";

const toInt = (number) => (Number.isFinite(number) ? Math.round(number) : null);
const toNumber = (number) => (Number.isFinite(number) ? number : null);

const openBuchung = (nutzung) =>
  nutzung.historisch
    ? undefined
    : (nutzung.nutzung_buchungArrayRelationShip ?? []).find(
        (buchung) => !buchung.gueltig_bis
      );

const toRow = (nutzung, buchung) => ({
  id: String(nutzung.id),
  nutzungId: nutzung.id,
  anlageklasseId: buchung.fk_anlageklasse ?? undefined,
  nutzungsartId: buchung.fk_nutzungsart ?? undefined,
  flaeche: buchung.flaeche ?? null,
  quadratmeterpreis: buchung.quadratmeterpreis ?? null,
  bemerkung: buchung.bemerkung ?? "",
});

// one row per Nutzung that has an open Buchung, like the Java NKF table today
export const loadUsageSection = async (key, jwt) => {
  const flurstueck = await fetchFlurstueckBySchluesselId(key.id, jwt);
  if (!flurstueck) {
    return undefined;
  }
  const nutzungen = await fetchNutzungenForFlurstueck(flurstueck.id, jwt);
  return {
    flurstueckId: flurstueck.id,
    nutzungen: nutzungen
      .map((nutzung) => [nutzung, openBuchung(nutzung)])
      .filter(([, buchung]) => buchung)
      .sort(([a], [b]) => a.id - b.id)
      .map(([nutzung, buchung]) => toRow(nutzung, buchung)),
  };
};

// Java NUTZUNG_HISTORY_EQUALATOR: an unchanged row must not create a Buchung
const buchungChanged = (buchung, row) =>
  (buchung.fk_anlageklasse ?? undefined) !== row.anlageklasseId ||
  (buchung.fk_nutzungsart ?? undefined) !== row.nutzungsartId ||
  toInt(buchung.flaeche) !== toInt(row.flaeche) ||
  toNumber(buchung.quadratmeterpreis) !== toNumber(row.quadratmeterpreis) ||
  (buchung.bemerkung ?? "") !== (row.bemerkung ?? "");

const newBuchung = (row, bookedAt) => ({
  gueltig_von: bookedAt,
  ist_buchwert: false,
  flaeche: toInt(row.flaeche),
  quadratmeterpreis: toNumber(row.quadratmeterpreis),
  bemerkung: row.bemerkung || null,
  ...(row.anlageklasseId ? { anlageklasse: { id: row.anlageklasseId } } : {}),
  ...(row.nutzungsartId ? { nutzungsart: { id: row.nutzungsartId } } : {}),
});

const closeBuchung = async (buchung, bookedAt, ctx) => {
  const { jwt, journal } = ctx;
  await updateNutzungBuchung(buchung.id, { gueltig_bis: bookedAt }, jwt);
  journal.record(`Gültigkeit der Nutzungsbuchung ${buchung.id}`, () =>
    updateNutzungBuchung(buchung.id, { gueltig_bis: null }, jwt)
  );
};

// Like the Java client without NKF admin rights: an edited Nutzung gets a new
// Buchung and the old one is closed; a removed Nutzung is terminated (history kept).
export const saveUsageEdit = async (parcel, original, draft, ctx) => {
  const { jwt, journal } = ctx;
  const bookedAt = toTimestamp(new Date());
  const current = new Map(
    (await fetchNutzungenForFlurstueck(original.flurstueckId, jwt)).map(
      (nutzung) => [nutzung.id, nutzung]
    )
  );
  const openOf = (nutzungId) => {
    const buchung =
      current.get(nutzungId) && openBuchung(current.get(nutzungId));
    if (!buchung) {
      throw new ActionNotSuccessfulError(
        `Die Nutzung ${nutzungId} von "${parcel.label}" wurde inzwischen geändert.`
      );
    }
    return buchung;
  };

  const kept = new Set(draft.nutzungen.map((row) => row.nutzungId));
  for (const row of original.nutzungen) {
    if (!kept.has(row.nutzungId)) {
      await closeBuchung(openOf(row.nutzungId), bookedAt, ctx);
    }
  }

  for (const row of draft.nutzungen.filter((row) => row.nutzungId)) {
    const buchung = openOf(row.nutzungId);
    if (!buchungChanged(buchung, row)) {
      continue;
    }
    const previous = current
      .get(row.nutzungId)
      .nutzung_buchungArrayRelationShip.map(({ id }) => ({ id }));
    await closeBuchung(buchung, bookedAt, ctx);
    await updateNutzung(
      row.nutzungId,
      {
        nutzung_buchungArrayRelationShip: [
          ...previous,
          newBuchung(row, bookedAt),
        ],
      },
      jwt
    );
    journal.record(`Buchungen der Nutzung ${row.nutzungId}`, () =>
      updateNutzung(
        row.nutzungId,
        { nutzung_buchungArrayRelationShip: previous },
        jwt
      )
    );
  }

  const added = draft.nutzungen.filter((row) => !row.nutzungId);
  if (added.length) {
    await saveUsageData([parcel.key], { [parcel.label]: added }, ctx);
  }
};
