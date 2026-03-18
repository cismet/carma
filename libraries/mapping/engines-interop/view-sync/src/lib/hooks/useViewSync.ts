import {
  useCallback,
  useEffect,
} from "react";
import type {
  ViewState,
  ViewSyncPublishOptions,
  ViewSyncRegistration,
  ViewSyncState,
  ViewSyncStore,
} from "../core/types";
import {
  useViewSyncReduxSelector,
  useViewSyncStoreContextOptional,
} from "./ViewSyncStoreContext";

export const useViewSyncStore = (): ViewSyncStore => {
  const store = useViewSyncStoreContextOptional();
  if (!store) {
    throw new Error("useViewSyncStore must be used within ViewSyncProvider");
  }
  return store;
};

export const useViewSyncSelector = <TSelected>(
  selector: (state: ViewSyncState) => TSelected
): TSelected => useViewSyncReduxSelector(selector);

export const useViewSyncState = (): ViewSyncState =>
  useViewSyncSelector((state) => state);

export const useViewSyncTargetState = () =>
  useViewSyncSelector((state) => state.target);

export const useViewSyncControllerId = () =>
  useViewSyncSelector((state) => state.controllerId);

export const useRegisterViewSyncParticipant = (
  registration: ViewSyncRegistration
) => {
  const store = useViewSyncStore();
  const { canControl, engine, id, label } = registration;

  const isController = useViewSyncSelector(
    (state) => state.controllerId === id
  );

  useEffect(
    () =>
      store.registerView({
        canControl,
        engine,
        id,
        label,
      }),
    [canControl, engine, id, label, store]
  );

  const claimControl = useCallback(() => {
    store.setController(id);
  }, [id, store]);

  const releaseControl = useCallback(() => {
    const currentState = store.getState();
    if (currentState.controllerId === id) {
      store.clearController();
    }
  }, [id, store]);

  const publishViewState = useCallback(
    (target: ViewState, options?: ViewSyncPublishOptions) => {
      store.publishViewState(id, target, options);
    },
    [id, store]
  );

  return {
    isController,
    claimControl,
    releaseControl,
    publishViewState,
  };
};
