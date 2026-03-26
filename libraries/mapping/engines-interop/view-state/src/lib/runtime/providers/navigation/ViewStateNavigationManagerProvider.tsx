import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  HASH_CLEAR_KEY_SET,
  type HashClearKeySetId,
  useHashState,
} from "@carma-providers/hash-state";
import type {
  ViewState,
  ViewStateHashCodec,
  ViewStateHashValues,
  ViewStateNavigationCommitEvent,
  ViewStateNavigationHistoryView,
  ViewStateNavigationManagerContextValue,
} from "../../../core/types";
import { ViewStateContext } from "../view-state/ViewStateContext";
import { ViewStateNavigationManagerContext } from "./ViewStateNavigationManagerContext";
import {
  appendViewStateNavigationHistoryEntry,
  createViewStateNavigationHistoryBuffer,
  readViewStateNavigationHistory,
} from "./viewStateNavigationHistory";

const DEFAULT_HASH_LABEL = "ViewStateNavigationManager";
const DEFAULT_MIN_COMMIT_INTERVAL_MS = 100;
const DEFAULT_CLEAR_KEY_SET_IDS: readonly HashClearKeySetId[] = [
  HASH_CLEAR_KEY_SET.SCENE_VIEW_STATE,
];

const serializeHashValues = (values: ViewStateHashValues): string =>
  JSON.stringify(
    Object.keys(values)
      .sort()
      .map((key) => [key, values[key]])
  );

type ViewStateNavigationManagerProviderProps = {
  children: ReactNode;
  codec: ViewStateHashCodec;
  label?: string;
  replace?: boolean;
  clearKeys?: readonly string[];
  clearKeySetIds?: readonly HashClearKeySetId[];
  historyMaxEntries?: number;
  minCommitIntervalMs?: number;
  isHashWriteEnabled?: () => boolean;
};

