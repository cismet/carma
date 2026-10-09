import {
  ActionNotSuccessfulError,
  fetchFlurstueckBySchluesselId,
  fetchNutzungenForFlurstueck,
  toTimestamp,
  updateNutzung,
  updateNutzungBuchung,
} from "../wizard/api";
import { saveUsageData } from "../wizard/operations/usage";
import { gesamtpreis } from "../wizard/usageData";
import { hasId } from "./ids";

const toInt = (number) => (Number.isFinite(number) ? Math.round(number) : null);
const toNumber = (number) => (Number.isFinite(number) ? number : null);

const openBuchung = (nutzung) =>
  nutzung.historisch
    ? undefined
    : (nutzung.nutzung_buchungArrayRelationShip ?? []).find(
        (buchung) => !buchung.gueltig_bis
      );

const byValidity = (a, b) =>
  new Date(a.gueltig_von) - new Date(b.gueltig_von) || a.id - b.id;

// buchungen/firstBuchung/buchwertBefore are read-only history for the
// Buchwert toggle and the live Stille Reserve
const toRow = (nutzung, buchung) => {
  const buchungen = [...(nutzung.nutzung_buchungArrayRelationShip ?? [])].sort(
    byValidity
  );
  const index = buchungen.findIndex((b) => b.id === buchung.id);
  const lastBuchwert = buchungen
    .slice(0, index)
    .reverse()
    .find((b) => b.ist_buchwert);
  return {
    id: String(nutzung.id),
    nutzungId: nutzung.id,
    anlageklasseId: buchung.fk_anlageklasse ?? undefined,
    nutzungsartId: buchung.fk_nutzungsart ?? undefined,
    flaeche: buchung.flaeche ?? null,
    quadratmeterpreis: buchung.quadratmeterpreis ?? null,
    bemerkung: buchung.bemerkung ?? "",
    istBuchwert: Boolean(buchung.ist_buchwert),
    buchungen: buchungen.length,
    firstBuchung: index === 0,
    buchwertBefore: lastBuchwert ? gesamtpreis(lastBuchwert) : null,
  };
};

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

// Java NUTZUNG_HISTORY_EQUALATOR: an unchanged row must not create a Buchung.
// The Buchwert flag is no value; switching it alone keeps the Buchung.
export const rowChanged = (before, row) =>
  before.anlageklasseId !== row.anlageklasseId ||
  before.nutzungsartId !== row.nutzungsartId ||
  toInt(before.flaeche) !== toInt(row.flaeche) ||
  toNumber(before.quadratmeterpreis) !== toNumber(row.quadratmeterpreis) ||
  (before.bemerkung ?? "") !== (row.bemerkung ?? "");

// a changed row is saved as a new Buchung after the current one
const savedAsNewBuchung = (original, row) =>
  Boolean(original) && rowChanged(original, row);

// rows from a draft persisted before istBuchwert existed fall back to the original
export const isBuchwert = (original, row) =>
  row.istBuchwert ?? original?.istBuchwert ?? true;

// Java: the first Buchung of a Nutzung always stays the Buchwert;
// a new Nutzung only has its first Buchung
export const canToggleBuchwert = (original, row) =>
  Boolean(original) &&
  (savedAsNewBuchung(original, row) || !original.firstBuchung);

export const buchungsNummer = (original, row) => {
  if (!original) {
    return 1;
  }
  // undefined for a draft persisted before the history fields existed
  return Number.isFinite(original.buchungen)
    ? original.buchungen + (savedAsNewBuchung(original, row) ? 1 : 0)
    : undefined;
};

// Java getStilleReserveForBuchung: value above the last Buchwert, never < 0
export const stilleReserve = (original, row) => {
  if (!original || isBuchwert(original, row)) {
    return 0;
  }
  const reference =
    savedAsNewBuchung(original, row) && original.istBuchwert
      ? gesamtpreis(original)
      : original.buchwertBefore;
  const value = gesamtpreis(row);
  return value === null || !Number.isFinite(reference)
    ? 0
    : Math.max(0, value - reference);
};

const newBuchung = (row, bookedAt) => ({
  gueltig_von: bookedAt,
  ist_buchwert: row.istBuchwert ?? false,
  flaeche: toInt(row.flaeche),
  quadratmeterpreis: toNumber(row.quadratmeterpreis),
  bemerkung: row.bemerkung || null,
  ...(hasId(row.anlageklasseId)
    ? { anlageklasse: { id: row.anlageklasseId } }
    : {}),
  ...(hasId(row.nutzungsartId)
    ? { nutzungsart: { id: row.nutzungsartId } }
    : {}),
});

const closeBuchung = async (buchung, bookedAt, ctx) => {
  const { jwt, journal } = ctx;
  await updateNutzungBuchung(buchung.id, { gueltig_bis: bookedAt }, jwt);
  journal.record(`Gültigkeit der Nutzungsbuchung ${buchung.id}`, () =>
    updateNutzungBuchung(buchung.id, { gueltig_bis: null }, jwt)
  );
};

const flipBuchwert = async (buchung, before, row, ctx) => {
  const { jwt, journal } = ctx;
  if (before.firstBuchung && !row.istBuchwert) {
    throw new ActionNotSuccessfulError(
      `Die erste Buchung der Nutzung ${row.nutzungId} muss Buchwert bleiben.`
    );
  }
  await updateNutzungBuchung(
    buchung.id,
    { ist_buchwert: row.istBuchwert },
    jwt
  );
  journal.record(`Buchwert der Nutzungsbuchung ${buchung.id}`, () =>
    updateNutzungBuchung(buchung.id, { ist_buchwert: before.istBuchwert }, jwt)
  );
};

// Like the Java client without NKF admin rights: an edited Nutzung gets a new
// Buchung and the old one is closed; a removed Nutzung is terminated (history kept).
// Switching only the Buchwert flag changes the current Buchung in place.
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
    const before = toRow(current.get(row.nutzungId), buchung);
    if (!rowChanged(before, row)) {
      if (
        row.istBuchwert !== undefined &&
        row.istBuchwert !== before.istBuchwert
      ) {
        await flipBuchwert(buchung, before, row, ctx);
      }
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
