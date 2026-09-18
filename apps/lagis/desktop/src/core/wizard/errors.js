export class ActionNotSuccessfulError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "ActionNotSuccessfulError";
    this.cause = cause;
  }
}

/**
 * A failed SaveObject/DeleteObject call. Extends the above so the server's
 * message reaches the user instead of being flattened into "Unbekannter
 * Fehler".
 */
export class CidsActionError extends ActionNotSuccessfulError {
  constructor(message, detail) {
    super(message, detail);
    this.name = "CidsActionError";
    this.detail = detail;
  }
}

export const explain = (context, error) => {
  console.error(`[wizard] ${context}`, error);
  return `${context}.`;
};
