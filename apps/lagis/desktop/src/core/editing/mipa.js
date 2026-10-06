import dayjs from "dayjs";
import { nanoid } from "@reduxjs/toolkit";
import {
  ActionNotSuccessfulError,
  deleteMipa,
  fetchMipaForEdit,
  insertMipa,
  saveMipa,
  saveMipaNutzung,
  toTimestamp,
} from "../wizard/api";
import { planarArea } from "../wizard/geometry";
import { getBuffer25832 } from "../tools/mappingTools";

const toInt = (number) => (Number.isFinite(number) ? Math.round(number) : null);
const toDay = (date) => (date ? dayjs(date).format("YYYY-MM-DD") : null);
const toCidsDate = (day) => (day ? toTimestamp(dayjs(day).toDate()) : null);

const toRow = (mipa) => ({
  id: String(mipa.id),
  mipaId: mipa.id,
  lage: mipa.lage ?? "",
  aktenzeichen: mipa.aktenzeichen ?? "",
  flaeche: toInt(mipa.flaeche),
  nutzer: mipa.nutzer ?? "",
  vertragsbeginn: toDay(mipa.vertragsbeginn),
  vertragsende: toDay(mipa.vertragsende),
  bemerkung: mipa.bemerkung ?? "",
  nutzungId: mipa.mipa_nutzung?.id,
  kategorieId: mipa.mipa_nutzung?.mipa_kategorie?.id,
  ausgewaehlteNummer: mipa.mipa_nutzung?.ausgewaehlte_nummer ?? null,
  merkmalIds: (mipa.ar_mipa_merkmaleArray ?? [])
    .map((entry) => entry.mipa_merkmal?.id)
    .filter(Boolean),
  geometry: mipa.geom?.geo_field,
});

// same search as the MiPa page: everything touching the parcel shrunk by 1 m
export const loadMipaSection = async (parcelGeometry, jwt) => {
  if (!parcelGeometry) {
    return undefined;
  }
  const mipas = await fetchMipaForEdit(getBuffer25832(parcelGeometry, -1), jwt);
  return { parcelGeometry, mipas: mipas.map(toRow) };
};

// like Java MipaTable.addNewItem: a new MiPa covers the whole parcel
export const newMipaRow = (parcelGeometry) => ({
  id: nanoid(),
  lage: "",
  aktenzeichen: "",
  flaeche: toInt(planarArea(parcelGeometry)),
  nutzer: "",
  vertragsbeginn: null,
  vertragsende: null,
  bemerkung: "",
  kategorieId: undefined,
  ausgewaehlteNummer: null,
  merkmalIds: [],
  geometry: parcelGeometry,
});

const plainFields = (row) => ({
  lage: row.lage || null,
  aktenzeichen: row.aktenzeichen || null,
  flaeche: toInt(row.flaeche),
  nutzer: row.nutzer || null,
  vertragsbeginn: toCidsDate(row.vertragsbeginn),
  vertragsende: toCidsDate(row.vertragsende),
  bemerkung: row.bemerkung || null,
});

const PLAIN = [
  "lage",
  "aktenzeichen",
  "flaeche",
  "nutzer",
  "vertragsbeginn",
  "vertragsende",
  "bemerkung",
];

const merkmaleArray = (row) =>
  row.merkmalIds.map((id) => ({ mipa_merkmal: { id } }));

const idKey = (ids) => [...ids].sort((a, b) => a - b).join();

const newNutzung = (row) => ({
  ausgewaehlte_nummer: row.ausgewaehlteNummer,
  mipa_kategorie: { id: row.kategorieId },
});

const asNewMipa = (row) => ({
  ...plainFields(row),
  geom: { geo_field: row.geometry },
  ...(row.kategorieId ? { mipa_nutzung: newNutzung(row) } : {}),
  ar_mipa_merkmaleArray: merkmaleArray(row),
});

const updateRow = async (before, row, { jwt, journal }) => {
  const label = `${row.lage} (${row.aktenzeichen})`;
  const fields = plainFields(row);
  const oldFields = plainFields(before);
  const changes = {};
  const undo = {};
  for (const name of PLAIN) {
    if (fields[name] !== oldFields[name]) {
      changes[name] = fields[name];
      undo[name] = oldFields[name];
    }
  }
  if (idKey(before.merkmalIds) !== idKey(row.merkmalIds)) {
    changes.ar_mipa_merkmaleArray = merkmaleArray(row);
    undo.ar_mipa_merkmaleArray = merkmaleArray(before);
  }
  // Java keeps one Nutzung per MiPa and only switches its Kategorie
  if (row.kategorieId && !before.nutzungId) {
    changes.mipa_nutzung = newNutzung(row);
  }
  if (Object.keys(changes).length) {
    await saveMipa(row.mipaId, changes, jwt);
    journal.record(`Vermietung/Verpachtung ${label}`, () =>
      saveMipa(row.mipaId, undo, jwt)
    );
  }

  if (
    before.nutzungId &&
    (before.kategorieId !== row.kategorieId ||
      before.ausgewaehlteNummer !== row.ausgewaehlteNummer)
  ) {
    const nutzungOf = (source) => ({
      ausgewaehlte_nummer: source.ausgewaehlteNummer,
      mipa_kategorie: source.kategorieId ? { id: source.kategorieId } : null,
    });
    await saveMipaNutzung(before.nutzungId, nutzungOf(row), jwt);
    journal.record(`Nutzung der Vermietung/Verpachtung ${label}`, () =>
      saveMipaNutzung(before.nutzungId, nutzungOf(before), jwt)
    );
  }
};

// Like the Java client: no history, rows are changed in place and a removed
// MiPa is deleted. Deletes run last, they are the hardest to undo.
export const saveMipaEdit = async (original, draft, ctx) => {
  const { jwt, journal } = ctx;
  const before = new Map(original.mipas.map((row) => [row.mipaId, row]));

  for (const row of draft.mipas.filter((row) => row.mipaId)) {
    await updateRow(before.get(row.mipaId), row, ctx);
  }

  for (const row of draft.mipas.filter((row) => !row.mipaId)) {
    if (!row.geometry) {
      throw new ActionNotSuccessfulError(
        "Eine neue Vermietung/Verpachtung hat keine Geometrie."
      );
    }
    const id = await insertMipa(asNewMipa(row), jwt);
    journal.record(`Neue Vermietung/Verpachtung ${row.lage}`, () =>
      deleteMipa(id, jwt)
    );
  }

  const kept = new Set(draft.mipas.map((row) => row.mipaId));
  for (const row of original.mipas.filter((row) => !kept.has(row.mipaId))) {
    await deleteMipa(row.mipaId, jwt);
    // the restored MiPa gets a new id
    journal.record(`Gelöschte Vermietung/Verpachtung ${row.lage}`, () =>
      insertMipa(asNewMipa(row), jwt)
    );
  }
};
