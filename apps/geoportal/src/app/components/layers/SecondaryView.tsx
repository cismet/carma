/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import {
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faFilter,
  faStar,
} from "@fortawesome/free-solid-svg-icons";
import { faStar as regularFaStar } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge } from "antd";
import { forwardRef, useContext, useEffect, useRef } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useDispatch, useSelector } from "react-redux";
import { SELECTED_LAYER_INDEX } from "@carma-appframeworks/portals";
import { cn } from "@carma-commons/utils";

import {
  changeBackgroundVisibility,
  changeVisibility,
  getActiveInteractionLayerID,
  getBackgroundLayer,
  getLayers,
  getSelectedLayerIndex,
  setActiveInteractionLayerID,
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
  addFavorite,
  getFavorites,
  removeFavorite,
} from "../../store/slices/layers";
import type { Item, Layer } from "@carma-mapping/layers";
import AerialLayerSelection from "./AerialLayerSelection";
import BaseLayerInfo from "./BaseLayerInfo";
import BaseLayerSelection from "./BaseLayerSelection";
import LayerInfo from "./LayerInfo";
import OpacitySlider from "./OpacitySlider";
import VisibilityToggle from "./VisibilityToggle";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import DynamicStylingLayerIcon from "./DynamicStylingLayerIcon";
import { hasLayerFilterControl } from "./LayerFilterControl";
import { InteractionContent } from "./InteractionView";
import { DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS } from "./layer-visibility-toggle-props";

type Ref = HTMLDivElement;

interface SecondaryViewProps {}

