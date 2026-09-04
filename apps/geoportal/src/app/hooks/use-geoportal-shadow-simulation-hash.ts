import { useCallback, useEffect, useMemo, useRef } from "react";

import type { AppSearchParamsCustomStateSnapshot } from "@carma-appframeworks/portals";
import { useAddonState } from "@carma-mapping/addons";
import { useLibreContext } from "@carma-mapping/contexts";
import { DEFAULT_SHADOW_SIMULATION_TIME_ZONE } from "@carma-mapping/shadow-simulation";
import { useHashState } from "@carma-providers/hash-state";

import {
  buildGeoportalShadowSimulationHashUpdate,
  type GeoportalCustomHashState,
} from "../helper/geoportal-custom-hash-state";
import {
  applyShadowHashSelection,
  resolveGeoportalShadowHashSelection,
  shadowStateMatchesHashSelection,
} from "../helper/geoportal-shadow-simulation-state";

type UseGeoportalShadowSimulationHashOptions = {
  customHashState: AppSearchParamsCustomStateSnapshot<GeoportalCustomHashState> | null;
};

type ShadowHashUpdate = ReturnType<
  typeof buildGeoportalShadowSimulationHashUpdate
>;

const SHADOW_HASH_WRITE_INTERVAL_MS = 500;

export const useGeoportalShadowSimulationHash = ({
  customHashState,
}: UseGeoportalShadowSimulationHashOptions) => {
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const [shadowDate, setShadowDate] = useAddonState("shadowDate");
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
  const shadowYear = shadowDate?.year;
  const shadowTimeZone =
    shadowDate?.timeZone ?? DEFAULT_SHADOW_SIMULATION_TIME_ZONE;
  const hashSelection = useMemo(
    () =>
      resolveGeoportalShadowHashSelection(
        decodedHashSelection,
        shadowYear,
        { latitude: mapCenter?.lat, longitude: mapCenter?.lng },
        shadowTimeZone
      ),
    [
      decodedHashSelection,
      mapCenter?.lat,
      mapCenter?.lng,
      shadowTimeZone,
      shadowYear,
    ]
  );

  useEffect(() => {
    if (!shadowState || !shadowDate) {
      cancelPendingHashUpdate();
      handledHashStateVersionRef.current = null;
      pendingHashStateVersionRef.current = null;
    }
  }, [cancelPendingHashUpdate, shadowDate, shadowState]);

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
      !shadowDate ||
      handledHashStateVersionRef.current === hashStateVersion
    ) {
      return;
    }

    handledHashStateVersionRef.current = hashStateVersion;
    cancelPendingHashUpdate();

    if (
      shadowStateMatchesHashSelection(
        shadowState.enabled,
        shadowDate,
        hashSelection
      )
    ) {
      pendingHashStateVersionRef.current = null;
      return;
    }

    pendingHashStateVersionRef.current = hashStateVersion;
    const next = applyShadowHashSelection(
      shadowState,
      shadowDate,
      hashSelection
    );
    setShadowState(next.shadowState);
    setShadowDate(next.dateState);
  }, [
    cancelPendingHashUpdate,
    hashSelection,
    hashStateVersion,
    setShadowState,
    setShadowDate,
    shadowDate,
    shadowState,
  ]);

  const shadowEnabled = shadowState?.enabled;
  const shadowMinutes = shadowDate?.minutes;
  const shadowDayOfYear = shadowDate?.dayOfYear;

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
        !shadowStateMatchesHashSelection(
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
        dateState: {
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
