import { nanoid } from "@reduxjs/toolkit";
import {
  deleteVertrag,
  fetchParcelsForVertraege,
  fetchVertraegeForEdit,
  insertVertrag,
  saveBeschluss,
  saveFlurstueckArrays,
  saveKosten,
  saveVertrag,
} from "../wizard/api";
import { toCidsDate, toDay } from "./dates";
import { hasId } from "./ids";

// same text as the view's Querverweise links
const parcelLabel = (schluessel) =>
  `${schluessel.gemarkung?.bezeichnung} ${schluessel.flur} ${schluessel.flurstueck_zaehler}/${schluessel.flurstueck_nenner}`;

const toKostenRow = (kosten) => ({
  id: String(kosten.id),
  kostenId: kosten.id,
  artId: kosten.kostenart?.id,
  betrag: kosten.betrag ?? null,
  datum: toDay(kosten.datum),
});

const toBeschlussRow = (beschluss) => ({
  id: String(beschluss.id),
  beschlussId: beschluss.id,
  artId: beschluss.beschlussart?.id,
  datum: toDay(beschluss.datum),
});

const toRow = (vertrag, querverweise) => ({
  id: String(vertrag.id),
  vertragId: vertrag.id,
  artId: vertrag.vertragsart?.id,
  aktenzeichen: vertrag.aktenzeichen ?? "",
  vertragspartner: vertrag.vertragspartner ?? "",
  quadratmeterpreis: vertrag.quadratmeterpreis ?? null,
  gesamtpreis: vertrag.gesamtpreis ?? null,
  auflassung: toDay(vertrag.datum_auflassung),
  eintragung: toDay(vertrag.datum_eintragung),
  bemerkung: vertrag.bemerkung ?? "",
  kosten: (vertrag.kostenArrayRelationShip ?? []).map(toKostenRow),
  beschluesse: (vertrag.beschlussArrayRelationShip ?? []).map(toBeschlussRow),
  querverweise,
});

// other parcels per Vertrag, the Querverweise
const loadQuerverweise = async (schluesselId, vertragIds, jwt) => {
  const byVertrag = new Map(vertragIds.map((id) => [id, []]));
  if (!vertragIds.length) {
    return byVertrag;
  }
  const parcels = await fetchParcelsForVertraege(vertragIds, jwt);
  for (const parcel of parcels) {
    if (parcel.fk_flurstueck_schluessel === schluesselId) {
      continue;
    }
    for (const { fk_vertrag } of parcel.ar_vertraegeArray ?? []) {
      byVertrag
        .get(fk_vertrag)
        ?.push(parcelLabel(parcel.flurstueck_schluessel));
    }
  }
  return byVertrag;
};

export const loadVertragSection = async (schluesselId, jwt) => {
  const flurstueck = await fetchVertraegeForEdit(schluesselId, jwt);
  if (!flurstueck) {
    return undefined;
  }
  const vertraege = (flurstueck.ar_vertraegeArray ?? [])
    .map((entry) => entry.vertrag)
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
  const querverweise = await loadQuerverweise(
    schluesselId,
    vertraege.map((vertrag) => vertrag.id),
    jwt
  );
  return {
    flurstueckId: flurstueck.id,
    vertraege: vertraege.map((vertrag) =>
      toRow(vertrag, querverweise.get(vertrag.id) ?? [])
    ),
  };
};

export const newVertragRow = (vertragsarten) => ({
  id: nanoid(),
  artId: vertragsarten?.[0]?.id,
  aktenzeichen: "",
  vertragspartner: "",
  quadratmeterpreis: null,
  gesamtpreis: null,
  auflassung: null,
  eintragung: null,
  bemerkung: "",
  kosten: [],
  beschluesse: [],
  querverweise: [],
});

export const newKostenRow = () => ({
  id: nanoid(),
  artId: undefined,
  betrag: null,
  datum: null,
});

export const newBeschlussRow = () => ({
  id: nanoid(),
  artId: undefined,
  datum: null,
});

export const vertragspartnerLabel = (artId) => {
  if (artId === 1) {
    return "Voreigentümer";
  }
  if (artId === 2) {
    return "Erwerber";
  }
  return "Vertragspartner";
};

const ref = (id) => (hasId(id) ? { id } : null);

const vertragFields = (row) => ({
  vertragsart: ref(row.artId),
  aktenzeichen: row.aktenzeichen || null,
  vertragspartner: row.vertragspartner || null,
  quadratmeterpreis: row.quadratmeterpreis ?? null,
  gesamtpreis: row.gesamtpreis ?? null,
  datum_auflassung: toCidsDate(row.auflassung),
  datum_eintragung: toCidsDate(row.eintragung),
  bemerkung: row.bemerkung || null,
});

