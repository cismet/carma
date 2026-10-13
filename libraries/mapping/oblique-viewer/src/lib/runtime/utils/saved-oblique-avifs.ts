import { useSyncExternalStore } from "react";

export type SavedObliqueAvif = {
  id: string;
  sourceId: string;
  name: string;
  input: Blob | string;
  savedAt: number;
};
const DATABASE = "carma-local-oblique-avifs";
const STORE = "images";
let saved: readonly SavedObliqueAvif[] = [];
let database: Promise<IDBDatabase> | undefined;
let restoring: Promise<void> | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const snapshot = () => saved;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const useSavedObliqueAvifs = () =>
  useSyncExternalStore(subscribe, snapshot, snapshot);
const open = () => {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        Error(
          "Der lokale Bildspeicher ist durch eine andere Sitzung blockiert."
        )
      );
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
};
/** Restore catalogue descriptors only; reopening a photo is an explicit action. */
export const restoreSavedObliqueAvifs = () => {
  restoring ??= (async () => {
    if (typeof indexedDB === "undefined") return;
    const db = await open();
    const records = await new Promise<SavedObliqueAvif[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
    const valid = records.filter(
      (record) =>
        typeof record.id === "string" &&
        record.id.startsWith("adhoc-avif-") &&
        typeof record.sourceId === "string" &&
        typeof record.name === "string" &&
        (record.input instanceof Blob || typeof record.input === "string")
    );
    saved = [
      ...saved,
      ...valid.filter(
        (record) => !saved.some((current) => current.id === record.id)
      ),
    ];
    notify();
  })().catch((error) => {
    restoring = undefined;
    throw error;
  });
  return restoring;
};
/** Store the original Blob via structured clone, never base64 in localStorage. */
export const saveObliqueAvif = async (record: SavedObliqueAvif) => {
  saved = [...saved.filter((current) => current.id !== record.id), record];
  notify();
  if (typeof indexedDB === "undefined")
    throw Error("Lokaler Bildspeicher ist hier nicht verfügbar.");
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        tx.error ?? Error("Das Bild konnte nicht lokal gespeichert werden.")
      );
  });
};
