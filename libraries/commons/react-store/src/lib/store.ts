export type StoreListener = () => void;

export type StoreUpdater<TState> = TState | ((previousState: TState) => TState);

export type ReadonlyStore<TState> = {
  getState: () => TState;
  subscribe: (listener: StoreListener) => () => void;
};

export type Store<TState> = ReadonlyStore<TState> & {
  setState: (updater: StoreUpdater<TState>) => void;
};

const resolveNextState = <TState>(
  currentState: TState,
  updater: StoreUpdater<TState>
): TState => {
  if (typeof updater === "function") {
    return (updater as (previousState: TState) => TState)(currentState);
  }

  return updater;
};

export const createStore = <TState>(initialState: TState): Store<TState> => {
  let currentState = initialState;
  const listeners = new Set<StoreListener>();

  const getState = () => currentState;

  const subscribe = (listener: StoreListener) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  const setState = (updater: StoreUpdater<TState>) => {
    const nextState = resolveNextState(currentState, updater);

    if (Object.is(nextState, currentState)) {
      return;
    }

    currentState = nextState;

    for (const listener of [...listeners]) {
      listener();
    }
  };

  return {
    getState,
    subscribe,
    setState,
  };
};
