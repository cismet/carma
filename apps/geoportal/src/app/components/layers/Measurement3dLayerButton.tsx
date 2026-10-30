import {
  MEASUREMENT3D_LAYER_ID,
  MEASUREMENT3D_SAVE_INTERACTION_ID,
  useMeasurement3dRuntimeServices,
} from "@carma-mapping/addons";

import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";
import { AnnotationLayerButton } from "./AnnotationLayerButton";
import type { GeoportalLayerButtonProps } from "./GeoportalLayerButton";
import type { LayerbarInteractionTarget } from "./use-layerbar-interaction-toggle";

const MEASUREMENT3D_SAVE_LAYERBAR_INTERACTION = {
  layerId: MEASUREMENT3D_LAYER_ID,
  buttonId: MEASUREMENT3D_SAVE_INTERACTION_ID,
} as const satisfies LayerbarInteractionTarget;

const { cesiumAnnotations } = geoportalAnnotationModeText.layerbar;

/** The 3D measurement row of the MapLibre view: the Cesium row's actions. */
export const Measurement3dLayerButton = (props: GeoportalLayerButtonProps) => {
  const services = useMeasurement3dRuntimeServices();
  return (
    <AnnotationLayerButton
      {...props}
      source={services}
      saveInteraction={MEASUREMENT3D_SAVE_LAYERBAR_INTERACTION}
      texts={{
        focusAll: cesiumAnnotations.focusAll,
        save: cesiumAnnotations.exportAllGeoJson,
        deleteAll: cesiumAnnotations.deleteAll,
      }}
    />
  );
};
