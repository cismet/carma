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
  HASH_CLEAR_STATE_KEY_SET,
  type HashClearStateKeySetId,
  useHashState,
} from "@carma-providers/hash-state";

import { ViewStateContext } from "../view-state/ViewStateContext";
import { VIEW_STATE_NAVIGATION_EVENT } from "../../../core/types";
import type {
  ViewState,
  ViewStateHashCodec,
  ViewStateHashParams,
  ViewStateNavigationEvent,
  ViewStateNavigationManagerContextValue,
} from "../../../core/types";
import { ViewStateNavigationManagerContext } from "./ViewStateNavigationManagerContext";
const DEFAULT_HASH_LABEL = "ViewStateNavigationManager";
const DEFAULT_MIN_COMMIT_INTERVAL_MS = 100;
const DEFAULT_CLEAR_STATE_KEY_SET_IDS: readonly HashClearStateKeySetId[] = [
  HASH_CLEAR_STATE_KEY_SET.SCENE_VIEW_STATE,
];

const serializeHashParams = (params: ViewStateHashParams): string =>
  JSON.stringify(
    Object.keys(params)
      .sort()
      .map((key) => [key, params[key]])
  );

const tryEncodeHashParams = ({
  codec,
  state,
  label,
  reason,
}: {
  codec: ViewStateHashCodec;
  state: ViewState | null | undefined;
  label: string;
  reason: string;
}): ViewStateHashParams | null => {
  if (!state) {
    return null;
  }

  try {
    return codec.encode(state);
  } catch (error) {
    console.warn("[ViewStateNavigationManager] Failed to encode hash", {
      label,
      reason,
      error,
    });
    return null;
  }
};

const readRestoreCommitSignature = (
  codec: ViewStateHashCodec,
  state: ViewState | null,
  options: {
    label: string;
    reason: string;
  }
): string | null => {
  const restoreHashParams = tryEncodeHashParams({
    codec,
    state,
    label: options.label,
    reason: options.reason,
  });
  return restoreHashParams ? serializeHashParams(restoreHashParams) : null;
};

type ViewStateNavigationManagerProviderProps = {
  children: ReactNode;
  codec: ViewStateHashCodec;
  label?: string;
  replace?: boolean;
  clearStateKeys?: readonly string[];
  clearStateKeySetIds?: readonly HashClearStateKeySetId[];
  minCommitIntervalMs?: number;
  isHashWriteEnabled?: () => boolean;
};

export const ViewStateNavigationManagerProvider = ({
  children,
  codec,
  label = DEFAULT_HASH_LABEL,
  replace = true,
  clearStateKeys,
  clearStateKeySetIds,
  minCommitIntervalMs = DEFAULT_MIN_COMMIT_INTERVAL_MS,
  isHashWriteEnabled,
}: ViewStateNavigationManagerProviderProps) => {
  const viewStateContext = useContext(ViewStateContext);
  if (!viewStateContext) {
    throw new Error(
      "ViewStateNavigationManagerProvider requires a <ViewStateProvider> ancestor."
    );
  }

  const { getHashStateValues, registerOnPopState, updateHashState } =
    useHashState();

  const [restoreState, setRestoreState] = useState<ViewState | null>(() =>
    codec.decode(getHashStateValues())
  );
  const lastCommitSignatureRef = useRef<string | null>(null);
  const lastCommitReplaceRef = useRef<boolean>(replace);
  const lastCommitTimestampRef = useRef(0);
  const hashWriteSuspensionCountRef = useRef(0);
  const navigationListenersRef = useRef<
    Set<(event: ViewStateNavigationEvent) => void>
  >(new Set());
  const pendingRestoreCommitSignatureRef = useRef<string | null>(
    readRestoreCommitSignature(codec, restoreState, {
      label,
      reason: "initial-restore-signature",
    })
  );
  const isRestoreResolved = true;

  const resolvedClearStateKeys = useMemo(
    () => [...new Set((clearStateKeys ?? []).filter((key) => key.length > 0))],
    [clearStateKeys]
  );
  const resolvedClearStateKeySetIds = useMemo(
    () => [...(clearStateKeySetIds ?? DEFAULT_CLEAR_STATE_KEY_SET_IDS)],
    [clearStateKeySetIds]
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
      const nextRestoreState = codec.decode(event.stateValues);
      setRestoreState(nextRestoreState);
      pendingRestoreCommitSignatureRef.current = readRestoreCommitSignature(
        codec,
        nextRestoreState,
        {
          label,
          reason: "browser-popstate-restore-signature",
        }
      );

      if (!nextRestoreState) {
        return;
      }

      emitNavigationEvent({
        type: VIEW_STATE_NAVIGATION_EVENT.BROWSER_POPSTATE_RESTORE,
        state: nextRestoreState,
      });
    });
  }, [codec, emitNavigationEvent, label, registerOnPopState]);

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

      const hashParams = tryEncodeHashParams({
        codec,
        state: currentState,
        label,
        reason,
      });
      if (!hashParams) {
        return false;
      }

      const replaceHash = options?.replace ?? replace;
      const forceCommit = options?.force ?? false;
      const commitTimestamp = Date.now();
      const nextSignature = serializeHashParams(hashParams);
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

      updateHashState(hashParams, {
        clearStateKeySetIds: resolvedClearStateKeySetIds as string[],
        clearStateKeys: resolvedClearStateKeys,
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
      resolvedClearStateKeySetIds,
      resolvedClearStateKeys,
      updateHashState,
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
