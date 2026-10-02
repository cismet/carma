const MAX_ENTRIES = 60;

let entries = [];
let nextId = 1;
let enabled = true;
const listeners = new Set();
// fed even with logging off: drives the save progress
const requestListeners = new Set();

const emit = () => {
  for (const listener of listeners) {
    listener(entries);
  }
};

const operationNameOf = (query) => {
  const named = /\b(?:query|mutation)\s+([A-Za-z_][\w]*)/.exec(query);
  if (named) {
    return named[1];
  }
  const firstField = /{\s*([A-Za-z_][\w]*)/.exec(query);
  return firstField ? firstField[1] : "(anonym)";
};

const kindOf = (query) => (/^\s*mutation\b/.test(query) ? "mutation" : "query");

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

export const onRequest = (listener) => {
  requestListeners.add(listener);
  return () => requestListeners.delete(listener);
};

export const getEntries = () => entries;

export const clearLog = () => {
  entries = [];
  emit();
};

export const startCall = (query, variables, meta) => {
  for (const listener of requestListeners) {
    listener({
      kind: meta?.kind ?? kindOf(query),
      operation: meta?.operation ?? operationNameOf(query),
    });
  }
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
