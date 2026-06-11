/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import {
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { forwardRef, useCallback, useContext, useEffect, useRef } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useDispatch, useSelector } from "react-redux";
import { SELECTED_LAYER_INDEX } from "@carma-appframeworks/portals";
import { cn } from "@carma-commons/utils";

import {
  changeBackgroundVisibility,
  changeVisibility,
  getBackgroundLayer,
  getLayers,
  getSelectedLayerIndex,
  setClickFromInfoView,
  setNextSelectedLayerIndex,
  setPreviousSelectedLayerIndex,
  setSelectedLayerIndex,
  setSelectedLayerIndexNoSelection,
} from "../../store/slices/mapping";
import {
  getUIShowInfo,
  getUIShowInfoText,
  setUIShowInfo,
  setUIShowInfoText,
} from "../../store/slices/ui";
import {
  getSelectedFeature,
  setSelectedFeature,
} from "../../store/slices/features";
import {
  addFavorite,
  getFavorites,
  removeFavorite,
} from "../../store/slices/layers";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import AerialLayerSelection from "./AerialLayerSelection";
import BaseLayerInfo from "./BaseLayerInfo";
import BaseLayerSelection from "./BaseLayerSelection";
import FavoriteToggle from "./FavoriteToggle";
import LayerInfo from "./LayerInfo";
import OpacitySlider from "./OpacitySlider";
import VisibilityToggle from "./VisibilityToggle";
import {
  LayerIcon,
  useMapFrameworkSwitcherContext,
} from "@carma-mapping/components";
import {
  selectedFeatureBelongsToLayer,
  type LayerVisibilityToggleProps,
} from "./layer-visibility-toggle-props";
import {
  buildLayerFavoriteItem,
  canFavoriteLayer,
  isFavoriteLayer,
} from "./layer-favorite-utils";
import { DEFAULT_LAYER_FAVORITE_TOGGLE_LABELS } from "./layer-favorite-toggle-props";

type Ref = HTMLDivElement;

type SecondaryViewProps = LayerVisibilityToggleProps;
type SecondaryViewLayer = BackgroundLayer | Layer;

const getSecondaryViewLegend = (layer: SecondaryViewLayer) => {
  const vectorLegend =
    layer?.conf?.vectorLegend ||
    (layer?.layerInfo?.vectorLegend as string) ||
    layer?.other?.vectorLegend;

  return vectorLegend && layer.layerType === "vector"
    ? [{ OnlineResource: vectorLegend }]
    : layer.props?.legend || [];
};

const getSecondaryViewFallbackIcon = (
  layer: SecondaryViewLayer
): string | undefined =>
  layer.title.includes("Orthofoto")
    ? "ortho"
    : layer.title === "Bäume"
    ? "bäume"
    : layer.title.includes("gärten")
    ? "gärten"
    : undefined;

const findElementByIdRecursive = (
  element: Element,
  id: string
): Element | null => {
  if (element.id === id) {
    return element;
  }

  for (let i = 0; i < element.children.length; i++) {
    const found = findElementByIdRecursive(element.children[i], id);
    if (found) {
      return found;
    }
  }

  return null;
};

