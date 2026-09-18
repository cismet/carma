import {
  LAGIS_DELETE_ENDPOINT,
  LAGIS_SAVE_ENDPOINT,
} from "../../constants/lagis";
import { finishCall, startCall } from "./gqlLog";
import { CidsActionError } from "./errors";

/**
 * Writes through the generic cids actions LAGIS.SaveObject and
 * LAGIS.DeleteObject.
 *
 * The /graphql/LAGIS/execute proxy accepts queries only, so reads and writes
 * take different routes: reads stay GraphQL, writes go here. This is the same
 * mechanism BelIS desktop uses (helper/apiMethods.ts) and the WUNDA portals
 * use for their Discover items, so the request shape below is copied from a
 * path that is already in production.
 *
 * Everything persists through cids rather than straight into the database,
 * which is what keeps the server's permissions, triggers and bean rules in
 * play — the same route the Swing client's bean.persist() took.
 */

const buildTaskParams = (parameters) => {
  const formData = new FormData();
  formData.append(
    "taskparams",
    new Blob([JSON.stringify({ parameters })], { type: "application/json" }),
    "taskparams"
  );
  return formData;
};

const post = async (endpoint, parameters, jwt, logMeta) => {
  const callId = startCall(
    `POST ${endpoint}\n\n${JSON.stringify({ parameters }, null, 2)}`,
    parameters,
    logMeta
  );
  const startedAt = Date.now();

  const fail = (message, detail) => {
    finishCall(callId, {
      status: "error",
      ms: Date.now() - startedAt,
      message,
      response: detail,
    });
    return new CidsActionError(message, detail);
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: buildTaskParams(parameters),
    });
  } catch (e) {
    throw fail("Die Verbindung zum Server ist fehlgeschlagen.", String(e));
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch (e) {
    parsed = text;
  }

  if (response.status === 401) {
    throw fail("Die Anmeldung ist abgelaufen.", parsed);
  }
  if (!response.ok) {
    throw fail(
      `Der Server antwortete mit Status ${response.status}.`,
      parsed ?? text
    );
  }

  // SaveObject answers 200 even when it failed, wrapping the real payload as
  // { contentType, res } with res holding a JSON *string*.
  const value = unwrapCidsResult(parsed);
  if (value && typeof value === "object" && value.Exception) {
    throw fail(`Der Server meldet: ${value.Exception}`, parsed);
  }

  finishCall(callId, {
    status: "ok",
    ms: Date.now() - startedAt,
    response: parsed,
  });
  return value;
};

/** Peels the { contentType, res } envelope and parses the JSON string in res. */
export const unwrapCidsResult = (payload) => {
  let value = payload;
  if (value && typeof value === "object" && "res" in value) {
    value = value.res;
  }
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (e) {
      // not JSON — hand back the text as it came
    }
  }
  return value;
};

/**
 * Creates or updates one object.
 *
 * Leaving `id` out of `data` creates; including it merges onto the existing
 * object, exactly as BelIS does when it saves a partial bean such as
 * `{ id, dokumenteArray }`.
 */
export const saveObject = (className, data, jwt) =>
  post(LAGIS_SAVE_ENDPOINT, { className, data: JSON.stringify(data) }, jwt, {
    kind: "SaveObject",
    operation: className,
  });

export const deleteObject = (className, data, jwt) =>
  post(LAGIS_DELETE_ENDPOINT, { className, data: JSON.stringify(data) }, jwt, {
    kind: "DeleteObject",
    operation: className,
  });

/**
 * Digs the id of a newly created object out of the response.
 *
 * By this point the { contentType, res } envelope is already peeled off, but
 * the id could sit at a couple of depths, so several shapes are tried and
 * anything unrecognised fails loudly with the payload attached — far better
 * than silently carrying an undefined id into the next write, which would
 * attach a Flurstück to nothing.
 */
export const idFromSaveResult = (result, className) => {
  const candidates = [
    result?.id,
    result?.data?.id,
    result?.res?.id,
    result?.result?.id,
    Array.isArray(result) ? result[0]?.id : undefined,
  ];
  const id = candidates.find(
    (value) => typeof value === "number" || typeof value === "string"
  );
  if (id === undefined) {
    throw new CidsActionError(
      `SaveObject(${className}) hat keine id zurückgeliefert. ` +
        "Die Antwort des Servers steht in den Details.",
      result
    );
  }
  return typeof id === "string" ? Number(id) : id;
};

export const saveAndGetId = async (className, data, jwt) =>
  idFromSaveResult(await saveObject(className, data, jwt), className);
