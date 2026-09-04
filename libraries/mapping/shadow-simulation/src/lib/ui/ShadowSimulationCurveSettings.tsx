import { useMemo } from "react";

import type { ShadowDateState } from "../contracts/shadow-simulation";
import {
  getSolarPosition,
  type SolarLocation,
} from "../core/solar-position";
import { SolarDayTimeControl } from "./SolarDayTimeControl";

export const ShadowSimulationCurveSettings = ({
  location,
  dateState,
  setDateState,
}: {
  location: SolarLocation;
  dateState: ShadowDateState;
  setDateState: (state: ShadowDateState) => void;
}) => {
  const solarPosition = useMemo(
    () => getSolarPosition(dateState, location),
    [dateState, location]
  );

  return (
    <div className="w-full" data-test-id="shadow-simulation-settings-pane">
      <SolarDayTimeControl
        expanded
        location={location}
        selection={dateState}
        position={solarPosition}
        onChange={setDateState}
      />
    </div>
  );
};