const SecondaryView = forwardRef<Ref, SecondaryViewProps>(({}, _ref) => {
  void _ref;
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const infoRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const showInfo = useSelector(getUIShowInfo);
  const showInfoText = useSelector(getUIShowInfoText);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const favorites = useSelector(getFavorites);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const layer =
    selectedLayerIndex >= 0 ? layers[selectedLayerIndex] : backgroundLayer;
  const vectorLegend =
    layer?.conf?.vectorLegend ||
    (layer?.layerInfo?.vectorLegend as string) ||
    layer?.other?.vectorLegend;
  const legend =
    vectorLegend && layer.layerType === "vector"
      ? [{ OnlineResource: vectorLegend }]
      : layer.props?.legend || [];

  const icon = layer.title.includes("Orthofoto")
    ? "ortho"
    : layer.title === "Bäume"
    ? "bäume"
    : layer.title.includes("gärten")
    ? "gärten"
    : undefined;
  const isBaseLayer = selectedLayerIndex === -1;

  const isInteractionActive = activeInteractionLayerID === layer.id;
  const canFilter = !isBaseLayer && hasLayerFilterControl(layer as Layer);
  const filterInfo = (layer as Layer).filterInfo;

  const canFavorite =
    !isBaseLayer && (layer.type === "layer" || layer.type === "object");
  const isFavorite =
    canFavorite &&
    favorites.some(
      (favorite) =>
        favorite.id === `fav_${layer.id}` || favorite.id === layer.id
    );

  const buildFavoriteItem = (): Item => {
    const other = layer.other ?? {};
    const layerInfo = layer.layerInfo ?? {};
    return {
      title: layer.title,
      description: layer.description ?? "",
      id: layer.id,
      serviceName: other.serviceName ?? "custom",
      type: layer.type,
      tags: other.tags ?? layerInfo.tags,
      thumbnail: other.thumbnail ?? layerInfo.thumbnail,
      keywords: other.keywords ?? layerInfo.keywords,
      icon: other.icon ?? layer.icon,
      alternativeIcon: other.alternativeIcon,
      service: other.service,
      name: other.name,
      path: other.path,
      originalPath: other.originalPath,
      vectorLegend: other.vectorLegend ?? (layerInfo.vectorLegend as string),
      vectorStyle:
        (layerInfo.vectorStyle as string) ?? (layer.props?.style as string),
      props: {
        Style: layer.props?.legend
          ? [{ LegendURL: layer.props.legend }]
          : undefined,
        MetadataURL: layer.props?.metaData,
      },
    } as Item;
  };

  const toggleFavorite = () => {
    const item = buildFavoriteItem();
    if (isFavorite) {
      dispatch(removeFavorite(item));
    } else {
      dispatch(addFavorite(item));
    }
  };

  const { isLeaflet, isCesium } = useMapFrameworkSwitcherContext();

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
    const findElementByIdRecursive = (element: Element, id: string) => {
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

      layerButtons.forEach((layerButton, i) => {
        if (layerButton.contains(event.target as Node)) {
          const layerId = layerButton.id.replace("layer-", "");
          const clickedLayer = layers.find((l) => l.id === layerId);
          if (clickedLayer?.skipSelection) {
            returnFunction = true;
            return;
          }
          newLayerIndex = i - 1;
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
            "min-w-[280px] sm:max-w-[560px] md:max-w-[720px] lg:w-full w-[100vw] sm:w-3/4 sm:mx-0 shrink-0",
            "h-fit bg-white button-shadow rounded-[10px] flex flex-col relative secondary-view gap-2 py-2 transition-all duration-300",
            showInfo
              ? "sm:max-h-[600px] sm:h-[70vh] h-[80vh]"
              : isBaseLayer
              ? "h-fit"
              : "h-fit sm:h-12"
          )}
          onMouseEnter={() => {
            routedMapRef?.leafletMap?.leafletElement.dragging.disable();
            routedMapRef?.leafletMap?.leafletElement.scrollWheelZoom.disable();
          }}
          onMouseLeave={() => {
            routedMapRef?.leafletMap?.leafletElement.dragging.enable();
            routedMapRef?.leafletMap?.leafletElement.scrollWheelZoom.enable();
          }}
        >
          <button
            className="text-base rounded-full flex items-center justify-center p-2 hover:text-neutral-600 absolute top-2 left-1"
            onClick={() =>
              dispatch(setPreviousSelectedLayerIndex({ isLeaflet }))
            }
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            className="text-base rounded-full flex items-center justify-center p-2 hover:text-neutral-600 absolute top-2 right-1"
            onClick={() => dispatch(setNextSelectedLayerIndex({ isLeaflet }))}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
          <div className="flex items-center w-full h-8 gap-2 px-6 sm:px-0 sm:gap-6">
            <div className="flex-1 sm:flex-none sm:w-1/4 min-w-0 flex items-center gap-2">
              <DynamicStylingLayerIcon
                layer={layer}
                fallbackIcon={icon}
                isBackgroundLayer={isBaseLayer}
                isBaseLayer={isBaseLayer}
                iconId={iconId}
              />
              <label
                className="mb-0 text-base w-full truncate"
                htmlFor={iconId}
              >
                {isBaseLayer ? "Hintergrund" : layer.title}
              </label>
            </div>
            <div className="hidden sm:flex w-full items-center gap-2">
              <label
                className="mb-0 text-[15px] whitespace-nowrap"
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
            {canFilter && (
              <button
                className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(
                    setActiveInteractionLayerID(
                      isInteractionActive ? null : layer.id
                    )
                  );
                }}
                title={
                  isInteractionActive ? "Filter ausblenden" : "Filter anzeigen"
                }
              >
                <Badge
                  count={
                    filterInfo && !filterInfo.isShowingAll
                      ? filterInfo.activeCount
                      : 0
                  }
                  size="small"
                  color="#4b5563"
                >
                  <FontAwesomeIcon
                    icon={faFilter}
                    className={isInteractionActive ? "!text-[#1677ff]" : ""}
                  />
                </Badge>
              </button>
            )}
            {canFavorite && (
              <button
                className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite();
                }}
                title={isFavorite ? "Favorit entfernen" : "Favorisieren"}
                data-test-id={
                  isFavorite
                    ? "remove-layer-favorite-secondary-view"
                    : "add-layer-favorite-secondary-view"
                }
              >
                <FontAwesomeIcon
                  icon={isFavorite ? faStar : regularFaStar}
                  className={isFavorite ? "text-yellow-400" : ""}
                />
              </button>
            )}
            <VisibilityToggle
              visible={layer.visible}
              disabled={isCesium}
              labels={DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS}
              onToggleVisibility={(nextVisible) =>
                dispatch(
                  isBaseLayer
                    ? changeBackgroundVisibility(nextVisible)
                    : changeVisibility({ id: layer.id, visible: nextVisible })
                )
              }
            />
            <button
              onClick={() => {
                dispatch(setUIShowInfo(!showInfo));
                setTimeout(
                  () => dispatch(setUIShowInfoText(!showInfoText)),
                  showInfoText || isBaseLayer ? 0 : 80
                );
              }}
              className="relative fa-stack"
            >
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

          <div className="flex sm:hidden items-center w-full gap-2 px-6">
            <label
              className="mb-0 text-[15px] whitespace-nowrap"
              htmlFor="opacity-slider"
            >
              Transparenz:
            </label>
            <div className="flex-1 pt-1">
              <OpacitySlider
                isBackgroundLayer={isBaseLayer}
                opacity={layer.opacity}
                id={layer.id}
                isVisible={layer.visible}
                disabled={isCesium}
              />
            </div>
            <span className="text-sm w-10 text-right whitespace-nowrap">
              {Math.round((1 - layer.opacity) * 100)}%
            </span>
          </div>

          {isInteractionActive && (
            <div className="w-full px-6 pb-1">
              <InteractionContent layer={layer as Layer} />
            </div>
          )}

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
