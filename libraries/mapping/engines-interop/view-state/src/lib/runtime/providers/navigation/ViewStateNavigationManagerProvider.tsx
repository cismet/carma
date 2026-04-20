import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  HASH_CLEAR_KEY_SET,
  type HashClearKeySetId,
  useHashState,
} from "@carma-providers/hash-state";

import { ViewStateContext } from "../view-state/ViewStateContext";
import { VIEW_STATE_NAVIGATION_EVENT } from "../../../core/types";
import type {
  ViewState,
  ViewStateHashCodec,
  ViewStateHashValues,
  ViewStateNavigationEvent,
  ViewStateNavigationManagerContextValue,
} from "../../../core/types";
import { ViewStateNavigationManagerContext } from "./ViewStateNavigationManagerContext";
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

const readRestoreCommitSignature = (
  codec: ViewStateHashCodec,
  state: ViewState | null
): string | null => {
  const restoreHashValues = state ? codec.encode(state) : null;
  return restoreHashValues ? serializeHashValues(restoreHashValues) : null;
};

type ViewStateNavigationManagerProviderProps = {
  children: ReactNode;
  codec: ViewStateHashCodec;
  label?: string;
  replace?: boolean;
  clearKeys?: readonly string[];
  clearKeySetIds?: readonly HashClearKeySetId[];
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
  minCommitIntervalMs = DEFAULT_MIN_COMMIT_INTERVAL_MS,
  isHashWriteEnabled,
}: ViewStateNavigationManagerProviderProps) => {
  const viewStateContext = useContext(ViewStateContext);
  if (!viewStateContext) {
    throw new Error(
      "ViewStateNavigationManagerProvider requires a <ViewStateProvider> ancestor."
    );
  }

  const { getHashValues, registerOnPopState, updateHash } = useHashState();

  const [restoreState, setRestoreState] = useState<ViewState | null>(() =>
    codec.decode(getHashValues())
  );
  const lastCommitSignatureRef = useRef<string | null>(null);
  const lastCommitReplaceRef = useRef<boolean>(replace);
  const lastCommitTimestampRef = useRef(0);
  const hashWriteSuspensionCountRef = useRef(0);
  const navigationListenersRef = useRef<
    Set<(event: ViewStateNavigationEvent) => void>
  >(new Set());
  const pendingRestoreCommitSignatureRef = useRef<string | null>(
    readRestoreCommitSignature(codec, restoreState)
  );
  const isRestoreResolved = true;

  const resolvedClearKeys = useMemo(
    () => [...new Set((clearKeys ?? []).filter((key) => key.length > 0))],
    [clearKeys]
  );
  const resolvedClearKeySetIds = useMemo(
    () => [...(clearKeySetIds ?? DEFAULT_CLEAR_KEY_SET_IDS)],
    [clearKeySetIds]
  );

  const emitNavigationEvent = useCallback((event: ViewStateNavigationEvent) => {
    navigationListenersRef.current.forEach((listener) => listener(event));
  }, []);

  const registerOnNavigationEvent = useCallback(
    (listener: (event: ViewStateNavigationEvent) => void) => {
      navigationListenersRef.current.add(listener);
      return () => {
        navigationListenersRef.current.delete(listener);
      };
    },
    []
  );

  useEffect(() => {
    return registerOnPopState((event) => {
      const nextRestoreState = codec.decode(event.values);
      setRestoreState(nextRestoreState);
      pendingRestoreCommitSignatureRef.current = readRestoreCommitSignature(
        codec,
        nextRestoreState
      );

      if (!nextRestoreState) {
        return;
      }

      emitNavigationEvent({
        type: VIEW_STATE_NAVIGATION_EVENT.BROWSER_POPSTATE_RESTORE,
        state: nextRestoreState,
      });
    });
  }, [codec, emitNavigationEvent, registerOnPopState]);

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

      let hashValues: ViewStateHashValues | null;
      try {
        hashValues = codec.encode(currentState);
      } catch (error) {
        console.warn("[ViewStateNavigationManager] Failed to encode hash", {
          label,
          reason,
          error,
        });
        return false;
      }
      if (!hashValues) {
        return false;
      }

      const replaceHash = options?.replace ?? replace;
      const forceCommit = options?.force ?? false;
      const commitTimestamp = Date.now();
      const nextSignature = serializeHashValues(hashValues);
      const restoreCommitSignature = pendingRestoreCommitSignatureRef.current;

      if (!forceCommit && nextSignature === restoreCommitSignature) {
        pendingRestoreCommitSignatureRef.current = null;
        lastCommitSignatureRef.current = nextSignature;
        lastCommitReplaceRef.current = replaceHash;
        lastCommitTimestampRef.current = commitTimestamp;
        return false;
      }

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

      pendingRestoreCommitSignatureRef.current = null;
      lastCommitSignatureRef.current = nextSignature;
      lastCommitReplaceRef.current = replaceHash;
      lastCommitTimestampRef.current = commitTimestamp;

      return true;
    },
    [
      codec,
      isHashWriteEnabled,
      label,
      minCommitIntervalMs,
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

  const value = useMemo<ViewStateNavigationManagerContextValue>(
    () => ({
      restoreState,
      isRestoreResolved,
      registerOnNavigationEvent,
      commitCurrentState,
      suspendHashWrites,
    }),
    [
      commitCurrentState,
      isRestoreResolved,
      registerOnNavigationEvent,
      restoreState,
      suspendHashWrites,
    ]
  );

  return (
    <ViewStateNavigationManagerContext.Provider value={value}>
      {children}
    </ViewStateNavigationManagerContext.Provider>
  );
};
