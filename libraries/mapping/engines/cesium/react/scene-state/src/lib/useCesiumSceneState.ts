import { useContext, useEffect, useState } from "react";
import type { CesiumSceneStateStore } from "./utils/createCesiumSceneStateStore";
import type { SceneState } from "./types";
import { CesiumSceneStateStoreContext } from "./CesiumSceneStateStoreContext";

const readSceneSnapshot = (store: CesiumSceneStateStore): SceneState | null =>
  store.getSnapshot();

const readSceneError = (store: CesiumSceneStateStore): Error | null =>
  store.getError();

const useOptionalStoreValue = <TValue>(
  readValue: (store: CesiumSceneStateStore) => TValue,
  emptyValue: TValue
): TValue => {
  const store = useContext(CesiumSceneStateStoreContext);
  const [value, setValue] = useState<TValue>(() =>
    store ? readValue(store) : emptyValue
  );

  useEffect(() => {
    if (!store) {
      setValue(emptyValue);
      return;
    }

    setValue(readValue(store));
    return store.subscribe(() => {
      setValue(readValue(store));
    });
  }, [emptyValue, readValue, store]);

  return value;
};

export const useCesiumSceneStateStoreOptional =
  (): CesiumSceneStateStore | null => {
    return useContext(CesiumSceneStateStoreContext);
  };

export const useCesiumSceneStateStore = (): CesiumSceneStateStore => {
  const store = useCesiumSceneStateStoreOptional();
  if (!store) {
    throw new Error(
      "useCesiumSceneStateStore must be used within CesiumSceneStateProvider"
    );
  }
  return store;
};

export const useCesiumSceneState = (): SceneState | null => {
  useCesiumSceneStateStore();
  return useOptionalStoreValue(readSceneSnapshot, null);
};

export const useCesiumSceneStateOptional = (): SceneState | null => {
  return useOptionalStoreValue(readSceneSnapshot, null);
};

export const useCesiumSceneStateErrorOptional = (): Error | null => {
  return useOptionalStoreValue(readSceneError, null);
};
