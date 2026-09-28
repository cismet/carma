import { fetchGraphQL, fetchGraphQLFromWuNDa } from "../graphql";
import { ENDPOINT } from "@carma-commons/resources";
import wizardQueries from "./queries";
import { gazDataConfig } from "../../config/gazData";
import { finishCall, startCall } from "./gqlLog";
import { deleteObject, saveObject, saveAndGetId } from "./cidsActions";
import { ActionNotSuccessfulError } from "./errors";
import { formatKey } from "./keys";

export { ActionNotSuccessfulError, CidsActionError } from "./errors";

const execute = async (fetcher, query, variables, jwt) => {
  const callId = startCall(query, variables);
  const startedAt = Date.now();

  const fail = (message, response, logMessage = message) => {
    finishCall(callId, {
      status: "error",
      ms: Date.now() - startedAt,
      message: logMessage,
      response,
    });
    return new ActionNotSuccessfulError(message, response);
  };

  let result;
  try {
    result = await fetcher(query, variables, jwt);
  } catch (e) {
    throw fail("Die Verbindung zum Server ist fehlgeschlagen.", String(e));
  }
  if (result?.status === 401) {
    throw fail("Die Anmeldung ist abgelaufen.", result);
  }
  if (!result?.ok) {
    throw fail(
      "Der Server konnte die Anfrage nicht verarbeiten.",
      result,
      `Der Server antwortete mit Status ${result?.status ?? "?"}.`
    );
  }
  if (result.errors?.length) {
    throw fail(
      "Die Anfrage an den Server war nicht erfolgreich.",
      result.errors,
      result.errors[0].message
    );
  }

  finishCall(callId, {
    status: "ok",
    ms: Date.now() - startedAt,
    response: result.data,
  });
  return result.data;
};

export const run = (query, variables, jwt) =>
  execute(fetchGraphQL, query, variables, jwt);

export const runWuNDa = (query, variables, jwt) =>
  execute(fetchGraphQLFromWuNDa, query, variables, jwt);

export const CLASS = {
  SCHLUESSEL: "flurstueck_schluessel",
  FLURSTUECK: "flurstueck",
  HISTORIE: "flurstueck_historie",
  NUTZUNG: "nutzung",
  NUTZUNG_BUCHUNG: "nutzung_buchung",
  DMS_URL: "dms_url",
  VERWALTUNGSBEREICH_EINTRAG: "verwaltungsbereiche_eintrag",
  REBE: "rebe",
  MIPA: "mipa",
  LOCK: "cs_locks",
};

const pad2 = (value) => String(value).padStart(2, "0");

