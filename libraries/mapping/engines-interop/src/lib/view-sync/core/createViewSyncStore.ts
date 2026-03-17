import { createStore } from "@carma-commons/react-store";
import type {
  ViewSyncPublishedState,
  ViewSyncPublishOptions,
  ViewSyncRegistration,
  ViewSyncSetTargetOptions,
  ViewSyncState,
  ViewSyncStore,
  ViewSyncTargetState,
} from "./types";

const DEFAULT_EXTERNAL_SOURCE_ID = "external";
const DEFAULT_EXTERNAL_SOURCE_ENGINE = "system";

const nowMs = (): number => Date.now();

const canRegistrationControl = (
  registration: ViewSyncRegistration | undefined
): boolean => registration?.canControl !== false;

const findNextControllerId = (
  registrations: Record<string, ViewSyncRegistration>
): string | null => {
  for (const registration of Object.values(registrations)) {
    if (canRegistrationControl(registration)) {
      return registration.id;
    }
  }
  return null;
};

const createPublishedState = ({
  sourceId,
  sourceEngine,
  target,
  timestampMs,
  frameNumber,
}: {
  sourceId: string;
  sourceEngine: string;
  target: ViewSyncTargetState;
  timestampMs?: number;
  frameNumber?: number | null;
}): ViewSyncPublishedState => ({
  sourceId,
  sourceEngine,
  frameNumber: frameNumber ?? null,
  timestampMs: timestampMs ?? nowMs(),
  target,
});

const removeKey = <TValue>(
  value: Record<string, TValue>,
  key: string
): Record<string, TValue> => {
  if (!(key in value)) {
    return value;
  }
  const nextValue = { ...value };
  delete nextValue[key];
  return nextValue;
};

const resolveInitialState = (
  initialState?: Partial<ViewSyncState>
): ViewSyncState => ({
  registrations: initialState?.registrations ?? {},
  latestById: initialState?.latestById ?? {},
  controllerId: initialState?.controllerId ?? null,
  target: initialState?.target ?? null,
});

export const createViewSyncStore = (
  initialState?: Partial<ViewSyncState>
): ViewSyncStore => {
  const store = createStore<ViewSyncState>(resolveInitialState(initialState));

  const registerView = (registration: ViewSyncRegistration) => {
    store.setState((previousState) => ({
      ...previousState,
      registrations: {
        ...previousState.registrations,
        [registration.id]: registration,
      },
    }));

    return () => {
      unregisterView(registration.id);
    };
  };

  const unregisterView = (id: string) => {
    store.setState((previousState) => {
      if (
        !(id in previousState.registrations) &&
        !(id in previousState.latestById)
      ) {
        return previousState;
      }

      const nextRegistrations = removeKey(previousState.registrations, id);
      const nextLatestById = removeKey(previousState.latestById, id);

      let nextControllerId = previousState.controllerId;
      if (previousState.controllerId === id) {
        nextControllerId = findNextControllerId(nextRegistrations);
      }

      let nextTarget = previousState.target;
      if (nextTarget?.sourceId === id) {
        nextTarget = nextControllerId
          ? nextLatestById[nextControllerId] ?? null
          : null;
      }

      return {
        ...previousState,
        registrations: nextRegistrations,
        latestById: nextLatestById,
        controllerId: nextControllerId,
        target: nextTarget,
      };
    });
  };

  const setController = (id: string | null) => {
    store.setState((previousState) => {
      if (id === null) {
        if (previousState.controllerId === null) {
          return previousState;
        }
        return {
          ...previousState,
          controllerId: null,
        };
      }

      const registration = previousState.registrations[id];
      if (!registration || !canRegistrationControl(registration)) {
        return previousState;
      }

      if (previousState.controllerId === id) {
        return previousState;
      }

      return {
        ...previousState,
        controllerId: id,
        target: previousState.latestById[id] ?? previousState.target,
      };
    });
  };

  const clearController = () => {
    setController(null);
  };

  const publishViewState = (
    id: string,
    target: ViewSyncTargetState,
    options: ViewSyncPublishOptions = {}
  ) => {
    store.setState((previousState) => {
      const registration = previousState.registrations[id];
      if (!registration) {
        return previousState;
      }

      const nextPublishedState = createPublishedState({
        sourceId: id,
        sourceEngine: registration.engine,
        target,
        frameNumber: options.frameNumber,
        timestampMs: options.timestampMs,
      });

      const nextLatestById = {
        ...previousState.latestById,
        [id]: nextPublishedState,
      };

      const shouldClaimControl =
        options.claimControl === true ||
        (previousState.controllerId === null &&
          canRegistrationControl(registration));
      const nextControllerId = shouldClaimControl
        ? id
        : previousState.controllerId;

      return {
        ...previousState,
        latestById: nextLatestById,
        controllerId: nextControllerId,
        target:
          nextControllerId === id ? nextPublishedState : previousState.target,
      };
    });
  };

  const setTargetState = (
    target: ViewSyncTargetState,
    options: ViewSyncSetTargetOptions = {}
  ) => {
    store.setState((previousState) => {
      const nextTarget = createPublishedState({
        sourceId: options.sourceId ?? DEFAULT_EXTERNAL_SOURCE_ID,
        sourceEngine: options.sourceEngine ?? DEFAULT_EXTERNAL_SOURCE_ENGINE,
        target,
        frameNumber: options.frameNumber,
        timestampMs: options.timestampMs,
      });

      return {
        ...previousState,
        target: nextTarget,
      };
    });
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    registerView,
    unregisterView,
    setController,
    clearController,
    publishViewState,
    setTargetState,
  };
};