const SecondaryView = forwardRef<Ref, SecondaryViewProps>((props, _ref) => {
  const {
    onToggleVisibility,
    visibilityToggleDisabled,
    visibilityToggleLabels,
  } = props;
  void _ref;
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const infoRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const showInfo = useSelector(getUIShowInfo);
  const showInfoText = useSelector(getUIShowInfoText);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const selectedFeature = useSelector(getSelectedFeature);
  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const favorites = useSelector(getFavorites);
  const layer =
    selectedLayerIndex >= 0 ? layers[selectedLayerIndex] : backgroundLayer;
  const legend = getSecondaryViewLegend(layer);
  const icon = getSecondaryViewFallbackIcon(layer);
  const isBaseLayer = selectedLayerIndex === -1;

  const canFavorite = canFavoriteLayer({ isBaseLayer, layer });
  const isFavorite = canFavorite && isFavoriteLayer({ favorites, layer });

  const toggleFavorite = useCallback(() => {
    const item = buildLayerFavoriteItem(layer);
    if (isFavorite) {
      dispatch(removeFavorite(item));
    } else {
      dispatch(addFavorite(item));
    }
  }, [dispatch, isFavorite, layer]);

  const { isLeaflet, isCesium } = useMapFrameworkSwitcherContext();
  const handlePreviousLayer = useCallback(() => {
    dispatch(setPreviousSelectedLayerIndex({ isLeaflet }));
  }, [dispatch, isLeaflet]);
  const handleNextLayer = useCallback(() => {
    dispatch(setNextSelectedLayerIndex({ isLeaflet }));
  }, [dispatch, isLeaflet]);
  const handleMouseEnter = useCallback(() => {
    routedMapRef?.leafletMap?.leafletElement.dragging.disable();
    routedMapRef?.leafletMap?.leafletElement.scrollWheelZoom.disable();
  }, [routedMapRef]);
  const handleMouseLeave = useCallback(() => {
    routedMapRef?.leafletMap?.leafletElement.dragging.enable();
    routedMapRef?.leafletMap?.leafletElement.scrollWheelZoom.enable();
  }, [routedMapRef]);
  const clearLayerSelection = useCallback(() => {
    if (selectedFeatureBelongsToLayer(selectedFeature, layer.id)) {
      dispatch(setSelectedFeature(null));
    }
  }, [dispatch, layer.id, selectedFeature]);
  const handleToggleVisibility = useCallback(
    (nextVisible: boolean) => {
      if (onToggleVisibility) {
        onToggleVisibility(nextVisible);
      } else if (isBaseLayer) {
        dispatch(changeBackgroundVisibility(nextVisible));
      } else {
        dispatch(changeVisibility({ id: layer.id, visible: nextVisible }));
      }

      if (!nextVisible) {
        clearLayerSelection();
      }
    },
    [clearLayerSelection, dispatch, isBaseLayer, layer.id, onToggleVisibility]
  );
  const handleToggleInfo = useCallback(() => {
    const nextShowInfo = !showInfo;
    const nextShowInfoText = !showInfoText;

    dispatch(setUIShowInfo(nextShowInfo));
    setTimeout(
      () => dispatch(setUIShowInfoText(nextShowInfoText)),
      showInfoText || isBaseLayer ? 0 : 80
    );
  }, [dispatch, isBaseLayer, showInfo, showInfoText]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch(setSelectedLayerIndexNoSelection());
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [dispatch]);

  useEffect(() => {
    const handleOutsideClick = (event: PointerEvent) => {
      if ((event.target as Element)?.closest?.(".ant-dropdown")) {
        return;
      }
      let newLayerIndex = -2;
      let removedOtherLayer = false;
      let returnFunction = false;
      const layerButtons = document.querySelectorAll('[id^="layer-"]');
      const removeLayerButtons = document.querySelectorAll(
        '[id^="removeLayerButton-"]'
      );
      const openBaseLayerViewButtons = document.querySelectorAll(
        '[id^="openBaseLayerView"]'
      );
      const filterLayerButtons = document.querySelectorAll(
        '[id^="filterLayerButton-"]'
      );

      openBaseLayerViewButtons.forEach((layerButton) => {
        if (layerButton.contains(event.target as Node)) {
          returnFunction = true;
          return;
        }
      });

      filterLayerButtons.forEach((filterButton) => {
        if (filterButton.contains(event.target as Node)) {
          returnFunction = true;
          return;
        }
      });

      const foundElement = findElementByIdRecursive(
        event.target as Element,
        "openBaseLayerView"
      );

      if (foundElement) {
        returnFunction = true;
      }

      if (returnFunction) {
        return;
      }

      removeLayerButtons.forEach((layerButton) => {
        if (layerButton.contains(event.target as Node)) {
          removedOtherLayer = true;
        }
      });

      layerButtons.forEach((layerButton) => {
        if (layerButton.contains(event.target as Node)) {
          const layerId = layerButton.id.replace("layer-", "");
          const clickedLayer = layers.find((l) => l.id === layerId);
          if (clickedLayer?.skipSelection) {
            returnFunction = true;
            return;
          }
          newLayerIndex = layers.findIndex((l) => l.id === layerId);
        }
      });

      if (removedOtherLayer) {
        if (newLayerIndex === selectedLayerIndex) {
          dispatch(setSelectedLayerIndexNoSelection());
        }
        return;
      }
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) {
        const currentLayerIndex = selectedLayerIndex;
        console.debug(
          "handleOutsideClick newLayerIndex",
          newLayerIndex,
          currentLayerIndex
        );
        newLayerIndex === currentLayerIndex
          ? dispatch(setSelectedLayerIndexNoSelection())
          : dispatch(setSelectedLayerIndex(newLayerIndex));
        if (newLayerIndex !== SELECTED_LAYER_INDEX.NO_SELECTION) {
          dispatch(setClickFromInfoView(true));
        }
      }
    };

    document.addEventListener("pointerdown", handleOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, [dispatch, selectedLayerIndex]);

  useEffect(() => {
    return () => {
      routedMapRef?.leafletMap?.leafletElement.dragging.enable();
      routedMapRef?.leafletMap?.leafletElement.scrollWheelZoom.enable();
    };
  }, [routedMapRef]);

  const iconId = `secview-icon-${layer.id}`;

  return (
    <div className="pt-3 w-full pointer-events-none">
      <div className="flex items-center justify-center w-full">
        <div
          ref={infoRef}
          className={cn(
            "pointer-events-auto",
            "min-w-[280px] sm:max-w-[560px] md:max-w-[720px] lg:w-full w-full sm:w-3/4 sm:mx-0",
            "h-fit bg-white button-shadow rounded-[10px] flex flex-col relative secondary-view gap-2 py-2 transition-all duration-300",
            showInfo
              ? "sm:max-h-[600px] sm:h-[70vh] h-[80vh]"
              : isBaseLayer
              ? "h-fit"
              : "h-12"
          )}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button
            className="text-base rounded-full flex items-center justify-center p-2 hover:text-neutral-600 absolute top-2 left-1"
            onClick={handlePreviousLayer}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            className="text-base rounded-full flex items-center justify-center p-2 hover:text-neutral-600 absolute top-2 right-1"
            onClick={handleNextLayer}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
          <div className="flex items-center w-full h-8 gap-2 px-6 sm:px-0 sm:gap-6">
            <div className="w-1/4 flex items-center gap-2">
              <LayerIcon
                layer={layer}
                fallbackIcon={icon}
                isBaseLayer={isBaseLayer}
                id={iconId}
              />
              <label
                className="mb-0 text-base w-full truncate"
                htmlFor={iconId}
              >
                {isBaseLayer ? "Hintergrund" : layer.title}
              </label>
            </div>
            <div className="w-full flex items-center gap-2">
              <label
                className="mb-0 text-[15px] hidden sm:block"
                htmlFor="opacity-slider"
              >
                Transparenz:
              </label>
              <div className="w-2/3 pt-1">
                <OpacitySlider
                  isBackgroundLayer={isBaseLayer}
                  opacity={layer.opacity}
                  id={layer.id}
                  isVisible={layer.visible}
                  disabled={isCesium}
                />
              </div>
            </div>
            {canFavorite && (
              <FavoriteToggle
                favoriteToggleLabels={DEFAULT_LAYER_FAVORITE_TOGGLE_LABELS}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
                favoriteToggleTestIds={{
                  add: "add-layer-favorite-secondary-view",
                  remove: "remove-layer-favorite-secondary-view",
                }}
              />
            )}
            <VisibilityToggle
              visible={layer.visible}
              disabled={visibilityToggleDisabled}
              labels={visibilityToggleLabels}
              onToggleVisibility={handleToggleVisibility}
            />
            <button onClick={handleToggleInfo} className="relative fa-stack">
              {showInfo ? (
                <FontAwesomeIcon
                  className="text-base pr-[5px]"
                  icon={faChevronUp}
                />
              ) : (
                <FontAwesomeIcon
                  className="text-base pr-[5px]"
                  icon={faChevronDown}
                />
              )}
            </button>
          </div>

          {isBaseLayer && (
            <div className="flex flex-col gap-2 pb-4">
              <div className="w-full flex last:rounded-s-md first:rounded-s-md">
                <BaseLayerSelection />
                <AerialLayerSelection />
              </div>
            </div>
          )}

          {showInfoText &&
            (isBaseLayer ? (
              <BaseLayerInfo />
            ) : (
              <LayerInfo
                description={layer.description}
                legend={legend}
                zoomLevels={{
                  maxZoom: layer.props.maxZoom,
                  minZoom: layer.props.minZoom,
                }}
              />
            ))}
        </div>
      </div>
    </div>
  );
});

export default SecondaryView;