/** cids wants exactly YYYY-MM-DDTHH:mm:ss, no timezone or millis. */
const formatCidsDate = (date, withTime) => {
  const d = date instanceof Date ? date : new Date(date);
  const day = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}`;
  const time = withTime
    ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    : "00:00:00";
  return `${day}T${time}`;
};

export const toTimestamp = (date) => (date ? formatCidsDate(date, true) : null);

const nowIso = () => toTimestamp(new Date());

export const fetchFlurstueckArten = async (jwt) => {
  const data = await run(wizardQueries.flurstueckArten, {}, jwt);
  return data.flurstueck_art ?? [];
};

export const findArtByBezeichnung = (arten, bezeichnung) =>
  arten.find((art) => art.bezeichnung === bezeichnung);

export const requireArt = (arten, bezeichnung) => {
  const art = findArtByBezeichnung(arten, bezeichnung);
  if (!art) {
    throw new ActionNotSuccessfulError(
      `Die Flurstücksart "${bezeichnung}" ist nicht in der Datenbank.`
    );
  }
  return art;
};

const mapSchluessel = (row) =>
  row
    ? {
        id: row.id,
        gemarkung: row.gemarkung,
        flur: row.flur,
        zaehler: row.flurstueck_zaehler,
        nenner: row.flurstueck_nenner,
        art: row.flurstueck_art,
        gueltigBis: row.gueltig_bis,
        warStaedtisch: row.war_staedtisch ?? false,
        istGesperrt: row.ist_gesperrt ?? false,
        bemerkungSperre: row.bemerkung_sperre ?? "",
        datumEntstehung: row.datum_entstehung,
        datumLetzterStadtbesitz: row.datum_letzter_stadtbesitz,
      }
    : undefined;

export const findSchluesselByKey = async (key, jwt) => {
  const noNenner = key.nenner === null || key.nenner === undefined;
  const zeroNenner = Number(key.nenner) === 0;
  let query = wizardQueries.schluesselByKeyWithNenner;
  if (noNenner) {
    query = wizardQueries.schluesselByKeyWithoutNenner;
  } else if (zeroNenner) {
    query = wizardQueries.schluesselByKeyZeroNenner;
  }
  const data = await run(
    query,
    {
      gemarkungId: key.gemarkung?.id,
      flur: key.flur,
      zaehler: key.zaehler,
      ...(noNenner || zeroNenner ? {} : { nenner: key.nenner }),
    },
    jwt
  );
  const rows = data.flurstueck_schluessel ?? [];
  if (rows.length > 1) {
    throw new ActionNotSuccessfulError(
      `Zu "${formatKey(key)}" gibt es mehrere Schlüssel in der Datenbank.`
    );
  }
  return mapSchluessel(rows[0]);
};

export const fetchSchluesselById = async (id, jwt) => {
  const data = await run(wizardQueries.schluesselById, { id }, jwt);
  return mapSchluessel(data.flurstueck_schluessel?.[0]);
};

export const insertSchluessel = (object, jwt) =>
  saveAndGetId(CLASS.SCHLUESSEL, object, jwt);

export const updateSchluessel = (id, changes, jwt, accountName) =>
  saveObject(
    CLASS.SCHLUESSEL,
    {
      id,
      ...changes,
      letzter_bearbeiter: accountName,
      letzte_bearbeitung: nowIso(),
    },
    jwt
  );

export const deleteSchluessel = (id, jwt) =>
  deleteObject(CLASS.SCHLUESSEL, { id }, jwt);

export const fetchFlurstueckBySchluesselId = async (schluesselId, jwt) => {
  const data = await run(
    wizardQueries.flurstueckBySchluesselId,
    { schluesselId },
    jwt
  );
  const row = (data.flurstueck ?? [])[0];
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    bemerkung: row.bemerkung,
    inStadtbesitz: row.in_stadtbesitz,
    spielplatzId: row.fk_spielplatz,
    schluesselId: row.fk_flurstueck_schluessel,
    nutzungen: row.nutzungArrayRelationShip ?? [],
    dmsUrls: row.dms_urlArrayRelationShip ?? [],
    verwaltungsbereichEintraege:
      row.verwaltungsbereiche_eintragArrayRelationShip ?? [],
    arVertraege: row.ar_vertraegeArray ?? [],
    arBaeume: row.ar_baeumeArray ?? [],
  };
};

export const insertFlurstueck = (object, jwt) =>
  saveAndGetId(CLASS.FLURSTUECK, object, jwt);

export const updateFlurstueck = (id, changes, jwt) =>
  saveObject(CLASS.FLURSTUECK, { id, ...changes }, jwt);

export const deleteFlurstueck = (id, jwt) =>
  deleteObject(CLASS.FLURSTUECK, { id }, jwt);

export const saveFlurstueckArrays = (id, arrays, jwt) =>
  saveObject(CLASS.FLURSTUECK, { id, ...arrays }, jwt);

export const fetchSuccessorEdges = async (flurstueckId, jwt) => {
  const data = await run(wizardQueries.successorEdges, { flurstueckId }, jwt);
  return data.flurstueck_historie ?? [];
};

export const hasSuccessors = async (flurstueckId, jwt) =>
  (await fetchSuccessorEdges(flurstueckId, jwt)).length > 0;

export const insertHistoryEdge = (vorgaengerId, nachfolgerId, jwt) =>
  saveAndGetId(
    CLASS.HISTORIE,
    { fk_vorgaenger: vorgaengerId, fk_nachfolger: nachfolgerId },
    jwt
  );

export const deleteHistoryEdge = (id, jwt) =>
  deleteObject(CLASS.HISTORIE, { id }, jwt);

export const fetchNutzungenForFlurstueck = async (flurstueckId, jwt) => {
  const data = await run(
    wizardQueries.nutzungenForFlurstueck,
    { flurstueckId },
    jwt
  );
  return data.nutzung ?? [];
};

export const insertNutzung = (object, jwt) =>
  saveAndGetId(CLASS.NUTZUNG, object, jwt);

export const updateNutzung = (id, changes, jwt) =>
  saveObject(CLASS.NUTZUNG, { id, ...changes }, jwt);

export const deleteNutzung = (id, jwt) =>
  deleteObject(CLASS.NUTZUNG, { id }, jwt);

export const updateNutzungBuchung = (id, changes, jwt) =>
  saveObject(CLASS.NUTZUNG_BUCHUNG, { id, ...changes }, jwt);

export const moveDmsUrl = (id, flurstueckId, jwt) =>
  saveObject(CLASS.DMS_URL, { id, fk_flurstueck: flurstueckId }, jwt);

export const moveVerwaltungsbereichEintrag = (id, flurstueckId, jwt) =>
  saveObject(
    CLASS.VERWALTUNGSBEREICH_EINTRAG,
    { id, fk_flurstueck: flurstueckId },
    jwt
  );

export const updateRebe = (id, datumLoeschung, jwt) =>
  saveObject(CLASS.REBE, { id, datum_loeschung: datumLoeschung }, jwt);

export const updateMipa = (id, vertragsende, jwt) =>
  saveObject(CLASS.MIPA, { id, vertragsende }, jwt);

export const fetchRebeByGeo = async (geo, jwt) => {
  const data = await run(wizardQueries.rebeByGeo, { geo }, jwt);
  return data.rebe ?? [];
};

export const fetchMipaByGeo = async (geo, jwt) => {
  const data = await run(wizardQueries.mipaByGeo, { geo }, jwt);
  return data.mipa ?? [];
};

export const fetchDienststellen = async (jwt) => {
  const data = await run(wizardQueries.dienststellen, {}, jwt);
  return data.verwaltende_dienststelle ?? [];
};

export const fetchZusatzRolleArten = async (jwt) => {
  const data = await run(wizardQueries.zusatzRolleArten, {}, jwt);
  return data.zusatz_rolle_art ?? [];
};

// the street WFS is intranet only; adressen.json has the same register
export const fetchStrassennamen = async () => {
  const source = gazDataConfig.sources.find(
    (s) => s.topic === ENDPOINT.ADRESSEN
  );
  const response = await fetch(source.url);
  if (!response.ok) {
    throw new ActionNotSuccessfulError(
      "Die Straßenliste konnte nicht geladen werden."
    );
  }
  const names = new Set((await response.json()).map((entry) => entry.s));
  // the WFS sorts "Zur-Nieden-Weg" as "Zur Nieden Weg"
  const collator = new Intl.Collator("de", { ignorePunctuation: true });
  return [...names].filter(Boolean).sort(collator.compare);
};

export const fetchAdminRows = async (schluesselId, jwt) => {
  const data = await run(
    wizardQueries.adminRowsBySchluesselId,
    { schluesselId },
    jwt
  );
  return data.flurstueck?.[0];
};

export const saveFlurstueckAdmin = (id, changes, jwt) =>
  saveObject(CLASS.FLURSTUECK, { id, ...changes }, jwt);

export const fetchAdminData = async (schluesselId, jwt) => {
  const data = await run(
    wizardQueries.adminDataBySchluesselId,
    { schluesselId },
    jwt
  );
  const row = data.flurstueck?.[0];
  const eintraege = row?.verwaltungsbereiche_eintragArrayRelationShip ?? [];
  return {
    bemerkung: row?.bemerkung ?? "",
    bereiche:
      eintraege[eintraege.length - 1]?.verwaltungsbereichArrayRelationShip ??
      [],
    rollen: row?.zusatz_rolleArrayRelationShip ?? [],
    strassenfronten: row?.strassenfrontArrayRelationShip ?? [],
  };
};
