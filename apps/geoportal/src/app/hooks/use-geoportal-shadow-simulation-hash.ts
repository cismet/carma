import { useEffect, useMemo, useRef } from "react";

import type { AppSearchParamsCustomStateSnapshot } from "@carma-appframeworks/portals";
import {
  clampShadowSimulationSelectionToDaylight,
  useAddonState,
} from "@carma-mapping/addons";
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

  const hashStateVersion = customHashState?.version;
  const decodedHashSelection =
    customHashState?.shadowSimulationSelection ?? null;
  const mapCenter = libreMap?.getCenter();
  const hashSelection = useMemo(
    () =>
      decodedHashSelection && shadowState
        ? isGeoportalShadowSimulationHashSelectionValidForYear(
            decodedHashSelection,
            shadowState.selection.year
          )
          ? clampShadowSimulationSelectionToDaylight(
              {
                ...decodedHashSelection,
                year: shadowState.selection.year,
              },
              {
                latitude: mapCenter?.lat,
                longitude: mapCenter?.lng,
                timeZone: "Europe/Berlin",
              }
            )
          : null
        : decodedHashSelection,
    [
      decodedHashSelection,
      mapCenter?.lat,
      mapCenter?.lng,
      shadowState?.selection.year,
    ]
  );

  useEffect(() => {
    if (!shadowState) {
      handledHashStateVersionRef.current = null;
      pendingHashStateVersionRef.current = null;
    }
  }, [shadowState]);

  useEffect(() => {
    if (
      hashStateVersion === undefined ||
      !shadowState ||
      handledHashStateVersionRef.current === hashStateVersion
    ) {
      return;
    }

    handledHashStateVersionRef.current = hashStateVersion;

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
  }, [hashSelection, hashStateVersion, setShadowState, shadowState]);

  useEffect(() => {
    if (
      hashStateVersion === undefined ||
      !shadowState ||
      handledHashStateVersionRef.current !== hashStateVersion
    ) {
      return;
    }

    if (pendingHashStateVersionRef.current === hashStateVersion) {
      if (
        !stateMatchesHashSelection(
          shadowState.enabled,
          shadowState.selection,
          hashSelection
        )
      ) {
        return;
      }
      pendingHashStateVersionRef.current = null;
    }

    updateHashState(buildGeoportalShadowSimulationHashUpdate(shadowState), {
      label: "geoportal:sync-shadow-simulation",
      replace: true,
    });
  }, [hashSelection, hashStateVersion, shadowState, updateHashState]);
};
