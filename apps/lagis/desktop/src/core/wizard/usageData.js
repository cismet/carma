import { nanoid } from "@reduxjs/toolkit";
import {
  fetchFlurstueckBySchluesselId,
  fetchNutzungenForFlurstueck,
  fetchNutzungStammdaten,
} from "./api";
import { adminTargets, inheritedSourceKeys, uniqueBy } from "./adminData";
import { fetchGeometries, geometryForKey } from "./geometry";
import { formatKey } from "./keys";

let stammdatenCache;

export const loadUsageStammdaten = async (jwt) => {
  if (!stammdatenCache) {
    stammdatenCache = await fetchNutzungStammdaten(jwt);
  }
  return stammdatenCache;
};

export const newUsageRow = () => ({
  id: nanoid(),
  anlageklasseId: undefined,
  nutzungsartId: undefined,
  flaeche: null,
  quadratmeterpreis: null,
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

// split/join: new parcels start with the consumed parcels' current Nutzungen
export const loadInheritedUsage = async (value, jwt) => {
  const missing = adminTargets(value).filter(
    ({ key }) => !value.usage?.[formatKey(key)]
  );
  const sourceKeys = inheritedSourceKeys(value);
  if (!missing.length || !sourceKeys.length) {
    return {};
  }

  const buchungen = uniqueBy(
    (
      await Promise.all(sourceKeys.map((key) => fetchSourceBuchungen(key, jwt)))
    ).flat(),
    (b) => `${b.fk_anlageklasse}/${b.fk_nutzungsart}/${b.quadratmeterpreis}`
  );
  if (!buchungen.length) {
    return {};
  }

  const withoutArea = missing
    .map(({ key }) => key)
    .filter((key) => value.admin?.[formatKey(key)]?.area === undefined);
  const geometries = withoutArea.length
    ? await fetchGeometries(withoutArea, jwt)
    : {};

  const usage = {};
  for (const { key } of missing) {
    const label = formatKey(key);
    const area =
      value.admin?.[label]?.area ?? geometryForKey(key, geometries)?.area;
    usage[label] = buchungen.map((b) => ({
      id: nanoid(),
      anlageklasseId: b.fk_anlageklasse ?? undefined,
      nutzungsartId: b.fk_nutzungsart ?? undefined,
      flaeche:
        buchungen.length === 1 && Number.isFinite(area)
          ? Math.round(area)
          : null,
      quadratmeterpreis: b.quadratmeterpreis ?? null,
    }));
  }
  return usage;
};
