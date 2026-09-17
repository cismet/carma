/**
 * The wizard's error types.
 *
 * They live in their own module because both api.js and cidsActions.js need
 * them and import each other's helpers otherwise — a cycle.
 */

/**
 * Carries the message that should be shown to the user, mirroring
 * de.cismet.lagis.Exception.ActionNotSuccessfulException.
 *
 * runWizardAction only forwards the message of errors of this type; anything
 * else is reported as an unknown error. So every failure the user is meant to
 * read has to be one of these.
 */
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
