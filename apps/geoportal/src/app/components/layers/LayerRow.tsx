/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useDispatch } from "react-redux";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { faGripVertical, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { Layer } from "@carma/types";

import { removeLayer, setSelectedLayerIndex } from "../../store/slices/mapping";
import OpacitySlider from "./OpacitySlider";
import VisibilityToggle from "./VisibilityToggle";
import {
  LayerIcon,
  useMapFrameworkSwitcherContext,
} from "@carma-mapping/components";
import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
import { isAdhocVectorLayer } from "../../helper/adhoc-feature-utils";
import { cesiumBackgroundlayerNames } from "../../config";

interface LayerRowProps {
  layer: Layer;
  id: string;
  isBackgroundLayer?: boolean;
  index: number;
}

const LayerRow = ({ layer, id, isBackgroundLayer, index }: LayerRowProps) => {
  const dispatch = useDispatch();
  const { clearFeatureCollections } = useAdhocFeatureDisplay();
  const { isCesium } = useMapFrameworkSwitcherContext();
  const icon = layer?.other?.icon;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
    });

  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="w-full flex items-center gap-2 px-1"
    >
      <div className="lg:max-w-80 max-w-44 w-full flex items-center gap-2">
        <button
          {...listeners}
          {...attributes}
          className={`flex items-center justify-center !cursor-grab ${
            isBackgroundLayer ? "invisible" : ""
          }`}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
        <LayerIcon layer={layer} fallbackIcon={icon} />
        <p
          className={`mb-0 text-lg max-w-14 xs:max-w-28 sm:max-w-full truncate ${
            index !== -1 && "hover:underline cursor-pointer"
          }`}
          onClick={() => {
            if (index !== -1) {
              dispatch(setSelectedLayerIndex(index));
            }
          }}
        >
          {isCesium && isBackgroundLayer
            ? cesiumBackgroundlayerNames[layer.id]
            : layer.title}
        </p>
      </div>
      <OpacitySlider
        isBackgroundLayer={isBackgroundLayer}
        opacity={layer.opacity}
        id={layer.id}
        isVisible={layer.visible}
      />
      <VisibilityToggle
        visible={layer.visible}
        id={id}
        isBackgroundLayer={isBackgroundLayer}
      />
      <button
        className={`hover:text-gray-500 text-gray-600 flex items-center justify-center ${
          isBackgroundLayer && "invisible"
        }`}
        onClick={(e) => {
          dispatch(removeLayer(id));
          if (isAdhocVectorLayer(layer)) {
            clearFeatureCollections([id]);
            console.debug("[ADHOC|REMOVE] row clearFeatureCollections", {
              collectionId: id,
            });
          }
        }}
      >
        <FontAwesomeIcon icon={faX} />
      </button>
    </div>
  );
};

export default LayerRow;