export const ViewStateNavigationManagerProvider = ({
  children,
  codec,
  label = DEFAULT_HASH_LABEL,
  replace = true,
  clearKeys,
  clearKeySetIds,
  historyMaxEntries,
  minCommitIntervalMs = DEFAULT_MIN_COMMIT_INTERVAL_MS,
  isHashWriteEnabled,
}: ViewStateNavigationManagerProviderProps) => {
  const viewStateContext = useContext(ViewStateContext);
  if (!viewStateContext) {
    throw new Error(
      "ViewStateNavigationManagerProvider requires a <ViewStateProvider> ancestor."
    );
  }

  const { getHashValues, updateHash } = useHashState();

  const listenersRef = useRef<Set<() => void>>(new Set());
  const commitListenersRef = useRef<
    Set<(event: ViewStateNavigationCommitEvent) => void>
  >(new Set());
  const historyRef = useRef(
    createViewStateNavigationHistoryBuffer(historyMaxEntries)
  );
  const latestCommittedStateRef = useRef<ViewState | null>(null);
  const latestCommitEventRef = useRef<ViewStateNavigationCommitEvent | null>(
    null
  );
  const lastCommitSignatureRef = useRef<string | null>(null);
  const lastCommitReplaceRef = useRef<boolean>(replace);
  const lastCommitTimestampRef = useRef(0);
  const sequenceIdRef = useRef(0);
  const hashWriteSuspensionCountRef = useRef(0);
  const initialRestoreStateRef = useRef<ViewState | null>(null);
  const initialRestoreResolvedRef = useRef(false);

  if (!initialRestoreResolvedRef.current) {
    initialRestoreStateRef.current = codec.decode(getHashValues());
    initialRestoreResolvedRef.current = true;
  }

  const resolvedClearKeys = useMemo(
    () => [...new Set((clearKeys ?? []).filter((key) => key.length > 0))],
    [clearKeys]
  );
  const resolvedClearKeySetIds = useMemo(
    () => [...(clearKeySetIds ?? DEFAULT_CLEAR_KEY_SET_IDS)],
    [clearKeySetIds]
  );

  const notifyListeners = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const registerOnCommit = useCallback(
    (listener: (event: ViewStateNavigationCommitEvent) => void) => {
      commitListenersRef.current.add(listener);
      return () => {
        commitListenersRef.current.delete(listener);
      };
    },
    []
  );

  const commitCurrentState = useCallback<
    ViewStateNavigationManagerContextValue["commitCurrentState"]
  >(
    (reason, options) => {
      if (hashWriteSuspensionCountRef.current > 0) {
        return false;
      }

      if (isHashWriteEnabled && !isHashWriteEnabled()) {
        return false;
      }

      const currentState = viewStateContext.getState();
      if (!currentState) {
        return false;
      }

      const hashValues = codec.encode(currentState);
      if (!hashValues) {
        return false;
      }

      const replaceHash = options?.replace ?? replace;
      const forceCommit = options?.force ?? false;
      const commitTimestamp = Date.now();
      const nextSignature = serializeHashValues(hashValues);

      if (!forceCommit) {
        const isDuplicateCommit =
          nextSignature === lastCommitSignatureRef.current &&
          replaceHash === lastCommitReplaceRef.current;
        if (isDuplicateCommit) {
          return false;
        }

        if (
          commitTimestamp - lastCommitTimestampRef.current <
          minCommitIntervalMs
        ) {
          return false;
        }
      }

      updateHash(hashValues, {
        clearKeySetIds: resolvedClearKeySetIds as string[],
        clearKeys: resolvedClearKeys,
        label,
        replace: replaceHash,
      });

      lastCommitSignatureRef.current = nextSignature;
      lastCommitReplaceRef.current = replaceHash;
      lastCommitTimestampRef.current = commitTimestamp;

      const commitEvent: ViewStateNavigationCommitEvent = {
        sequenceId: sequenceIdRef.current + 1,
        timestampMs: commitTimestamp,
        reason,
        state: currentState,
        sourceId: currentState.metadata.sourceId ?? null,
        replace: replaceHash,
        hashValues,
      };
      sequenceIdRef.current = commitEvent.sequenceId;
      latestCommittedStateRef.current = currentState;
      latestCommitEventRef.current = commitEvent;
      historyRef.current = appendViewStateNavigationHistoryEntry(
        historyRef.current,
        commitEvent
      );

      notifyListeners();
      commitListenersRef.current.forEach((listener) => listener(commitEvent));

      return true;
    },
    [
      codec,
      isHashWriteEnabled,
      label,
      minCommitIntervalMs,
      notifyListeners,
      replace,
      resolvedClearKeySetIds,
      resolvedClearKeys,
      updateHash,
      viewStateContext,
    ]
  );

  const suspendHashWrites = useCallback((_reason?: string) => {
    hashWriteSuspensionCountRef.current += 1;
    return () => {
      hashWriteSuspensionCountRef.current = Math.max(
        0,
        hashWriteSuspensionCountRef.current - 1
      );
    };
  }, []);

  const getInitialRestoreState = useCallback(
    () => initialRestoreStateRef.current,
    []
  );
  const isInitialRestoreResolved = useCallback(
    () => initialRestoreResolvedRef.current,
    []
  );
  const getLatestCommittedState = useCallback(
    () => latestCommittedStateRef.current,
    []
  );
  const getLatestCommitEvent = useCallback(
    () => latestCommitEventRef.current,
    []
  );
  const getHistory = useCallback(
    (): ViewStateNavigationHistoryView =>
      readViewStateNavigationHistory(historyRef.current),
    []
  );

  const value = useMemo<ViewStateNavigationManagerContextValue>(
    () => ({
      getInitialRestoreState,
      isInitialRestoreResolved,
      getLatestCommittedState,
      getLatestCommitEvent,
      subscribe,
      registerOnCommit,
      commitCurrentState,
      suspendHashWrites,
      getHistory,
    }),
    [
      commitCurrentState,
      getHistory,
      getInitialRestoreState,
      getLatestCommitEvent,
      getLatestCommittedState,
      isInitialRestoreResolved,
      registerOnCommit,
      subscribe,
      suspendHashWrites,
    ]
  );

  return (
    <ViewStateNavigationManagerContext.Provider value={value}>
      {children}
    </ViewStateNavigationManagerContext.Provider>
  );
};
