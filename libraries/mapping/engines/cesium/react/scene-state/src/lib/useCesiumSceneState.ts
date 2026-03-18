import { useContext, useSyncExternalStore } from "react";
import type { CesiumSceneStateStore } from "./utils/createCesiumSceneStateStore";
import type { SceneState } from "./types";
import { CesiumSceneStateStoreContext } from "./CesiumSceneStateStoreContext";

const nullSubscribe = () => () => undefined;
const nullSnapshot = () => null;

export const useCesiumSceneStateStore = (): CesiumSceneStateStore => {
  const store = useContext(CesiumSceneStateStoreContext);
  if (!store) {
    throw new Error(
      "useCesiumSceneStateStore must be used within CesiumSceneStateProvider"
    );
  }
  return store;
};

export const useCesiumSceneState = (): SceneState | null => {
  const store = useCesiumSceneStateStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
};

export const useCesiumSceneStateOptional = (): SceneState | null => {
  const store = useContext(CesiumSceneStateStoreContext);
  const subscribe = store?.subscribe ?? nullSubscribe;
  const getSnapshot = store?.getSnapshot ?? nullSnapshot;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useCesiumSceneStateErrorOptional = (): Error | null => {
  const store = useContext(CesiumSceneStateStoreContext);
  const subscribe = store?.subscribe ?? nullSubscribe;
  const getSnapshot = store?.getError ?? nullSnapshot;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
