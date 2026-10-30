import localforage from "localforage";
import type { LockTarget } from "./types";

export interface DraftRecord<T = unknown> {
  target: LockTarget;
  user: string;
  lockIds: number[];
  client: string;
  savedAt: string;
  payload: T;
}

export interface DraftStore {
  load<T>(user: string, target: LockTarget): Promise<DraftRecord<T> | null>;
  save(record: DraftRecord): Promise<void>;
  remove(user: string, target: LockTarget): Promise<void>;
}

const keyOf = (user: string, { type, id }: LockTarget) =>
  `${user}|${type}|${String(id)}`;

export const createDraftStore = (app: string): DraftStore => {
  const store = localforage.createInstance({
    name: "carma-locking",
    storeName: app.replace(/[^a-z0-9_]/gi, "_"),
  });
  return {
    load: (user, target) => store.getItem(keyOf(user, target)),
    save: async (record) => {
      await store.setItem(keyOf(record.user, record.target), record);
    },
    remove: (user, target) => store.removeItem(keyOf(user, target)),
  };
};
