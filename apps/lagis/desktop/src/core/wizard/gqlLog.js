const MAX_ENTRIES = 60;

let entries = [];
let nextId = 1;
let enabled = true;
const listeners = new Set();

const emit = () => {
  for (const listener of listeners) {
    listener(entries);
  }
};

/** "mutation InsertSchluessel(...)" -> "InsertSchluessel" */
const operationNameOf = (query) => {
  const named = /\b(?:query|mutation)\s+([A-Za-z_][\w]*)/.exec(query);
  if (named) {
    return named[1];
  }
  const firstField = /{\s*([A-Za-z_][\w]*)/.exec(query);
  return firstField ? firstField[1] : "(anonym)";
};

const kindOf = (query) => (/^\s*mutation\b/.test(query) ? "mutation" : "query");

/**
 * Turns recording on or off. While off nothing is kept, so switching the panel
 * off also stops the documents and responses piling up in memory.
 */
export const setLoggingEnabled = (value) => {
  enabled = value;
  if (!value && entries.length > 0) {
    entries = [];
    emit();
  }
};

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getEntries = () => entries;

export const clearLog = () => {
  entries = [];
  emit();
};

/**
 * @param {string} query   the document, or for a cids action the request body
 * @param {unknown} variables
 * @param {{kind?: string, operation?: string}} [meta] overrides for calls that
 *   are not GraphQL — SaveObject and DeleteObject name their class instead
 */
export const startCall = (query, variables, meta) => {
  if (!enabled) {
    return undefined;
  }
  const entry = {
    id: nextId++,
    at: new Date(),
    kind: meta?.kind ?? kindOf(query),
    operation: meta?.operation ?? operationNameOf(query),
    query,
    variables,
    status: "pending",
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
  return entry.id;
};

export const finishCall = (id, changes) => {
  if (id === undefined) {
    return;
  }
  entries = entries.map((entry) =>
    entry.id === id ? { ...entry, ...changes } : entry
  );
  emit();
};