const kostenFields = (row) => ({
  kostenart: ref(row.artId),
  betrag: row.betrag ?? null,
  datum: toCidsDate(row.datum),
});

const beschlussFields = (row) => ({
  beschlussart: ref(row.artId),
  datum: toCidsDate(row.datum),
});

const CHILDREN = [
  {
    array: "kostenArrayRelationShip",
    rows: "kosten",
    idOf: (row) => row.kostenId,
    fields: kostenFields,
    save: saveKosten,
    label: "Kosten",
  },
  {
    array: "beschlussArrayRelationShip",
    rows: "beschluesse",
    idOf: (row) => row.beschlussId,
    fields: beschlussFields,
    save: saveBeschluss,
    label: "Beschluss",
  },
];

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// { changes, undo } with only the fields that differ
const diff = (next, old) => {
  const changes = {};
  const undo = {};
  for (const name of Object.keys(next)) {
    if (!sameValue(next[name], old[name])) {
      changes[name] = next[name];
      undo[name] = old[name];
    }
  }
  return { changes, undo };
};

const asNewVertrag = (row) => ({
  ...vertragFields(row),
  kostenArrayRelationShip: row.kosten.map(kostenFields),
  beschlussArrayRelationShip: row.beschluesse.map(beschlussFields),
});

const idSet = (rows, idOf) => new Set(rows.map(idOf).filter(Boolean));

const updateChildren = async (child, before, row, { jwt, journal }) => {
  const old = new Map(before[child.rows].map((r) => [child.idOf(r), r]));
  for (const kept of row[child.rows].filter(child.idOf)) {
    const { changes, undo } = diff(
      child.fields(kept),
      child.fields(old.get(child.idOf(kept)))
    );
    if (Object.keys(changes).length) {
      await child.save(child.idOf(kept), changes, jwt);
      journal.record(
        `${child.label} ${child.idOf(kept)} des Vertrags ${row.aktenzeichen}`,
        () => child.save(child.idOf(kept), undo, jwt)
      );
    }
  }
};

// Kept children stay as { id }; cids drops the ones missing from the array.
const childArrays = (vertrag, before) => {
  const next = {};
  const undo = {};
  for (const child of CHILDREN) {
    const draftIds = idSet(vertrag[child.rows], child.idOf);
    const added = vertrag[child.rows].filter((r) => !child.idOf(r));
    const removed = before[child.rows].filter(
      (r) => !draftIds.has(child.idOf(r))
    );
    if (added.length || removed.length) {
      const kept = [...draftIds].map((id) => ({ id }));
      next[child.array] = [...kept, ...added.map(child.fields)];
      // removed ones come back with a new id; added ones are dropped again
      undo[child.array] = [...kept, ...removed.map(child.fields)];
    }
  }
  return { next, undo };
};

const updateVertrag = async (before, row, ctx) => {
  const { jwt, journal } = ctx;
  for (const child of CHILDREN) {
    await updateChildren(child, before, row, ctx);
  }
  const fields = diff(vertragFields(row), vertragFields(before));
  const arrays = childArrays(row, before);
  const changes = { ...fields.changes, ...arrays.next };
  if (Object.keys(changes).length) {
    await saveVertrag(row.vertragId, changes, jwt);
    journal.record(`Vertrag ${row.aktenzeichen}`, () =>
      saveVertrag(row.vertragId, { ...fields.undo, ...arrays.undo }, jwt)
    );
  }
};

const linkArray = (ids) => ids.map((id) => ({ vertrag: { id } }));

// (Querverweise). Removing one only unlinks it from this parcel.
export const saveVertragEdit = async (original, draft, ctx) => {
  const { jwt, journal } = ctx;
  const before = new Map(original.vertraege.map((row) => [row.vertragId, row]));

  for (const row of draft.vertraege.filter((row) => row.vertragId)) {
    await updateVertrag(before.get(row.vertragId), row, ctx);
  }

  const linked = draft.vertraege
    .filter((row) => row.vertragId)
    .map((row) => row.vertragId);
  for (const row of draft.vertraege.filter((row) => !row.vertragId)) {
    const id = await insertVertrag(asNewVertrag(row), jwt);
    journal.record(`Neuer Vertrag ${row.aktenzeichen}`, () =>
      deleteVertrag(id, jwt)
    );
    linked.push(id);
  }

  const originalIds = original.vertraege.map((row) => row.vertragId);
  if (!sameValue([...linked].sort(), [...originalIds].sort())) {
    await saveFlurstueckArrays(
      original.flurstueckId,
      { ar_vertraegeArray: linkArray(linked) },
      jwt
    );
    // runs before the inserts are undone (journal rolls back in reverse)
    journal.record("Verträge des Flurstücks", () =>
      saveFlurstueckArrays(
        original.flurstueckId,
        { ar_vertraegeArray: linkArray(originalIds) },
        jwt
      )
    );
  }
};
