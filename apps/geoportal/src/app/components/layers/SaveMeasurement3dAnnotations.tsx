import { useMeasurement3dRuntimeServices } from "@carma-mapping/addons";

import { SaveAnnotationsPanel } from "./SaveCesiumAnnotations";

/** The save panel of the 3D measurement row in the MapLibre view. */
function SaveMeasurement3dAnnotations() {
  const services = useMeasurement3dRuntimeServices();
  if (!services) return null;
  return <SaveAnnotationsPanel source={services} />;
}

export default SaveMeasurement3dAnnotations;
