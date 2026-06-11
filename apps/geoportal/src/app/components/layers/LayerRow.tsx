/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { faGripVertical, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import {
  changeBackgroundVisibility,
  changeVisibility,
  removeLayer,
  setLayerDynamicStylingSelection,
  setSelectedLayerIndex,
} from "../../store/slices/mapping";
import OpacitySlider from "./OpacitySlider";
import VisibilityToggle from "./VisibilityToggle";
import {
  DynamicStylingControl,
  LayerIcon,
  getDynamicStylingOptionsConfigs,
  getDynamicStylingSelections,
} from "@carma-mapping/components";
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
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const { clearFeatureCollections } = useAdhocFeatureDisplay();
  const icon = getLayerRowFallbackIcon(layer);
  const isPinned = isPinnedLayer(layer);
  const skipSelection = !!layer.skipSelection;

  const dynamicStylingConfigs = getDynamicStylingOptionsConfigs(
    layer.dynamicStyling
  );
  const dynamicStylingSelections = getDynamicStylingSelections(
    layer.dynamicStylingSelection
  );
  const primaryListConfigIndex = dynamicStylingConfigs.findIndex(
    (c) => c.type === "list"
  );
  const primaryListConfig =
    primaryListConfigIndex >= 0
      ? dynamicStylingConfigs[primaryListConfigIndex]
      : null;
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
          className={`flex items-center justify-center !cursor-grab touch-none ${
            isBackgroundLayer || isPinned ? "invisible" : ""
          }`}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
        {primaryListConfig && !isBackgroundLayer ? (
          <DynamicStylingControl
            config={primaryListConfig}
            carmaLayerId={layer.id}
            indicatorClassName="ml-1 mr-[8px] lg:mr-0 text-[8px]"
            currentSelection={
              dynamicStylingSelections[primaryListConfigIndex] ||
              primaryListConfig.default
            }
            onSelectionChange={(selection) => {
              dispatch(
                setLayerDynamicStylingSelection({
                  id: layer.id,
                  configIndex: primaryListConfigIndex,
                  selection,
                })
              );
            }}
          >
            <LayerIcon layer={layer} fallbackIcon={icon} />
          </DynamicStylingControl>
        ) : (
          <LayerIcon layer={layer} fallbackIcon={icon} />
        )}
        <p
          className={`mb-0 text-lg max-w-14 xs:max-w-28 sm:max-w-full truncate ${
            index !== -1 && "hover:underline cursor-pointer"
          }`}
          onClick={handleSelectLayer}
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
        disabled={skipSelection || visibilityToggleDisabled}
        labels={visibilityToggleLabels}
        onToggleVisibility={handleToggleVisibility}
      />
      <button
        className={`hover:text-gray-500 text-gray-600 flex items-center justify-center ${
          isBackgroundLayer && "invisible"
        }`}
        onClick={handleRemoveLayer}
      >
        <FontAwesomeIcon icon={faX} />
      </button>
    </div>
  );
};

export default LayerRow;
