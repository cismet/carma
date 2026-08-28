import { useLibreContext } from "@carma-mapping/contexts";
import {
  ShadowSimulationHeaderControls as ShadowSimulationHeaderControlsView,
  ShadowSimulationView,
  type ShadowSimulationConfig,
  type ShadowSimulationState,
} from "@carma-mapping/shadow-simulation";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";

export type { ShadowSimulationConfig, ShadowSimulationState };

export const ShadowSimulation = ({
  config,
  libreMap,
  target,
}: AddonComponentProps<"shadowSimulation">) => {
  const [state, setState] = useAddonState("shadowSimulation");
  return (
    <ShadowSimulationView
      config={config}
      libreMap={libreMap}
      targeted={target !== null}
      sharedState={state}
      setSharedState={setState}
    />
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
    <ShadowSimulationHeaderControlsView
      config={config}
      libreMap={map}
      state={state}
      setState={setState}
    />
  );
};
