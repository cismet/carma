import { createElement, useEffect, useMemo, type ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";
import {
  createCesiumSceneStateStore,
  type CesiumSceneStateStore,
} from "./utils/createCesiumSceneStateStore";
import type { SceneLike, SceneStateOptions } from "./types";
import {
  CesiumSceneStateReduxContext,
  CesiumSceneStateStoreContext,
} from "./CesiumSceneStateStoreContext";

type CesiumSceneStateReduxProviderProps = {
  store: CesiumSceneStateStore;
  context: typeof CesiumSceneStateReduxContext;
  children?: ReactNode;
};

const CesiumSceneStateReduxProvider =
  ReduxProvider as unknown as (
    props: CesiumSceneStateReduxProviderProps
  ) => ReactNode;

type SceneStateProviderProps = {
  scene?: SceneLike | null;
  options?: SceneStateOptions;
  children: ReactNode;
};

export const CesiumSceneStateProvider = ({
  scene,
  options,
  children,
}: SceneStateProviderProps) => {
  const fallbackHeightM = options?.fallbackHeightM;
  const orbitPointMode = options?.orbitPointMode;
  const screenCenterSamplingStrategy = options?.screenCenterSamplingStrategy;
  const throwOnMissingScreenCenterIntersection =
    options?.throwOnMissingScreenCenterIntersection;

  const store: CesiumSceneStateStore | null = useMemo(
    () =>
      scene
        ? createCesiumSceneStateStore(scene, {
            fallbackHeightM,
            orbitPointMode,
            screenCenterSamplingStrategy,
            throwOnMissingScreenCenterIntersection,
          })
        : null,
    [
      scene,
      fallbackHeightM,
      orbitPointMode,
      screenCenterSamplingStrategy,
      throwOnMissingScreenCenterIntersection,
    ]
  );

  useEffect(() => {
    return () => {
      store?.destroy();
    };
  }, [store]);

  return (
    <CesiumSceneStateStoreContext.Provider value={store}>
      {store ? (
        createElement(
          CesiumSceneStateReduxProvider,
          {
            context: CesiumSceneStateReduxContext,
            store,
          },
          children
        )
      ) : (
        children
      )}
    </CesiumSceneStateStoreContext.Provider>
  );
};
