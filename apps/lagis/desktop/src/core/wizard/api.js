import { fetchGraphQL } from "../graphql";
import wizardQueries from "./queries";
import { finishCall, startCall } from "./gqlLog";
import { formatKey } from "./keys";

/**
 * Error carrying the message that should be shown to the user, mirroring
 * de.cismet.lagis.Exception.ActionNotSuccessfulException.
 */
export class ActionNotSuccessfulError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "ActionNotSuccessfulError";
    this.cause = cause;
  }
}

/**
 * Runs a document and unwraps it. Every GraphQL call of the wizard goes through
 * here, so a transport error and a GraphQL `errors` payload fail the same way.
 */
export const run = async (query, variables, jwt) => {
  const callId = startCall(query, variables);
  const startedAt = Date.now();

  const fail = (message, response) => {
    finishCall(callId, {
      status: "error",
      ms: Date.now() - startedAt,
      message,
      response,
    });
    return new ActionNotSuccessfulError(message, response);
  };

  let result;
  try {
    result = await fetchGraphQL(query, variables, jwt);
  } catch (e) {
    throw fail("Die Verbindung zum Server ist fehlgeschlagen.", String(e));
  }
  if (result?.status === 401) {
    throw fail("Die Anmeldung ist abgelaufen.", result);
  }
  if (!result?.ok) {
    throw fail(
      `Der Server antwortete mit Status ${result?.status ?? "?"}.`,
      result
    );
  }
  if (result.errors?.length) {
    throw fail(result.errors[0].message, result.errors);
  }

  finishCall(callId, {
    status: "ok",
    ms: Date.now() - startedAt,
    response: result.data,
  });
  return result.data;
};

const nowIso = () => new Date().toISOString();

/** Date-only value, as the historic/valid-until columns are dates. */
export const toDateOnly = (date) => {
  if (!date) {
    return null;
  }
  const d = date instanceof Date ? date : new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
};

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

/* ----------------------------------------------------- Flurstücksschlüssel */

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
  return mapSchluessel(data.flurstueck_schluessel_by_pk);
};

export const insertSchluessel = async (object, jwt) => {
  const data = await run(wizardQueries.insertSchluessel, { object }, jwt);
  return data.insert_flurstueck_schluessel_one.id;
};

export const updateSchluessel = async (id, changes, jwt, accountName) => {
  await run(
    wizardQueries.updateSchluessel,
    {
      id,
      changes: {
        ...changes,
        letzter_bearbeiter: accountName,
        letzte_bearbeitung: nowIso(),
      },
    },
    jwt
  );
};

export const deleteSchluessel = (id, jwt) =>
  run(wizardQueries.deleteSchluessel, { id }, jwt);

/* ---------------------------------------------------------------- Flurstück */

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
  };
};

export const insertFlurstueck = async (object, jwt) => {
  const data = await run(wizardQueries.insertFlurstueck, { object }, jwt);
  return data.insert_flurstueck_one.id;
};

export const updateFlurstueck = (id, changes, jwt) =>
  run(wizardQueries.updateFlurstueck, { id, changes }, jwt);

export const deleteFlurstueck = (id, jwt) =>
  run(wizardQueries.deleteFlurstueck, { id }, jwt);

/* ------------------------------------------------------------------ Historie */

/** Mirrors LagisBroker.existHistoryEntry / hasFlurstueckSucccessors. */
export const fetchSuccessorEdges = async (flurstueckId, jwt) => {
  const data = await run(
    wizardQueries.successorEdges,
    { flurstueckId },
    jwt
  );
  return data.flurstueck_historie ?? [];
};

export const hasSuccessors = async (flurstueckId, jwt) =>
  (await fetchSuccessorEdges(flurstueckId, jwt)).length > 0;

/** Mirrors LagisBroker.createHistoryEdge(vorgaenger, nachfolger). */
export const insertHistoryEdge = async (vorgaengerId, nachfolgerId, jwt) => {
  const data = await run(
    wizardQueries.insertHistoryEdge,
    {
      object: {
        fk_vorgaenger: vorgaengerId,
        fk_nachfolger: nachfolgerId,
      },
    },
    jwt
  );
  return data.insert_flurstueck_historie_one.id;
};

export const deleteHistoryEdge = (id, jwt) =>
  run(wizardQueries.deleteHistoryEdge, { id }, jwt);

/* ------------------------------------------------------------------ Nutzung */

export const fetchNutzungenForFlurstueck = async (flurstueckId, jwt) => {
  const data = await run(
    wizardQueries.nutzungenForFlurstueck,
    { flurstueckId },
    jwt
  );
  return data.nutzung ?? [];
};

export const insertNutzung = async (object, jwt) => {
  const data = await run(wizardQueries.insertNutzung, { object }, jwt);
  return data.insert_nutzung_one.id;
};

export const updateNutzung = (id, changes, jwt) =>
  run(wizardQueries.updateNutzung, { id, changes }, jwt);

export const deleteNutzung = (id, jwt) =>
  run(wizardQueries.deleteNutzung, { id }, jwt);

export const updateNutzungBuchung = (id, changes, jwt) =>
  run(wizardQueries.updateNutzungBuchung, { id, changes }, jwt);

/* ------------------------------------------------------- angehängte Objekte */

export const moveDmsUrl = (id, flurstueckId, jwt) =>
  run(wizardQueries.updateDmsUrlFlurstueck, { id, flurstueckId }, jwt);

export const moveVerwaltungsbereichEintrag = (id, flurstueckId, jwt) =>
  run(
    wizardQueries.updateVerwaltungsbereichEintragFlurstueck,
    { id, flurstueckId },
    jwt
  );

export const moveArVertraege = (fromFlurstueckId, toFlurstueckId, jwt) =>
  run(wizardQueries.moveArVertraege, { fromFlurstueckId, toFlurstueckId }, jwt);

export const moveArBaeume = (fromFlurstueckId, toFlurstueckId, jwt) =>
  run(wizardQueries.moveArBaeume, { fromFlurstueckId, toFlurstueckId }, jwt);

export const updateRebe = (id, datumLoeschung, jwt) =>
  run(wizardQueries.updateRebe, { id, datumLoeschung }, jwt);

export const updateMipa = (id, vertragsende, jwt) =>
  run(wizardQueries.updateMipa, { id, vertragsende }, jwt);

export const fetchRebeByGeo = async (geo, jwt) => {
  const data = await run(wizardQueries.rebeByGeo, { geo }, jwt);
  return data.rebe ?? [];
};

export const fetchMipaByGeo = async (geo, jwt) => {
  const data = await run(wizardQueries.mipaByGeo, { geo }, jwt);
  return data.mipa ?? [];
};
