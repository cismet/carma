import { nanoid } from "@reduxjs/toolkit";
import {
  ActionNotSuccessfulError,
  deleteRebe,
  fetchRebeForEdit,
  insertRebe,
  saveRebe,
} from "../wizard/api";
import { isStaedtischKey } from "../wizard/adminData";
import { toCidsDate, toDay } from "./dates";
import { getBuffer25832 } from "../tools/mappingTools";
import { hasId } from "./ids";

const toRow = (rebe) => ({
  id: String(rebe.id),
  rebeId: rebe.id,
  istRecht: Boolean(rebe.ist_recht),
  artId: rebe.rebe_art?.id,
  beschreibung: rebe.beschreibung ?? "",
  nummer: rebe.nummer ?? "",
  eintragung: toDay(rebe.datum_eintragung),
  loeschung: toDay(rebe.datum_loeschung),
  bemerkung: rebe.bemerkung ?? "",
  geometry: rebe.geom?.geo_field,
});

// Unlike MiPa, Java edits ReBe on every parcel; only städtische parcels may
// switch between Recht and Belastung (ReBeTableModel.isReBeKindSwitchAllowed).
export const loadRebeSection = async (key, parcelGeometry, jwt) => {
  if (!parcelGeometry) {
    return undefined;
  }
  const rebes = await fetchRebeForEdit(getBuffer25832(parcelGeometry, -1), jwt);
  return {
    parcelGeometry,
    kindSwitchAllowed: isStaedtischKey(key),
    rebes: rebes.map(toRow),
  };
};

// like Java ReBeTable.addNewItem: a new ReBe covers the whole parcel
export const newRebeRow = ({ parcelGeometry, kindSwitchAllowed }) => ({
  id: nanoid(),
  istRecht: !kindSwitchAllowed,
  artId: undefined,
  beschreibung: "",
  nummer: "",
  eintragung: null,
  loeschung: null,
  bemerkung: "",
  geometry: parcelGeometry,
});

// Java ReBePanel: picking "Dienstbarkeit" prefills an empty Nummer
const DIENSTBARKEIT = "Dienstbarkeit";
const DIENSTBARKEIT_NUMMER = "Abt. II, lfd. Nr. ";

export const artChanges = (row, artId, artName) => ({
  artId,
  ...(artName === DIENSTBARKEIT && !row.nummer.trim()
    ? { nummer: DIENSTBARKEIT_NUMMER }
    : {}),
});

const fields = (row) => ({
  ist_recht: row.istRecht,
  rebe_art: hasId(row.artId) ? { id: row.artId } : null,
  beschreibung: row.beschreibung || null,
  nummer: row.nummer || null,
  datum_eintragung: toCidsDate(row.eintragung),
  datum_loeschung: toCidsDate(row.loeschung),
  bemerkung: row.bemerkung || null,
});

const asNewRebe = (row) => ({
  ...fields(row),
  geom: { geo_field: row.geometry },
});

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const updateRow = async (before, row, { jwt, journal }) => {
  const next = fields(row);
  const old = fields(before);
  const changes = {};
  const undo = {};
  for (const name of Object.keys(next)) {
    if (!sameValue(next[name], old[name])) {
      changes[name] = next[name];
      undo[name] = old[name];
    }
  }
  if (Object.keys(changes).length) {
    await saveRebe(row.rebeId, changes, jwt);
    journal.record(`Recht/Belastung Nummer ${row.nummer}`, () =>
      saveRebe(row.rebeId, undo, jwt)
    );
  }
};

// Like the Java client: rows are changed in place and a removed ReBe is
// deleted. Deletes run last, they are the hardest to undo.
export const saveRebeEdit = async (original, draft, ctx) => {
  const { jwt, journal } = ctx;
  const before = new Map(original.rebes.map((row) => [row.rebeId, row]));

  for (const row of draft.rebes.filter((row) => row.rebeId)) {
    await updateRow(before.get(row.rebeId), row, ctx);
  }

  for (const row of draft.rebes.filter((row) => !row.rebeId)) {
    if (!row.geometry) {
      throw new ActionNotSuccessfulError(
        "Ein neues Recht/eine neue Belastung hat keine Geometrie."
      );
    }
    const id = await insertRebe(asNewRebe(row), jwt);
    journal.record(`Neues Recht/neue Belastung Nummer ${row.nummer}`, () =>
      deleteRebe(id, jwt)
    );
  }

  const kept = new Set(draft.rebes.map((row) => row.rebeId));
  for (const row of original.rebes.filter((row) => !kept.has(row.rebeId))) {
    await deleteRebe(row.rebeId, jwt);
    // the restored ReBe gets a new id
    journal.record(
      `Gelöschtes Recht/gelöschte Belastung Nummer ${row.nummer}`,
      () => insertRebe(asNewRebe(row), jwt)
    );
  }
};
