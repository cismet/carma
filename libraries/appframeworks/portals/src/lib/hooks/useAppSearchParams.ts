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
  customHashState?: {
    resolve: (hashParams: HashParams) => TCustomHashState;
  };
};

export type UseAppSearchParamsResult<TCustomHashState extends object> = {
  customHashState: AppSearchParamsCustomStateSnapshot<TCustomHashState> | null;
};

const defaultResolveLaunchMode = (): ResolvedHashLaunchMode =>
  HASH_LAUNCH_MODE.TWO_D;

export const useAppSearchParams = <
  TCustomHashState extends object = Record<string, never>,
>({
  defaultHashParams,
  resolveLaunchMode = defaultResolveLaunchMode,
  customHashState,
}: UseAppSearchParamsOptions<TCustomHashState> = {}) => {
  const { pathname } = useLocation();
  const { getHashParams, registerOnPopState } = useHashState();
  const hashStateOptionsRef = useRef(customHashState);
  hashStateOptionsRef.current = customHashState;

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
      const resolver = hashStateOptionsRef.current?.resolve;
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

  const customHashStateVersionRef = useRef(0);
  const hasCustomHashState = customHashState !== undefined;

  useHashLaunchMode({
    defaultMode: resolveLaunchMode(initialHashParams),
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
    const launchMode = resolveLaunchMode(hashParams);

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
