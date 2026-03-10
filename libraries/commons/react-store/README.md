# react-store

A tiny React-friendly external store helper for local monorepo state.

It provides:
- `createStore(initialState)`
- `useStoreSelector(store, selector)`
- `useStoreValue(store)`

The goal is to keep store usage explicit and small:
- one store object
- stable `getState` / `setState` / `subscribe` API
- React reads through `useSyncExternalStore`

This package is intended for internal monorepo use where a lightweight store is
more appropriate than introducing or coupling to a larger state library.
