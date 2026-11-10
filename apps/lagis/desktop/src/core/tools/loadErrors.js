export const LOAD_ERROR = {
  CONNECTION: "connection",
  SERVER: "server",
  NOT_FOUND: "notFound",
  NOT_FOUND_AT_POINT: "notFoundAtPoint",
  NO_GEOMETRY: "noGeometry",
  UNKNOWN: "unknown",
};

export const LOAD_ERROR_MESSAGES = {
  [LOAD_ERROR.CONNECTION]: {
    headline: "Verbindungsprobleme",
    text: "Flurstücksdaten konnten nicht geladen werden.",
  },
  [LOAD_ERROR.SERVER]: {
    headline: "Serverfehler",
    text: "Der Server hat einen Fehler gemeldet.",
  },
  [LOAD_ERROR.NOT_FOUND]: {
    headline: "Flurstück nicht gefunden",
    text: "Zu diesem Flurstück gibt es keine Daten.",
  },
  [LOAD_ERROR.NOT_FOUND_AT_POINT]: {
    headline: "Kein Flurstück gefunden",
    text: "An dieser Stelle liegt kein Flurstück.",
  },
  [LOAD_ERROR.NO_GEOMETRY]: {
    headline: "Keine Geometrie",
    text: "Das Flurstück hat keine Geometrie.",
  },
  [LOAD_ERROR.UNKNOWN]: {
    headline: "Fehler",
    text: "Flurstücksdaten konnten nicht geladen werden.",
  },
};

export class LandparcelLoadError extends Error {
  constructor(kind, message = kind) {
    super(message);
    this.kind = kind;
  }
}

// fetchGraphQL resolves with ok: false on HTTP errors and passes GraphQL
// errors through in the body, so both must be checked explicitly.
export const assertGraphQLResult = (result) => {
  if (!result?.ok) {
    throw new LandparcelLoadError(LOAD_ERROR.SERVER, `HTTP ${result?.status}`);
  }
  if (result.errors?.length) {
    throw new LandparcelLoadError(LOAD_ERROR.SERVER, result.errors[0].message);
  }
};

export const getLoadErrorKind = (error) => {
  if (error instanceof LandparcelLoadError) {
    return error.kind;
  }
  if (error?.isNetworkError) {
    return LOAD_ERROR.CONNECTION;
  }
  return LOAD_ERROR.UNKNOWN;
};
