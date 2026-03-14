import { useEffect, useMemo, type ReactNode } from "react";
import {
  createCesiumSceneStateStore,
  type CesiumSceneStateStore,
} from "./createCesiumSceneStateStore";
import type { CesiumSceneLike, CesiumSceneStateOptions } from "./types";
import { CesiumSceneStateStoreContext } from "./CesiumSceneStateStoreContext";

type CesiumSceneStateProviderProps = {
  scene?: CesiumSceneLike | null;
  options?: CesiumSceneStateOptions;
  children: ReactNode;
};

export const CesiumSceneStateProvider = ({
  scene,
  options,
  children,
}: CesiumSceneStateProviderProps) => {
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
      {children}
    </CesiumSceneStateStoreContext.Provider>
  );
};
