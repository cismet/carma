import { useEffect } from "react";

import { registerMeasurement3dInfoBox } from "@carma-mapping/addons";

import { Measurement3dInfoBox } from "../components/annotations/Measurement3dInfoBox";

/** Hands the Geoportal info box to the 3D measurement addon while mounted. */
export const useMeasurement3dGeoportalInfoBox = () => {
  useEffect(() => registerMeasurement3dInfoBox(Measurement3dInfoBox), []);
};
