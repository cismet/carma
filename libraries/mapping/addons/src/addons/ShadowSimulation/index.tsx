import { lazy, Suspense } from "react";

import { useLibreContext } from "@carma-mapping/contexts";
import type {
  ShadowDateState,
  ShadowSimulationConfig,
  ShadowSimulationState,
} from "@carma-mapping/shadow-simulation";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import { useShadowStartupPresentation } from "./use-shadow-startup-presentation";

export type { ShadowDateState, ShadowSimulationConfig, ShadowSimulationState };

const LazyShadowSimulationView = lazy(async () => {
  const module = await import("@carma-mapping/shadow-simulation");
  return { default: module.ShadowSimulationView };
});

const LazyShadowSimulationHeaderControlsView = lazy(async () => {
  const module = await import("@carma-mapping/shadow-simulation");
  return { default: module.ShadowSimulationHeaderControlsView };
});

export const ShadowSimulation = ({
  config,
  libreMap,
  target,
}: AddonComponentProps<"shadowSimulation">) => {
  const [state, setState] = useAddonState("shadowSimulation");
  const [dateState, setDateState] = useAddonState("shadowDate");
  useShadowStartupPresentation(
    libreMap,
    state?.enabled === true && target === null
  );
  // An explicit shadow launch can load its module alongside the map. Ordinary
  // routes retain lazy loading and do not pay for the shadow renderer upfront.
  if (!libreMap && !state?.enabled) return null;
  return (
    <Suspense fallback={null}>
      <LazyShadowSimulationView
        config={config}
        libreMap={libreMap}
        targeted={target !== null}
        sharedState={state}
        setSharedState={setState}
        sharedDateState={dateState}
        setSharedDateState={setDateState}
      />
    </Suspense>
  );
};

export const ShadowSimulationHeaderControls = ({
  config,
}: {
  config?: ShadowSimulationConfig;
}) => {
  const { map } = useLibreContext();
  const [state, setState] = useAddonState("shadowSimulation");
  const [dateState, setDateState] = useAddonState("shadowDate");
  if (!map) return null;
  return (
    <Suspense fallback={null}>
      <LazyShadowSimulationHeaderControlsView
        config={config}
        libreMap={map}
        state={state}
        setState={setState}
        dateState={dateState}
        setDateState={setDateState}
      />
    </Suspense>
  );
};
