import {
  useMeasurement3dActions,
  useMeasurement3dRuntimeServices,
} from "@carma-mapping/addons";

import { SaveAnnotationsPanel } from "./SaveCesiumAnnotations";

/**
 * The save panel of the 3D measurement row in the MapLibre view. A portal
 * save ends the tool like it ends the Cesium measurement mode; the saved set
 * stays on screen read-only.
 */
function SaveMeasurement3dAnnotations() {
  const services = useMeasurement3dRuntimeServices();
  const { setOn } = useMeasurement3dActions();
  if (!services) return null;
  return <SaveAnnotationsPanel source={services} onSaved={() => setOn(false)} />;
}

export default SaveMeasurement3dAnnotations;
