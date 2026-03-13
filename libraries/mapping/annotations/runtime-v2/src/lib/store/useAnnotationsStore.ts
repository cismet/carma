import { useDispatch, useSelector, useStore } from "react-redux";

import type { AnnotationsStoreState } from "./annotationsStore.types";
import type { AnnotationsStore } from "./createAnnotationsStore";

export const useAnnotationsStore = (hookName: string): AnnotationsStore => {
  const store = useStore() as AnnotationsStore;

  if (!store) {
    throw new Error(`${hookName} must be used within a AnnotationsProvider`);
  }

  return store;
};

export const useAnnotationsSelector = <TSelected>(
  selector: (state: AnnotationsStoreState) => TSelected
) => useSelector(selector);

export const useAnnotationsDispatch = () =>
  useDispatch<AnnotationsStore["dispatch"]>();
