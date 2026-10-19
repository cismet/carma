import { nanoid } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import {
  deleteKassenzeichen,
  fetchKassenzeichenForEdit,
  insertKassenzeichen,
  toTimestamp,
} from "../wizard/api";
import { kassenzeichenExists } from "../wizard/cidsActions";

// zugeordnetAm stays the server value, the undo writes it back unchanged
const toRow = (kassenzeichen) => ({
  id: String(kassenzeichen.id),
  kassenzeichenId: kassenzeichen.id,
  nummer: String(kassenzeichen.kassenzeichennummer ?? ""),
  zugeordnetAm: kassenzeichen.zugeordnet_am ?? null,
  zugeordnetVon: kassenzeichen.zugeordnet_von ?? null,
});

export const loadKassenzeichenSection = async (schluesselId, jwt) => {
  const flurstueck = await fetchKassenzeichenForEdit(schluesselId, jwt);
  return (
    flurstueck && {
      flurstueckId: flurstueck.id,
      kassenzeichen: (flurstueck.kassenzeichenArrayRelationShip ?? []).map(
        toRow
      ),
    }
  );
};

export const newKassenzeichenRow = () => ({
  id: nanoid(),
  nummer: "",
  zugeordnetAm: null,
  zugeordnetVon: null,
});

const asKassenzeichen = (
  flurstueckId,
  nummer,
  zugeordnetAm,
  zugeordnetVon
) => ({
  fk_flurstueck: flurstueckId,
  kassenzeichennummer: Number(nummer),
  zugeordnet_am: zugeordnetAm
    ? toTimestamp(dayjs(zugeordnetAm).toDate())
    : null,
  zugeordnet_von: zugeordnetVon,
});

export const findUnknownKassenzeichen = async (draft, jwt) => {
  const nummern = [
    ...new Set(
      draft.kassenzeichen
        .filter((row) => !row.kassenzeichenId)
        .map((row) => row.nummer.trim())
    ),
  ];
  const exists = await Promise.all(
    nummern.map((nummer) => kassenzeichenExists(nummer, jwt))
  );
  return nummern
    .filter((_, i) => !exists[i])
    .map((nummer) => ({
      name: `Kassenzeichen ${nummer}`,
      text: "Das Kassenzeichen existiert nicht",
    }));
};

export const saveKassenzeichenEdit = async (original, draft, ctx) => {
  const { jwt, accountName, journal } = ctx;
  const { flurstueckId } = original;
  const now = new Date();

  for (const row of draft.kassenzeichen.filter((row) => !row.kassenzeichenId)) {
    const nummer = row.nummer.trim();
    const id = await insertKassenzeichen(
      asKassenzeichen(flurstueckId, nummer, now, accountName),
      jwt
    );
    journal.record(`Neues Kassenzeichen ${nummer}`, () =>
      deleteKassenzeichen(id, jwt)
    );
  }

  const kept = new Set(draft.kassenzeichen.map((row) => row.kassenzeichenId));
  for (const row of original.kassenzeichen.filter(
    (row) => !kept.has(row.kassenzeichenId)
  )) {
    await deleteKassenzeichen(row.kassenzeichenId, jwt);
    // the restored Kassenzeichen gets a new id
    journal.record(`Gelöschtes Kassenzeichen ${row.nummer}`, () =>
      insertKassenzeichen(
        asKassenzeichen(
          flurstueckId,
          row.nummer,
          row.zugeordnetAm,
          row.zugeordnetVon
        ),
        jwt
      )
    );
  }
};
