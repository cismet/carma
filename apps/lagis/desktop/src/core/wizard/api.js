import { fetchGraphQL, fetchGraphQLFromWuNDa } from "../graphql";
import wizardQueries from "./queries";
import { finishCall, startCall } from "./gqlLog";
import { deleteObject, saveObject, saveAndGetId } from "./cidsActions";
import { ActionNotSuccessfulError } from "./errors";
import { formatKey } from "./keys";

export { ActionNotSuccessfulError, CidsActionError } from "./errors";

/**
 * Runs a document and unwraps it. Every GraphQL call of the wizard goes through
 * here, so a transport error and a GraphQL `errors` payload fail the same way.
 */
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

/** The WuNDa endpoint, which carries ALKIS. */
export const runWuNDa = (query, variables, jwt) =>
  execute(fetchGraphQLFromWuNDa, query, variables, jwt);

/** cids class names, i.e. the database table each write targets. */
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

/**
 * cids parses dates with a Java DateFormat that wants exactly
 * `YYYY-MM-DDTHH:mm:ss` — no timezone, no milliseconds. A bare `2026-09-17`
 * and an ISO string ending in `Z` both come back as
 * `{"Exception": "Unparseable date: ..."}`. Same format BelIS sends from
 * transformDatesForBackend.
 */
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

/** LagisBroker writes java.util.Date, so the clock time is part of the value. */
export const toTimestamp = (date) => (date ? formatCidsDate(date, true) : null);

const nowIso = () => toTimestamp(new Date());

/* ------------------------------------------------------------ Stammdaten */

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

/* Flurstücksschlüssel */

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
        datumEntstehung: row.datum_entstehung,
        datumLetzterStadtbesitz: row.datum_letzter_stadtbesitz,
      }
    : undefined;

/** Mirrors FlurstueckSchluesselCustomBean.createNewByFsKey. */
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

/* Flurstück */

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

/**
 * Moves the contract and tree links by writing the array properties, the way
 * renameFlurstueck did it in Java (addAll on the new bean, clear on the old).
 * cids persists an array property as a whole, so each side is one call.
 */
export const saveFlurstueckArrays = (id, arrays, jwt) =>
  saveObject(CLASS.FLURSTUECK, { id, ...arrays }, jwt);

/* Historie */

/** Mirrors LagisBroker.existHistoryEntry / hasFlurstueckSucccessors. */
export const fetchSuccessorEdges = async (flurstueckId, jwt) => {
  const data = await run(wizardQueries.successorEdges, { flurstueckId }, jwt);
  return data.flurstueck_historie ?? [];
};

export const hasSuccessors = async (flurstueckId, jwt) =>
  (await fetchSuccessorEdges(flurstueckId, jwt)).length > 0;

/** Mirrors LagisBroker.createHistoryEdge(vorgaenger, nachfolger). */
export const insertHistoryEdge = (vorgaengerId, nachfolgerId, jwt) =>
  saveAndGetId(
    CLASS.HISTORIE,
    { fk_vorgaenger: vorgaengerId, fk_nachfolger: nachfolgerId },
    jwt
  );

export const deleteHistoryEdge = (id, jwt) =>
  deleteObject(CLASS.HISTORIE, { id }, jwt);

/* Nutzung */

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

/* angehängte Objekte */

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
