import { useContext, useMemo, useSyncExternalStore } from "react";
import { deriveView } from "../../../core/derivations";
import type {
  ViewState,
  DerivedView,
  ViewStateContextValue,
} from "../../../core/types";
import { ViewStateContext } from "./ViewStateContext";

export const useViewStateContext = (): ViewStateContextValue => {
  const ctx = useContext(ViewStateContext);
  if (!ctx) {
    throw new Error(
      "useViewState* hooks require a <ViewStateProvider> ancestor."
    );
  }
  return ctx;
};

export const useViewState = (): ViewState | null => {
  const ctx = useViewStateContext();
  return useSyncExternalStore(ctx.subscribe, ctx.getState);
};

export const useViewStateDerived = (): DerivedView | null => {
  const state = useViewState();
  return useMemo(() => (state ? deriveView(state) : null), [state]);
};

export const useViewStateControllerId = (): string | null => {
  const ctx = useViewStateContext();
  return useSyncExternalStore(ctx.subscribe, ctx.getControllerId);
};
