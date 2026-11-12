import { useCallback } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import {
  CARMA_PLAN_SCENARIOS,
  type CarmaPlanScenarioId,
} from "./scenario";

/**
 * carma plan in one channel. The addon (`CarmaPlan`) mounts what it says and
 * writes back the site's title and whether a scenario is still being built;
 * the control button, the layer bar row and the panel write `isOn` and
 * `scenario`. Session-only: a row that comes back from the host's persisted
 * layer stack finds `isOn` false and is dropped.
 */

/** reality, or one of the scenarios */
export type CarmaPlanChoice = "reality" | CarmaPlanScenarioId;

export type CarmaPlanState = {
  /** whether the plan is switched on, which is what keeps the row */
  isOn: boolean;
  /** what the site shows while on; "reality" leaves the mesh as it is */
  scenario: CarmaPlanChoice;
  siteTitle: string;
  /** the ground under the site is loading or the scenario being built */
  isLoading: boolean;
  error: string | null;
  /** whether the host shows the panel; the app's fact, mirrored here */
  panelOpen: boolean;
};

export const CARMA_PLAN_STATE_DEFAULT: CarmaPlanState = {
  isOn: false,
  scenario: "construction",
  siteTitle: "",
  isLoading: false,
  error: null,
  panelOpen: false,
};

export const CARMA_PLAN_CHOICES: readonly {
  id: CarmaPlanChoice;
  label: string;
}[] = [{ id: "reality", label: "Bestand" }, ...CARMA_PLAN_SCENARIOS];

export const carmaPlanChoiceLabel = (choice: CarmaPlanChoice): string =>
  CARMA_PLAN_CHOICES.find((entry) => entry.id === choice)?.label ?? choice;

export const useCarmaPlanActions = () => {
  const [sessionState, setSessionState] = useAddonState("carmaPlan");
  const state = sessionState ?? CARMA_PLAN_STATE_DEFAULT;

  const update = useCallback(
    (patch: Partial<CarmaPlanState>) =>
      setSessionState((previous) => {
        const base = previous ?? CARMA_PLAN_STATE_DEFAULT;
        const changed = (Object.keys(patch) as (keyof CarmaPlanState)[]).some(
          (key) => patch[key] !== base[key]
        );
        return changed ? { ...base, ...patch } : base;
      }),
    [setSessionState]
  );

  const setOn = useCallback((isOn: boolean) => update({ isOn }), [update]);
  const toggle = useCallback(
    () =>
      setSessionState((previous) => {
        const base = previous ?? CARMA_PLAN_STATE_DEFAULT;
        return { ...base, isOn: !base.isOn };
      }),
    [setSessionState]
  );
  const setScenario = useCallback(
    (scenario: CarmaPlanChoice) => update({ scenario }),
    [update]
  );
  const setPanelOpen = useCallback(
    (panelOpen: boolean) => update({ panelOpen }),
    [update]
  );

  return { ...state, update, setOn, toggle, setScenario, setPanelOpen };
};
