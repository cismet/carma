import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  updateHashHistoryState,
  type HashLaunchMode,
  HASH_LAUNCH_MODE,
} from "@carma-commons/utils";
import { useHashState, type HashParams } from "@carma-providers/hash-state";

import { useHashLaunchMode } from "./useHashLaunchMode";

type ResolvedHashLaunchMode = Exclude<
  HashLaunchMode,
  typeof HASH_LAUNCH_MODE.UNSET
>;

export type AppSearchParamsStateSource = "initial" | "popstate";

export type AppSearchParamsCustomStateSnapshot<TCustomHashState extends object> =
  TCustomHashState & {
    source: AppSearchParamsStateSource;
    version: number;
  };

export type AppSearchParamsDefaultHashOptions = {
  buildParams: () => Record<string, string>;
  label: string;
  shouldApply: (options: {
    hashParams: HashParams;
    launchMode: ResolvedHashLaunchMode;
  }) => boolean;
};

export type UseAppSearchParamsOptions<
  TCustomHashState extends object = Record<string, never>,
> = {
  defaultHashParams?: AppSearchParamsDefaultHashOptions;
  resolveLaunchMode?: (hashParams: HashParams) => ResolvedHashLaunchMode;
  resolveCustomHashState?: (hashParams: HashParams) => TCustomHashState;
};

export type UseAppSearchParamsResult<TCustomHashState extends object> = {
  customHashState: AppSearchParamsCustomStateSnapshot<TCustomHashState> | null;
};

const defaultResolveLaunchMode = (): ResolvedHashLaunchMode =>
  HASH_LAUNCH_MODE.TWO_D;

const isResolvedHashLaunchMode = (
  value: unknown
): value is ResolvedHashLaunchMode =>
  value === HASH_LAUNCH_MODE.TWO_D || value === HASH_LAUNCH_MODE.THREE_D;

const getCustomHashStateLaunchMode = <TCustomHashState extends object>(
  customHashState: TCustomHashState | null
): ResolvedHashLaunchMode | null => {
  const launchMode = (customHashState as { launchMode?: unknown } | null)
    ?.launchMode;
  return isResolvedHashLaunchMode(launchMode) ? launchMode : null;
};

export const useAppSearchParams = <
  TCustomHashState extends object = Record<string, never>,
>({
  defaultHashParams,
  resolveLaunchMode = defaultResolveLaunchMode,
  resolveCustomHashState,
}: UseAppSearchParamsOptions<TCustomHashState> = {}) => {
  const { pathname } = useLocation();
  const { getHashParams, registerOnPopState } = useHashState();
  const resolveCustomHashStateRef = useRef(resolveCustomHashState);
  resolveCustomHashStateRef.current = resolveCustomHashState;

  const initialHashParamsRef = useRef<HashParams | null>(null);
  if (initialHashParamsRef.current === null) {
    initialHashParamsRef.current = getHashParams();
  }
  const initialHashParams = initialHashParamsRef.current;

  const buildCustomHashStateSnapshot = useCallback(
    (
      hashParams: HashParams,
      source: AppSearchParamsStateSource,
      version: number
    ): AppSearchParamsCustomStateSnapshot<TCustomHashState> | null => {
      const resolver = resolveCustomHashStateRef.current;
      return resolver
        ? {
            ...resolver(hashParams),
            source,
            version,
          }
        : null;
    },
    []
  );

  const [customHashStateSnapshot, setCustomHashStateSnapshot] =
    useState<AppSearchParamsCustomStateSnapshot<TCustomHashState> | null>(() =>
      buildCustomHashStateSnapshot(initialHashParams, "initial", 0)
    );

  const resolveEffectiveLaunchMode = useCallback(
    (
      hashParams: HashParams,
      customState: TCustomHashState | null
    ): ResolvedHashLaunchMode =>
      getCustomHashStateLaunchMode(customState) ?? resolveLaunchMode(hashParams),
    [resolveLaunchMode]
  );

  const customHashStateVersionRef = useRef(0);
  const hasCustomHashState = resolveCustomHashState !== undefined;

  useHashLaunchMode({
    defaultMode: resolveEffectiveLaunchMode(
      initialHashParams,
      customHashStateSnapshot
    ),
  });

  useEffect(() => {
    if (!hasCustomHashState) {
      return;
    }

    return registerOnPopState(({ hashParams }) => {
      customHashStateVersionRef.current += 1;
      setCustomHashStateSnapshot(
        buildCustomHashStateSnapshot(
          hashParams,
          "popstate",
          customHashStateVersionRef.current
        )
      );
    });
  }, [buildCustomHashStateSnapshot, hasCustomHashState, registerOnPopState]);

  useEffect(() => {
    if (!defaultHashParams) {
      return;
    }

    const hashParams = getHashParams();
    const launchMode = resolveEffectiveLaunchMode(
      hashParams,
      resolveCustomHashStateRef.current?.(hashParams) ?? null
    );

    if (defaultHashParams.shouldApply({ hashParams, launchMode })) {
      updateHashHistoryState(defaultHashParams.buildParams(), pathname, {
        label: defaultHashParams.label,
        replace: true,
      });
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return { customHashState: customHashStateSnapshot };
};
