import { useContext, useMemo, useSyncExternalStore } from "react";
import type {
  ViewState,
  ViewStateNavigationCommitEvent,
  ViewStateNavigationHistoryView,
  ViewStateNavigationManagerContextValue,
} from "../../../core/types";
import { ViewStateNavigationManagerContext } from "./ViewStateNavigationManagerContext";

const useViewStateNavigationManagerContext =
  (): ViewStateNavigationManagerContextValue => {
    const ctx = useContext(ViewStateNavigationManagerContext);
    if (!ctx) {
      throw new Error(
        "useViewStateNavigationManager requires a <ViewStateNavigationManagerProvider> ancestor."
      );
    }
    return ctx;
  };

export type UseViewStateNavigationManagerResult = {
  initialRestoreState: ViewState | null;
  isInitialRestoreResolved: boolean;
  latestCommittedState: ViewState | null;
  latestCommitEvent: ViewStateNavigationCommitEvent | null;
  commitCurrentState: ViewStateNavigationManagerContextValue["commitCurrentState"];
  suspendHashWrites: ViewStateNavigationManagerContextValue["suspendHashWrites"];
  registerOnCommit: ViewStateNavigationManagerContextValue["registerOnCommit"];
  getHistory: () => ViewStateNavigationHistoryView;
};

export const useViewStateNavigationManager =
  (): UseViewStateNavigationManagerResult => {
    const ctx = useViewStateNavigationManagerContext();
    const latestCommitEvent = useSyncExternalStore(
      ctx.subscribe,
      ctx.getLatestCommitEvent
    );
    const initialRestoreState = ctx.getInitialRestoreState();
    const isInitialRestoreResolved = ctx.isInitialRestoreResolved();
    const latestCommittedState =
      latestCommitEvent?.state ?? ctx.getLatestCommittedState();

    return useMemo(
      () => ({
        initialRestoreState,
        isInitialRestoreResolved,
        latestCommittedState,
        latestCommitEvent,
        commitCurrentState: ctx.commitCurrentState,
        suspendHashWrites: ctx.suspendHashWrites,
        registerOnCommit: ctx.registerOnCommit,
        getHistory: ctx.getHistory,
      }),
      [
        ctx,
        initialRestoreState,
        isInitialRestoreResolved,
        latestCommitEvent,
        latestCommittedState,
      ]
    );
  };
