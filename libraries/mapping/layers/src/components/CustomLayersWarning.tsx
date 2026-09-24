import { Alert, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import type { Layer, LayerStackEntry } from "../lib/contracts/carma-layers.d";
import { CUSTOM_CATEGORY } from "../helper/buildCatalog";
import { flattenLayerStack } from "../helper/layerStack";

/**
 * The layers of a stack that entered by a dropped style or service rather than
 * from the catalog. Saved, they keep the definition of the day they were
 * saved: nothing in the catalog knows them, so nothing updates them later.
 */
export const getCustomLayers = (stack: LayerStackEntry[]): Layer[] =>
  flattenLayerStack(stack).filter(
    (layer) => layer.other?.serviceName === CUSTOM_CATEGORY.id
  );

interface CustomLayersWarningProps {
  /** the layers that are about to be saved */
  layers: LayerStackEntry[];
  className?: string;
}

/** a hint next to a save action when the saved layers include custom ones */
export const CustomLayersWarning = ({
  layers,
  className,
}: CustomLayersWarningProps) => {
  const customLayers = getCustomLayers(layers);
  if (customLayers.length === 0) {
    return null;
  }

  const titles = customLayers.map((layer) => `„${layer.title}“`).join(", ");
  const details = (
    <span>
      {customLayers.length === 1
        ? `Die Kartenebene ${titles} wurde manuell hinzugefügt (z. B. per Drag & Drop).`
        : `Die Kartenebenen ${titles} wurden manuell hinzugefügt (z. B. per Drag & Drop).`}{" "}
      Sie werden in ihrem jetzigen Stand gespeichert und später nicht
      automatisch aktualisiert. Damit gespeicherte Karten aktuell bleiben, die
      Kartenebenen über „Karteninhalte hinzufügen“ hinzufügen.
    </span>
  );

  // a boxed warning rather than a line of text: it sits next to the save
  // action, where a quiet hint is easily read past
  return (
    <Alert
      type="warning"
      showIcon
      // a triangle, so it does not read as a second info icon next to the one
      // that opens the details
      icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
      className={className}
      message={
        <span className="flex items-center gap-2 font-semibold">
          Enthält eigene Kartenebenen, die nicht aktualisiert werden
          <Tooltip title={details}>
            <FontAwesomeIcon
              icon={faCircleInfo}
              className="cursor-help text-gray-600"
              aria-label="Mehr Informationen zu eigenen Kartenebenen"
            />
          </Tooltip>
        </span>
      }
    />
  );
};

export default CustomLayersWarning;
