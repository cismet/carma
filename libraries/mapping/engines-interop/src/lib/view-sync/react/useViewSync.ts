import { useStoreSelector } from "@carma-commons/react-store";
import { useCallback, useContext, useEffect } from "react";
import type {
  ViewSyncPublishOptions,
  ViewSyncRegistration,
  ViewSyncState,
  ViewSyncStore,
  ViewSyncTargetState,
} from "../core/types";
import { ViewSyncStoreContext } from "./ViewSyncStoreContext";

export const useViewSyncStore = (): ViewSyncStore => {
  const store = useContext(ViewSyncStoreContext);
  if (!store) {
    throw new Error("useViewSyncStore must be used within ViewSyncProvider");
  }
  return store;
};

export const useViewSyncSelector = <TSelected>(
  selector: (state: ViewSyncState) => TSelected
): TSelected => {
  const store = useViewSyncStore();
  return useStoreSelector(store, selector);
};

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
  const isController = useViewSyncSelector(
    (state) => state.controllerId === registration.id
  );

  useEffect(
    () => store.registerView(registration),
    [
      store,
      registration.canControl,
      registration.engine,
      registration.id,
      registration.label,
    ]
  );

  const claimControl = useCallback(() => {
    store.setController(registration.id);
  }, [registration.id, store]);

  const releaseControl = useCallback(() => {
    const currentState = store.getState();
    if (currentState.controllerId === registration.id) {
      store.clearController();
    }
  }, [registration.id, store]);

  const publishViewState = useCallback(
    (target: ViewSyncTargetState, options?: ViewSyncPublishOptions) => {
      store.publishViewState(registration.id, target, options);
    },
    [registration.id, store]
  );

  return {
    isController,
    claimControl,
    releaseControl,
    publishViewState,
  };
};
