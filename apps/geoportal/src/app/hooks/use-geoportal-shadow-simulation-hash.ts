import { useCallback, useEffect, useMemo, useRef } from "react";

import type { AppSearchParamsCustomStateSnapshot } from "@carma-appframeworks/portals";
import { useAddonState } from "@carma-mapping/addons";
import { clampShadowSimulationSelectionToDaylight } from "@carma-mapping/shadow-simulation";
import { useLibreContext } from "@carma-mapping/contexts";
import { useHashState } from "@carma-providers/hash-state";

import {
  buildGeoportalShadowSimulationHashUpdate,
  isGeoportalShadowSimulationHashSelectionValidForYear,
  type GeoportalCustomHashState,
  type GeoportalShadowSimulationHashSelection,
} from "../helper/geoportal-custom-hash-state";

type UseGeoportalShadowSimulationHashOptions = {
  customHashState: AppSearchParamsCustomStateSnapshot<GeoportalCustomHashState> | null;
};

type ShadowHashUpdate = ReturnType<
  typeof buildGeoportalShadowSimulationHashUpdate
>;

const SHADOW_HASH_WRITE_INTERVAL_MS = 500;

const stateMatchesHashSelection = (
  enabled: boolean,
  selection: { minutes: number; dayOfYear: number },
  hashSelection: GeoportalShadowSimulationHashSelection | null
): boolean =>
  hashSelection === null
    ? !enabled
    : enabled &&
      selection.minutes === hashSelection.minutes &&
      selection.dayOfYear === hashSelection.dayOfYear;

export const useGeoportalShadowSimulationHash = ({
  customHashState,
}: UseGeoportalShadowSimulationHashOptions) => {
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const { map: libreMap } = useLibreContext();
  const { updateHashState } = useHashState();
  const handledHashStateVersionRef = useRef<number | null>(null);
  const pendingHashStateVersionRef = useRef<number | null>(null);
  const pendingHashUpdateRef = useRef<ShadowHashUpdate | null>(null);
  const hashWriteTimerRef = useRef<number | null>(null);
  const lastHashWriteAtRef = useRef<number | null>(null);
  const updateHashStateRef = useRef(updateHashState);
  updateHashStateRef.current = updateHashState;

  const flushPendingHashUpdate = useCallback(() => {
    hashWriteTimerRef.current = null;
    const update = pendingHashUpdateRef.current;
    if (!update) {
      return;
    }

    pendingHashUpdateRef.current = null;
    lastHashWriteAtRef.current = Date.now();
    updateHashStateRef.current(update, {
      label: "geoportal:sync-shadow-simulation",
      replace: true,
    });
  }, []);

  const cancelPendingHashUpdate = useCallback(() => {
    if (hashWriteTimerRef.current !== null) {
      window.clearTimeout(hashWriteTimerRef.current);
      hashWriteTimerRef.current = null;
    }
    pendingHashUpdateRef.current = null;
  }, []);

  const scheduleHashUpdate = useCallback(
    (update: ShadowHashUpdate) => {
      pendingHashUpdateRef.current = update;
      if (hashWriteTimerRef.current !== null) {
        return;
      }

      const lastWriteAt = lastHashWriteAtRef.current;
      const elapsed =
        lastWriteAt === null ? Infinity : Date.now() - lastWriteAt;
      const delay = Math.max(0, SHADOW_HASH_WRITE_INTERVAL_MS - elapsed);
      if (delay === 0) {
        flushPendingHashUpdate();
        return;
      }

      hashWriteTimerRef.current = window.setTimeout(
        flushPendingHashUpdate,
        delay
      );
    },
    [flushPendingHashUpdate]
  );

  const hashStateVersion = customHashState?.version;
  const decodedHashSelection =
    customHashState?.shadowSimulationSelection ?? null;
  const mapCenter = libreMap?.getCenter();
  const shadowYear = shadowState?.selection.year;
  const hashSelection = useMemo(
    () =>
      decodedHashSelection && shadowYear !== undefined
        ? isGeoportalShadowSimulationHashSelectionValidForYear(
            decodedHashSelection,
            shadowYear
          )
          ? clampShadowSimulationSelectionToDaylight(
              {
                ...decodedHashSelection,
                year: shadowYear,
              },
              {
                latitude: mapCenter?.lat,
                longitude: mapCenter?.lng,
                timeZone: "Europe/Berlin",
              }
            )
          : null
        : decodedHashSelection,
    [decodedHashSelection, mapCenter?.lat, mapCenter?.lng, shadowYear]
  );

  useEffect(() => {
    if (!shadowState) {
      cancelPendingHashUpdate();
      handledHashStateVersionRef.current = null;
      pendingHashStateVersionRef.current = null;
    }
  }, [cancelPendingHashUpdate, shadowState]);

  useEffect(
    () => () => {
      cancelPendingHashUpdate();
    },
    [cancelPendingHashUpdate]
  );

  useEffect(() => {
    if (
      hashStateVersion === undefined ||
      !shadowState ||
      handledHashStateVersionRef.current === hashStateVersion
    ) {
      return;
    }

    handledHashStateVersionRef.current = hashStateVersion;
    cancelPendingHashUpdate();

    if (
      stateMatchesHashSelection(
        shadowState.enabled,
        shadowState.selection,
        hashSelection
      )
    ) {
      pendingHashStateVersionRef.current = null;
      return;
    }

    pendingHashStateVersionRef.current = hashStateVersion;
    setShadowState({
      ...shadowState,
      enabled: hashSelection !== null,
      selection:
        hashSelection === null
          ? shadowState.selection
          : {
              ...shadowState.selection,
              minutes: hashSelection.minutes,
              dayOfYear: hashSelection.dayOfYear,
            },
    });
  }, [
    cancelPendingHashUpdate,
    hashSelection,
    hashStateVersion,
    setShadowState,
    shadowState,
  ]);

  const shadowEnabled = shadowState?.enabled;
  const shadowMinutes = shadowState?.selection.minutes;
  const shadowDayOfYear = shadowState?.selection.dayOfYear;

  useEffect(() => {
    if (
      hashStateVersion === undefined ||
      shadowEnabled === undefined ||
      shadowMinutes === undefined ||
      shadowDayOfYear === undefined ||
      handledHashStateVersionRef.current !== hashStateVersion
    ) {
      return;
    }

    if (pendingHashStateVersionRef.current === hashStateVersion) {
      if (
        !stateMatchesHashSelection(
          shadowEnabled,
          { minutes: shadowMinutes, dayOfYear: shadowDayOfYear },
          hashSelection
        )
      ) {
        return;
      }
      pendingHashStateVersionRef.current = null;
    }

    scheduleHashUpdate(
      buildGeoportalShadowSimulationHashUpdate({
        enabled: shadowEnabled,
        selection: {
          minutes: shadowMinutes,
          dayOfYear: shadowDayOfYear,
        },
      })
    );
  }, [
    hashSelection,
    hashStateVersion,
    scheduleHashUpdate,
    shadowDayOfYear,
    shadowEnabled,
    shadowMinutes,
  ]);
};
