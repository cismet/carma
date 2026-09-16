/**
 * The Swing wizard ran inside a cids transaction, so a failing step rolled the
 * whole action back. Over GraphQL there is no such boundary: every mutation is
 * committed on its own. This journal is the replacement — each write registers
 * how to undo itself, and a failure unwinds them in reverse order.
 *
 * It is a compensation, not a rollback: an undo can itself fail (for instance
 * when another user has meanwhile touched the row). Those failures are
 * collected and reported, never swallowed, so the user learns that data may
 * have been left half-changed.
 */
export const createJournal = () => {
  const entries = [];

  return {
    /**
     * @param {string} description shown to the user if the undo fails
     * @param {() => Promise<unknown>} undo
     */
    record(description, undo) {
      entries.push({ description, undo });
    },

    get size() {
      return entries.length;
    },

    /** Forget everything — called once an action has completed successfully. */
    commit() {
      entries.length = 0;
    },

    /**
     * Undoes recorded writes, newest first.
     * @returns {Promise<string[]>} descriptions of the undos that failed
     */
    async rollback() {
      const failed = [];
      while (entries.length > 0) {
        const entry = entries.pop();
        try {
          await entry.undo();
        } catch (e) {
          console.error("Rücknahme fehlgeschlagen:", entry.description, e);
          failed.push(entry.description);
        }
      }
      return failed;
    },
  };
};

/**
 * Turns failed compensations into the sentence the user sees underneath the
 * actual error.
 */
export const describeRollbackFailures = (failed) => {
  if (!failed.length) {
    return "Alle bereits durchgeführten Änderungen wurden zurückgenommen.";
  }
  return (
    "Achtung: Die folgenden Änderungen konnten nicht zurückgenommen werden " +
    "und müssen von Hand geprüft werden:\n" +
    failed.map((entry) => `• ${entry}`).join("\n")
  );
};
