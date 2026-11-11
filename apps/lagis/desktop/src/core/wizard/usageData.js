import { nanoid } from "@reduxjs/toolkit";
import {
  fetchFlurstueckBySchluesselId,
  fetchNutzungenForFlurstueck,
} from "./api";
import { adminTargets, inheritedSourceKeys } from "./adminData";
import { formatKey } from "./keys";

// prefilled from the selected (or last) row, so similar Nutzungen need fewer edits
export const newUsageRow = (previous) => ({
  id: nanoid(),
  anlageklasseId: previous?.anlageklasseId,
  nutzungsartId: previous?.nutzungsartId,
  flaeche: previous?.flaeche ?? null,
  quadratmeterpreis: previous?.quadratmeterpreis ?? null,
});

export const gesamtpreis = (row) =>
  Number.isFinite(row.flaeche) && Number.isFinite(row.quadratmeterpreis)
    ? row.flaeche * row.quadratmeterpreis
    : null;

const currentBuchung = (nutzung) =>
  nutzung.historisch
    ? undefined
    : (nutzung.nutzung_buchungArrayRelationShip ?? []).find(
        (buchung) => !buchung.gueltig_bis
      );

const toUsageRow = (buchung) => ({
  id: nanoid(),
  anlageklasseId: buchung.fk_anlageklasse ?? undefined,
  nutzungsartId: buchung.fk_nutzungsart ?? undefined,
  flaeche: buchung.flaeche ?? null,
  quadratmeterpreis: buchung.quadratmeterpreis ?? null,
});

const fetchSourceRows = async (key, jwt) => {
  const flurstueck = await fetchFlurstueckBySchluesselId(key.id, jwt);
  if (!flurstueck) {
    return [];
  }
  const nutzungen = await fetchNutzungenForFlurstueck(flurstueck.id, jwt);
  return nutzungen.map(currentBuchung).filter(Boolean).map(toUsageRow);
};

// marks which parcels value.sourceUsage was loaded for, so a changed choice reloads it
export const sourceUsageFor = (value) =>
  inheritedSourceKeys(value)
    .map((key) => key.id)
    .join(",");

// the current Nutzungen of the parcels a split or join consumes
export const loadSourceUsage = async (value, jwt) => {
  const rows = await Promise.all(
    inheritedSourceKeys(value).map((key) => fetchSourceRows(key, jwt))
  );
  return rows.flat();
};

// split/join: new parcels start with exact copies of the consumed parcels' current Nutzungen
export const inheritUsage = (value, sourceUsage) => {
  const missing = adminTargets(value).filter(
    ({ key }) => !value.usage?.[formatKey(key)]
  );
  if (!missing.length || !sourceUsage.length) {
    return {};
  }
  const usage = {};
  for (const { key } of missing) {
    usage[formatKey(key)] = sourceUsage.map((row) => ({
      ...row,
      id: nanoid(),
    }));
  }
  return usage;
};
