import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type {
  ViewState,
  ViewSyncPublishedState,
  ViewSyncPublishOptions,
  ViewSyncRegistration,
  ViewSyncSetTargetOptions,
  ViewSyncState,
  ViewSyncStore,
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
  target: ViewState;
  timestampMs?: number;
  frameNumber?: number | null;
}): ViewSyncPublishedState => ({
  sourceId,
  sourceEngine,
  frameNumber: frameNumber ?? null,
  timestampMs: timestampMs ?? nowMs(),
  target,
});

const resolveInitialState = (
  initialState?: Partial<ViewSyncState>
): ViewSyncState => ({
  registrations: initialState?.registrations ?? {},
  latestById: initialState?.latestById ?? {},
  controllerId: initialState?.controllerId ?? null,
  target: initialState?.target ?? null,
});

type PublishViewStatePayload = {
  id: string;
  target: ViewState;
  options?: ViewSyncPublishOptions;
};

type SetTargetStatePayload = {
  target: ViewState;
  options?: ViewSyncSetTargetOptions;
};

const viewSyncSlice = createSlice({
  name: "viewSync",
  initialState: resolveInitialState(),
  reducers: {
    registerView: (state, action: PayloadAction<ViewSyncRegistration>) => {
      state.registrations[action.payload.id] = action.payload;
    },
    unregisterView: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      if (!(id in state.registrations) && !(id in state.latestById)) {
        return;
      }

      delete state.registrations[id];
      delete state.latestById[id];

      if (state.controllerId === id) {
        state.controllerId = findNextControllerId(state.registrations);
      }

      if (state.target?.sourceId === id) {
        state.target = state.controllerId
          ? state.latestById[state.controllerId] ?? null
          : null;
      }
    },
    setController: (state, action: PayloadAction<string | null>) => {
      const id = action.payload;
      if (id === null) {
        if (state.controllerId === null) {
          return;
        }
        state.controllerId = null;
        return;
      }

      const registration = state.registrations[id];
      if (!registration || !canRegistrationControl(registration)) {
        return;
      }

      if (state.controllerId === id) {
        return;
      }

      state.controllerId = id;
      state.target = state.latestById[id] ?? state.target;
    },
    publishViewState: (state, action: PayloadAction<PublishViewStatePayload>) => {
      const { id, target, options } = action.payload;
      const registration = state.registrations[id];
      if (!registration) {
        return;
      }

      const nextPublishedState = createPublishedState({
        sourceId: id,
        sourceEngine: registration.engine,
        target,
        frameNumber: options?.frameNumber,
        timestampMs: options?.timestampMs,
      });

      state.latestById[id] = nextPublishedState;

      const shouldClaimControl =
        options?.claimControl === true ||
        (state.controllerId === null && canRegistrationControl(registration));
      const nextControllerId = shouldClaimControl ? id : state.controllerId;

      state.controllerId = nextControllerId;
      if (nextControllerId === id) {
        state.target = nextPublishedState;
      }
    },
    setTargetState: (state, action: PayloadAction<SetTargetStatePayload>) => {
      const { target, options } = action.payload;

      state.target = createPublishedState({
        sourceId: options?.sourceId ?? DEFAULT_EXTERNAL_SOURCE_ID,
        sourceEngine: options?.sourceEngine ?? DEFAULT_EXTERNAL_SOURCE_ENGINE,
        target,
        frameNumber: options?.frameNumber,
        timestampMs: options?.timestampMs,
      });
    },
  },
});

const {
  registerView: registerViewAction,
  unregisterView: unregisterViewAction,
  setController: setControllerAction,
  publishViewState: publishViewStateAction,
  setTargetState: setTargetStateAction,
} = viewSyncSlice.actions;

export const createViewSyncStore = (
  initialState?: Partial<ViewSyncState>
): ViewSyncStore => {
  const reduxStore = configureStore({
    reducer: viewSyncSlice.reducer,
    preloadedState: resolveInitialState(initialState),
  });

  const registerView = (registration: ViewSyncRegistration) => {
    reduxStore.dispatch(registerViewAction(registration));

    return () => {
      unregisterView(registration.id);
    };
  };

  const unregisterView = (id: string) => {
    reduxStore.dispatch(unregisterViewAction(id));
  };

  const setController = (id: string | null) => {
    reduxStore.dispatch(setControllerAction(id));
  };

  const clearController = () => {
    setController(null);
  };

  const publishViewState = (
    id: string,
    target: ViewState,
    options: ViewSyncPublishOptions = {}
  ) => {
    reduxStore.dispatch(publishViewStateAction({ id, target, options }));
  };

  const setTargetState = (
    target: ViewState,
    options: ViewSyncSetTargetOptions = {}
  ) => {
    reduxStore.dispatch(setTargetStateAction({ target, options }));
  };

  return Object.assign(reduxStore, {
    registerView,
    unregisterView,
    setController,
    clearController,
    publishViewState,
    setTargetState,
  });
};
