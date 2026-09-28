import { nanoid } from "@reduxjs/toolkit";
import {
  fetchAdminData,
  fetchDienststellen,
  fetchStrassennamen,
  fetchZusatzRolleArten,
} from "./api";
import { WIZARD_ACTIONS } from "./constants";
import { fetchGeometries, geometryForKey } from "./geometry";
import { formatKey } from "./keys";

export const ADMIN_SECTION = {
  DIENSTSTELLEN: "dienststellen",
  ROLLEN: "rollen",
  STRASSENFRONTEN: "strassenfronten",
  BEMERKUNGEN: "bemerkungen",
};

export const adminTargets = (value) => {
  const one = (key, source) => (key ? [{ key, source }] : []);
  switch (value.action) {
    case WIZARD_ACTIONS.CREATE:
      return one(value.createKey);
    case WIZARD_ACTIONS.RENAME:
      return one(value.createKey, value.renameKey);
    case WIZARD_ACTIONS.ACTIVATE:
      return one(value.activateKey, value.activateKey);
    case WIZARD_ACTIONS.CHANGE_KIND:
      return one(value.changeKey, value.changeKey);
    case WIZARD_ACTIONS.SPLIT:
    case WIZARD_ACTIONS.JOIN:
    case WIZARD_ACTIONS.SPLIT_JOIN:
      return (value.resultKeys ?? []).filter(Boolean).map((key) => ({ key }));
    default:
      return [];
  }
};

const knownOutlines = (value) =>
  value.createKey && value.createOutline
    ? { [formatKey(value.createKey)]: value.createOutline }
    : {};

const rowId = () => nanoid();

const round2 = (number) =>
  Number.isFinite(number) ? Math.round(number * 100) / 100 : undefined;

const toParcelData = (source, area) => ({
  area,
  dienststellen: source.bereiche.map((b, index, all) => ({
    id: rowId(),
    dienststelleId: b.verwaltende_dienststelle?.id,
    flaeche:
      all.length === 1 && area !== undefined ? area : round2(b.flaeche) ?? null,
  })),
  rollen: source.rollen.map((r) => ({
    id: rowId(),
    dienststelleId: r.verwaltende_dienststelle?.id,
    rolleArtId: r.zusatz_rolle_art?.id,
  })),
  strassenfronten: source.strassenfronten.map((s) => ({
    id: rowId(),
    strassenname: s.strassenname ?? "",
    laenge: round2(s.laenge) ?? null,
  })),
  bemerkung: source.bemerkung,
});

const EMPTY_SOURCE = {
  bemerkung: "",
  bereiche: [],
  rollen: [],
  strassenfronten: [],
};

let stammdatenCache;

const loadStammdaten = async (jwt) => {
  if (!stammdatenCache) {
    const [dienststellen, rolleArten, strassennamen] = await Promise.all([
      fetchDienststellen(jwt),
      fetchZusatzRolleArten(jwt),
      fetchStrassennamen(),
    ]);
    stammdatenCache = { dienststellen, rolleArten, strassennamen };
  }
  return stammdatenCache;
};

export const loadAdminData = async (value, jwt) => {
  const stammdaten = await loadStammdaten(jwt);
  const missing = adminTargets(value).filter(
    ({ key }) => !value.admin?.[formatKey(key)]
  );
  if (!missing.length) {
    return { stammdaten, parcels: {} };
  }

  const outlines = knownOutlines(value);
  const unknown = missing
    .map(({ key }) => key)
    .filter((key) => !outlines[formatKey(key)]);
  const geometries = unknown.length ? await fetchGeometries(unknown, jwt) : {};
  for (const key of unknown) {
    outlines[formatKey(key)] = geometryForKey(key, geometries);
  }

  const parcels = {};
  for (const { key, source } of missing) {
    const label = formatKey(key);
    const data = source?.id
      ? await fetchAdminData(source.id, jwt)
      : EMPTY_SOURCE;
    parcels[label] = {
      ...toParcelData(data, round2(outlines[label]?.area)),
      // EPSG:25832, undefined when ALKIS has no geometry
      geometry: outlines[label]?.geometry,
      sperre: source?.istGesperrt ?? false,
      sperreBemerkung: source?.bemerkungSperre ?? "",
    };
  }
  return { stammdaten, parcels };
};

const duplicates = (values) => new Set(values).size !== values.length;

export const findAdminProblem = (section, admin, targets) => {
  for (const { key } of targets) {
    const label = formatKey(key);
    const parcel = admin?.[label];
    if (!parcel) {
      continue;
    }
    if (section === ADMIN_SECTION.DIENSTSTELLEN) {
      const rows = parcel.dienststellen;
      if (rows.some((row) => !row.dienststelleId)) {
        return `Bitte wählen Sie für jede Zeile von "${label}" eine Dienststelle aus`;
      }
      if (duplicates(rows.map((row) => row.dienststelleId))) {
        return `Eine Dienststelle ist bei "${label}" mehrfach eingetragen`;
      }
    }
    if (section === ADMIN_SECTION.ROLLEN) {
      const rows = parcel.rollen;
      if (rows.some((row) => !row.dienststelleId || !row.rolleArtId)) {
        return `Bitte wählen Sie für jede Rolle von "${label}" Dienststelle und Rolle aus`;
      }
      if (duplicates(rows.map((r) => `${r.dienststelleId}/${r.rolleArtId}`))) {
        return `Eine Rolle ist bei "${label}" mehrfach eingetragen`;
      }
    }
    if (section === ADMIN_SECTION.STRASSENFRONTEN) {
      if (parcel.strassenfronten.some((row) => !row.strassenname?.trim())) {
        return `Bitte geben Sie für jede Straßenfront von "${label}" eine Straße ein`;
      }
    }
  }
  return null;
};

export const newDienststelleRow = (parcel) => ({
  id: rowId(),
  dienststelleId: undefined,
  flaeche: parcel.dienststellen.length === 0 ? parcel.area ?? null : null,
});

export const newRolleRow = () => ({
  id: rowId(),
  dienststelleId: undefined,
  rolleArtId: undefined,
});

export const newStrassenfrontRow = () => ({
  id: rowId(),
  strassenname: "",
  laenge: null,
});
