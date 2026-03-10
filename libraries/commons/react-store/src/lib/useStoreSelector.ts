import { useSyncExternalStore } from "react";

import type { ReadonlyStore } from "./store";

const identity = <TValue>(value: TValue) => value;

export const useStoreSelector = <TState, TSelected>(
  store: ReadonlyStore<TState>,
  selector: (state: TState) => TSelected
): TSelected =>
  useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );

export const useStoreValue = <TState>(store: ReadonlyStore<TState>): TState =>
  useStoreSelector(store, identity);
