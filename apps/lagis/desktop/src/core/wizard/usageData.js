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

const fetchSourceBuchungen = async (key, jwt) => {
  const flurstueck = await fetchFlurstueckBySchluesselId(key.id, jwt);
  if (!flurstueck) {
    return [];
  }
  const nutzungen = await fetchNutzungenForFlurstueck(flurstueck.id, jwt);
  return nutzungen.map(currentBuchung).filter(Boolean);
};

// split/join: new parcels start with exact copies of the consumed parcels' current Nutzungen
export const loadInheritedUsage = async (value, jwt) => {
  const missing = adminTargets(value).filter(
    ({ key }) => !value.usage?.[formatKey(key)]
  );
  const sourceKeys = inheritedSourceKeys(value);
  if (!missing.length || !sourceKeys.length) {
    return {};
  }

  const buchungen = (
    await Promise.all(sourceKeys.map((key) => fetchSourceBuchungen(key, jwt)))
  ).flat();
  if (!buchungen.length) {
    return {};
  }

  const usage = {};
  for (const { key } of missing) {
    usage[formatKey(key)] = buchungen.map((b) => ({
      id: nanoid(),
      anlageklasseId: b.fk_anlageklasse ?? undefined,
      nutzungsartId: b.fk_nutzungsart ?? undefined,
      flaeche: b.flaeche ?? null,
      quadratmeterpreis: b.quadratmeterpreis ?? null,
    }));
  }
  return usage;
};
