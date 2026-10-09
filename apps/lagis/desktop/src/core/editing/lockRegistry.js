import { nanoid } from "@reduxjs/toolkit";

// Every lock the edit session creates is noted here *before* the request goes
// out, so a reload while the server creates it can't make us forget it.
// localStorage because it writes synchronously; redux-persist saves too late.
// Entries: { key, tab, user, classId, objectId, info, id? } (id once known)
const STORAGE_KEY = "@lagis-desktop.1.lockRegistry";
const TAB_KEY = "@lagis-desktop.1.tabId";
const TAB_LOCK_PREFIX = "lagis-desktop-tab-";

// sessionStorage keeps the id across reloads of the same tab
const tabId = (() => {
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id = nanoid();
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch {
    return nanoid();
  }
})();

// held while this tab lives, so other tabs leave its locks alone
navigator.locks?.request(
  `${TAB_LOCK_PREFIX}${tabId}`,
  () => new Promise(() => {})
);

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
};

const update = (change) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(change(read())));
  } catch (error) {
    console.error("Sperrenliste konnte nicht gespeichert werden", error);
  }
};

// returns the key for noteCreated
export const notePending = ({ user, classId, objectId, info }) => {
  const key = nanoid();
  update((entries) => [
    ...entries,
    { key, tab: tabId, user, classId, objectId, info },
  ]);
  return key;
};

export const noteCreated = (key, id) =>
  update((entries) =>
    entries.map((entry) => (entry.key === key ? { ...entry, id } : entry))
  );

// for locks known only by id, e.g. of a session persisted before the registry
export const noteIds = (ids, user) =>
  update((entries) => {
    const known = new Set(entries.map((entry) => entry.id));
    const added = ids
      .filter((id) => !known.has(id))
      .map((id) => ({ key: nanoid(), tab: tabId, user, id }));
    return [...entries, ...added];
  });

export const forget = (keys) => {
  const gone = new Set(keys);
  update((entries) => entries.filter((entry) => !gone.has(entry.key)));
};

// the user's entries from this tab and from tabs that are closed
export const sweepableEntries = async (user) => {
  let alive;
  try {
    const { held } = await navigator.locks.query();
    alive = new Set(held.map((lock) => lock.name));
  } catch {
    // no Web Locks API: treat every tab as this one
  }
  return read().filter(
    (entry) =>
      entry.user === user &&
      (entry.tab === tabId || !alive?.has(`${TAB_LOCK_PREFIX}${entry.tab}`))
  );
};

// the cs_locks row an entry stands for
export const matchesRow = (entry, row) =>
  entry.id !== undefined
    ? Number(row.id) === Number(entry.id)
    : Number(row.class_id) === Number(entry.classId) &&
      Number(row.object_id) === Number(entry.objectId) &&
      row.additional_info === entry.info;
