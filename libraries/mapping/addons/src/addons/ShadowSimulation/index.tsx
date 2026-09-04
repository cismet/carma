import { lazy, Suspense } from "react";

import { useLibreContext } from "@carma-mapping/contexts";
import type {
  ShadowSimulationConfig,
  ShadowSimulationState,
} from "@carma-mapping/shadow-simulation";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";

export type { ShadowSimulationConfig, ShadowSimulationState };

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
  return (
    <Suspense fallback={null}>
      <LazyShadowSimulationView
        config={config}
        libreMap={libreMap}
        targeted={target !== null}
        sharedState={state}
        setSharedState={setState}
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
  return (
    <Suspense fallback={null}>
      <LazyShadowSimulationHeaderControlsView
        config={config}
        libreMap={map}
        state={state}
        setState={setState}
      />
    </Suspense>
  );
};
