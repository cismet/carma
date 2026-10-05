// GraphQL writes aren't transactional: undo them in reverse on failure.
export const createJournal = () => {
  const entries = [];

  return {
    record(description, undo) {
      entries.push({ description, undo });
    },

    get size() {
      return entries.length;
    },

    commit() {
      entries.length = 0;
    },

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
