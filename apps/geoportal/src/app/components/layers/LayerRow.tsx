/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faChevronDown,
  faChevronUp,
  faGripVertical,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import {
  changeBackgroundVisibility,
  changeVisibility,
  getLayers,
  removeLayer,
  setLayers,
  setSelectedLayerIndex,
} from "../../store/slices/mapping";
import OpacitySlider from "./OpacitySlider";
import VisibilityToggle from "./VisibilityToggle";
import DynamicStylingLayerIcon from "./DynamicStylingLayerIcon";
import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
import { isAdhocVectorLayer } from "../../helper/adhoc-feature-utils";
import {
  selectedFeatureBelongsToLayer,
  type LayerVisibilityToggleProps,
} from "./layer-visibility-toggle-props";
import {
  getSelectedFeature,
  setSelectedFeature,
} from "../../store/slices/features";

interface LayerRowProps extends LayerVisibilityToggleProps {
  layer: Layer | BackgroundLayer;
  id: string;
  displayTitle?: string;
  isBackgroundLayer?: boolean;
  index: number;
}

const getLayerRowFallbackIcon = (layer: Layer | BackgroundLayer) =>
  (layer?.layerInfo?.icon as string) || layer?.other?.icon;

const isPinnedLayer = (layer: Layer | BackgroundLayer): boolean =>
  !!(layer as Layer).pinned;

const LayerRow = ({
  layer,
  id,
  displayTitle,
  isBackgroundLayer,
  index,
  onToggleVisibility,
  visibilityToggleDisabled,
  visibilityToggleLabels,
}: LayerRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const layers = useSelector(getLayers);
  const { clearFeatureCollections } = useAdhocFeatureDisplay();
  const icon = getLayerRowFallbackIcon(layer);
  const isPinned = isPinnedLayer(layer);
  const skipSelection = !!layer.skipSelection;

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
      disabled: isPinned,
    });

  const style = { transform: CSS.Translate.toString(transform) };
  const clearLayerSelection = useCallback(() => {
    if (selectedFeatureBelongsToLayer(selectedFeature, id)) {
      dispatch(setSelectedFeature(null));
    }
  }, [dispatch, id, selectedFeature]);
  const handleSelectLayer = useCallback(() => {
    if (index !== -1) {
      dispatch(setSelectedLayerIndex(index));
    }
  }, [dispatch, index]);
  const handleToggleVisibility = useCallback(
    (nextVisible: boolean) => {
      if (onToggleVisibility) {
        onToggleVisibility(nextVisible);
      } else if (isBackgroundLayer) {
        dispatch(changeBackgroundVisibility(nextVisible));
      } else {
        dispatch(changeVisibility({ id, visible: nextVisible }));
      }

      if (!nextVisible) {
        clearLayerSelection();
      }
    },
    [clearLayerSelection, dispatch, id, isBackgroundLayer, onToggleVisibility]
  );
  const handleRemoveLayer = useCallback(() => {
    dispatch(removeLayer(id));
    if (isAdhocVectorLayer(layer)) {
      clearFeatureCollections([id]);
      console.debug("[ADHOC|REMOVE] row clearFeatureCollections", {
        collectionId: id,
      });
    }
  }, [clearFeatureCollections, dispatch, id, layer]);

  const getMoveTarget = (direction: 1 | -1) => {
    let target = index + direction;
    while (
      target >= 0 &&
      target < layers.length &&
      (layers[target] as Layer).pinned
    ) {
      target += direction;
    }
    return target >= 0 && target < layers.length ? target : null;
  };

  const moveLayer = (direction: 1 | -1) => {
    const target = getMoveTarget(direction);
    if (target !== null) {
      dispatch(setLayers(arrayMove(layers, index, target)));
    }
  };

  const transparencyPercent = Math.round(
    (1 - (skipSelection ? 1 : layer.opacity)) * 100
  );

  return (
    <div ref={setNodeRef} style={style} className="w-full flex flex-col px-1">
      <div className="w-full flex items-center gap-2">
        <button
          {...listeners}
          {...attributes}
          className={`flex items-center justify-center !cursor-grab touch-none ${
            isBackgroundLayer || isPinned ? "invisible" : ""
          }`}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
        <DynamicStylingLayerIcon
          layer={layer}
          fallbackIcon={icon}
          isBackgroundLayer={isBackgroundLayer}
          indicatorClassName="ml-1 sm:mr-[8px] lg:mr-0 text-[8px]"
        />
        <p
          className={`mb-0 text-lg flex-1 min-w-0 truncate ${
            index !== -1 && "hover:underline cursor-pointer"
          }`}
          onClick={handleSelectLayer}
        >
          {displayTitle ?? layer.title}
        </p>
        <VisibilityToggle
          visible={layer.visible}
          disabled={skipSelection || visibilityToggleDisabled}
          labels={visibilityToggleLabels}
          onToggleVisibility={handleToggleVisibility}
        />
        <button
          className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
          onClick={() => setExpanded(!expanded)}
        >
          <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} />
        </button>
      </div>
      {expanded && (
        <div className="w-full flex flex-col gap-2 rounded-lg bg-gray-100 p-2 mt-1">
          <div className="flex items-center gap-3">
            <span className="text-base whitespace-nowrap">Transparenz</span>
            <OpacitySlider
              isBackgroundLayer={isBackgroundLayer}
              opacity={skipSelection ? 1 : layer.opacity}
              id={layer.id}
              isVisible={layer.visible}
              disabled={skipSelection}
            />
            <span className="text-base whitespace-nowrap w-10 text-right">
              {transparencyPercent}%
            </span>
          </div>
          {!isBackgroundLayer && (
            <div className="flex items-center gap-2">
              {!isPinned && (
                <>
                  <button
                    className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-white"
                    disabled={getMoveTarget(1) === null}
                    onClick={() => moveLayer(1)}
                  >
                    <FontAwesomeIcon icon={faChevronUp} className="text-xs" />
                    Höher
                  </button>
                  <button
                    className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-white"
                    disabled={getMoveTarget(-1) === null}
                    onClick={() => moveLayer(-1)}
                  >
                    <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
                    Tiefer
                  </button>
                </>
              )}
              <button
                className="ml-auto flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50"
                onClick={handleRemoveLayer}
              >
                <FontAwesomeIcon icon={faTrash} />
                Entfernen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LayerRow;
