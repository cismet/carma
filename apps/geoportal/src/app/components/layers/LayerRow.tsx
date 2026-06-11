/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useDispatch } from "react-redux";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { faGripVertical, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import { removeLayer, setSelectedLayerIndex } from "../../store/slices/mapping";
import OpacitySlider from "./OpacitySlider";
import VisibilityToggle from "./VisibilityToggle";
import { LayerIcon } from "@carma-mapping/components";
import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
import { isAdhocVectorLayer } from "../../helper/adhoc-feature-utils";

interface LayerRowProps {
  layer: Layer | BackgroundLayer;
  id: string;
  displayTitle?: string;
  isBackgroundLayer?: boolean;
  index: number;
  onToggleVisibility?: (visible: boolean) => void;
  visibilityToggleDisabled?: boolean;
}

const LayerRow = ({
  layer,
  id,
  displayTitle,
  isBackgroundLayer,
  index,
  onToggleVisibility,
  visibilityToggleDisabled,
}: LayerRowProps) => {
  const dispatch = useDispatch();
  const { clearFeatureCollections } = useAdhocFeatureDisplay();
  const icon = (layer?.layerInfo?.icon as string) || layer?.other?.icon;
  const isPinned = !!(layer as Layer).pinned;
  const skipSelection = !!layer.skipSelection;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
      disabled: isPinned,
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
            isBackgroundLayer || isPinned ? "invisible" : ""
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
          {displayTitle ?? layer.title}
        </p>
      </div>
      <OpacitySlider
        isBackgroundLayer={isBackgroundLayer}
        opacity={skipSelection ? 1 : layer.opacity}
        id={layer.id}
        isVisible={layer.visible}
        disabled={skipSelection}
      />
      <VisibilityToggle
        visible={layer.visible}
        id={id}
        isBackgroundLayer={isBackgroundLayer}
        disabled={skipSelection || visibilityToggleDisabled}
        onToggleVisibility={onToggleVisibility}
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
