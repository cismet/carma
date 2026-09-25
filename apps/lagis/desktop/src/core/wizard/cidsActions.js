import {
  LAGIS_CLASSES_ENDPOINT,
  LAGIS_DELETE_ENDPOINT,
  LAGIS_SAVE_ENDPOINT,
} from "../../constants/lagis";
import { finishCall, startCall } from "./gqlLog";
import { CidsActionError } from "./errors";

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

let classIdCache;

/**
 * The cids class id a `cs_locks` row needs in `class_id`.
 */
export const fetchClassId = async (tableName, jwt) => {
  if (!classIdCache) {
    const callId = startCall(`GET ${LAGIS_CLASSES_ENDPOINT}`, undefined, {
      kind: "REST",
      operation: "classes",
    });
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
      response = await fetch(LAGIS_CLASSES_ENDPOINT, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch (e) {
      throw fail("Die Verbindung zum Server ist fehlgeschlagen.", String(e));
    }
    if (!response.ok) {
      throw fail(
        `Die Klassenliste konnte nicht geladen werden (Status ${response.status}).`
      );
    }
    const payload = await response.json();
    const classes = payload?.$collection ?? [];
    classIdCache = {};
    for (const entry of classes) {
      const { NAME, LEGACY_ID } = entry.configuration ?? {};
      if (NAME && LEGACY_ID !== undefined) {
        classIdCache[NAME] = LEGACY_ID;
      }
    }
    finishCall(callId, {
      status: "ok",
      ms: Date.now() - startedAt,
      response: classIdCache,
    });
  }

  const classId = classIdCache[tableName];
  if (classId === undefined) {
    throw new CidsActionError(
      `Die Klasse ${tableName} konnte auf dem Server nicht gefunden werden.`
    );
  }
  return classId;
};
