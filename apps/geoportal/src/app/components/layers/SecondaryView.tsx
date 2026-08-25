/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import {
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faFilter,
  faLayerGroup,
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
  getShadowSimulationSolarPosition,
  resolveSecondaryViewTargetAddon,
  TargetAddonHost,
  useAddonState,
} from "@carma-mapping/addons";

import {
  changeBackgroundVisibility,
  changeVisibility,
  getActiveInteractionLayerID,
  getBackgroundLayer,
  getLayerStack,
  getSelectedLayerIndex,
  getSelectedStackEntry,
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
  isLayerGroup,
  layerGroupHasInfoView,
  useLayerCatalog,
} from "@carma-mapping/layers";
import type {
  BackgroundLayer,
  Item,
  Layer,
  LayerGroup,
  LayerStackEntry,
} from "@carma-mapping/layers";
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
import { SHADOW_SIMULATION_LAYER_ID } from "../../hooks/useShadowSimulationLayerButton";

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
  const layerStack = useSelector(getLayerStack);
  const selectedEntry = useSelector(getSelectedStackEntry);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const { favorites, addFavorite, removeFavorite } = useLayerCatalog();
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const entry =
    (selectedLayerIndex >= 0 ? selectedEntry : backgroundLayer) ??
    backgroundLayer;
  const group = isLayerGroup(entry as LayerStackEntry)
    ? (entry as LayerGroup)
    : undefined;
  // layer-only data (props, conf, favorites, filters) must not be read for a
  // group entry
  const layer = group ? undefined : (entry as Layer | BackgroundLayer);

  const resolveLayerLegend = (target: Layer | BackgroundLayer) => {
    const vectorLegend =
      target?.conf?.vectorLegend ||
      (target?.layerInfo?.vectorLegend as string) ||
      target?.other?.vectorLegend;
    return vectorLegend && target.layerType === "vector"
      ? [{ OnlineResource: vectorLegend }]
      : target.props?.legend || [];
  };
  // a group shows its configured legend images, otherwise its members' legends
  const legend = group
    ? group.groupInfo?.legend?.map((url) => ({ OnlineResource: url })) ??
      group.layers.flatMap(resolveLayerLegend)
    : resolveLayerLegend(layer);

  const icon = entry.title.includes("Orthofoto")
    ? "ortho"
    : entry.title === "Bäume"
    ? "bäume"
    : entry.title.includes("gärten")
    ? "gärten"
    : undefined;
  const isBaseLayer = selectedLayerIndex === -1;
  const secondaryViewAddon =
    !isBaseLayer && !group
      ? resolveSecondaryViewTargetAddon(layer as Layer)
      : undefined;
  const isShadowSimulationLayer =
    entry.id === SHADOW_SIMULATION_LAYER_ID &&
    secondaryViewAddon?.kind === "shadowSimulation";
  const shadowSolarPosition =
    isShadowSimulationLayer && shadowState
      ? getShadowSimulationSolarPosition(
          shadowState.selection,
          secondaryViewAddon.config
        )
      : null;

  const isInteractionActive = activeInteractionLayerID === entry.id;
  const canFilter =
    !isBaseLayer && !group && hasLayerFilterControl(layer as Layer);
  const filterInfo = (layer as Layer)?.filterInfo;

  const canFavorite =
    !isBaseLayer &&
    !secondaryViewAddon &&
    (entry.type === "layer" || entry.type === "object");
  const isFavorite =
    canFavorite &&
    favorites.some(
      (favorite) =>
        favorite.id === `fav_${entry.id}` || favorite.id === entry.id
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
      removeFavorite(item);
    } else {
      addFavorite(item);
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
      let clickedInteractionButton = false;
      const layerButtons = document.querySelectorAll('[id^="layer-"]');
      const removeLayerButtons = document.querySelectorAll(
        '[id^="removeLayerButton-"]'
      );
      const openBaseLayerViewButtons = document.querySelectorAll(
        '[id^="openBaseLayerView"]'
      );
      const interactionLayerButtons = document.querySelectorAll(
        '[id^="layerInteractionButton-"]'
      );

      openBaseLayerViewButtons.forEach((layerButton) => {
        if (layerButton.contains(event.target as Node)) {
          returnFunction = true;
          return;
        }
      });

      interactionLayerButtons.forEach((interactionButton) => {
        if (interactionButton.contains(event.target as Node)) {
          clickedInteractionButton = true;
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
          const entryId = layerButton.id.replace("layer-", "");
          const entryIndex = layerStack.findIndex(
            (entry) => entry.id === entryId
          );
          const clickedEntry = layerStack[entryIndex];
          if (!clickedEntry) {
            newLayerIndex = SELECTED_LAYER_INDEX.BACKGROUND_LAYER;
            return;
          }
          const hasInfoView = isLayerGroup(clickedEntry)
            ? layerGroupHasInfoView(clickedEntry)
            : !clickedEntry.skipSelection;
          if (!hasInfoView) {
            // leave the selection cleared
            return;
          }
          newLayerIndex = entryIndex;
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
        if (
          newLayerIndex !== SELECTED_LAYER_INDEX.NO_SELECTION &&
          !clickedInteractionButton
        ) {
          dispatch(setClickFromInfoView(true));
        }
      }
    };

    document.addEventListener("pointerdown", handleOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, [dispatch, selectedLayerIndex, layerStack]);

  useEffect(() => {
    return () => {
      routedMapRef?.leafletMap?.leafletElement.dragging.enable();
      routedMapRef?.leafletMap?.leafletElement.scrollWheelZoom.enable();
    };
  }, [routedMapRef]);

  const iconId = `secview-icon-${entry.id}`;

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
              ? secondaryViewAddon
                ? "max-h-[min(600px,80vh)]"
                : "sm:max-h-[600px] sm:h-[70vh] h-[80vh]"
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
          <div className="flex items-center w-full h-8 shrink-0 gap-2 px-6 sm:px-0 sm:gap-6">
            <div className="flex-1 sm:flex-none sm:w-1/4 min-w-0 flex items-center gap-2">
              {group ? (
                <FontAwesomeIcon
                  icon={faLayerGroup}
                  className="text-gray-700"
                  id={iconId}
                />
              ) : (
                <DynamicStylingLayerIcon
                  layer={layer}
                  fallbackIcon={layer.icon ?? icon}
                  isBackgroundLayer={isBaseLayer}
                  isBaseLayer={isBaseLayer}
                  iconId={iconId}
                />
              )}
              <label
                className="mb-0 text-base w-full truncate"
                htmlFor={iconId}
              >
                {isBaseLayer ? "Hintergrund" : entry.title}
              </label>
            </div>
            {!secondaryViewAddon && (
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
                    opacity={entry.opacity ?? 1}
                    id={entry.id}
                    isVisible={entry.visible}
                    disabled={isCesium}
                  />
                </div>
              </div>
            )}
            {shadowSolarPosition && (
              <div
                className="hidden min-w-0 flex-1 whitespace-nowrap text-base tabular-nums text-neutral-500 sm:block"
                aria-label={`Sonne: Azimut ${shadowSolarPosition.azimuthDegrees.toFixed(
                  0
                )} Grad, Höhe ${shadowSolarPosition.elevationDegrees.toFixed(
                  1
                )} Grad`}
                title={`Azimut ${shadowSolarPosition.azimuthDegrees.toFixed(
                  0
                )}° · Höhe ${shadowSolarPosition.elevationDegrees.toFixed(1)}°`}
              >
                Sonne {shadowSolarPosition.azimuthDegrees.toFixed(0)}° /{" "}
                {shadowSolarPosition.elevationDegrees.toFixed(1)}°
              </div>
            )}
            {canFilter && (
              <button
                className="hover:text-gray-500 text-gray-600 flex items-center justify-center sm:hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(
                    setActiveInteractionLayerID(
                      isInteractionActive ? null : entry.id
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
              visible={entry.visible}
              disabled={isCesium}
              labels={DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS}
              onToggleVisibility={(nextVisible) => {
                if (isShadowSimulationLayer && shadowState) {
                  setShadowState({ ...shadowState, enabled: nextVisible });
                }
                dispatch(
                  isBaseLayer
                    ? changeBackgroundVisibility(nextVisible)
                    : changeVisibility({ id: entry.id, visible: nextVisible })
                );
              }}
            />
            <button
              onClick={() => {
                dispatch(setUIShowInfo(!showInfo));
                if (secondaryViewAddon) {
                  dispatch(setUIShowInfoText(false));
                  return;
                }
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

          {!secondaryViewAddon && (
            <div className="flex sm:hidden items-center w-full gap-2 px-6 shrink-0">
              <label
                className="mb-0 text-[15px] whitespace-nowrap"
                htmlFor="opacity-slider"
              >
                Transparenz:
              </label>
              <div className="flex-1 pt-1">
                <OpacitySlider
                  isBackgroundLayer={isBaseLayer}
                  opacity={entry.opacity ?? 1}
                  id={entry.id}
                  isVisible={entry.visible}
                  disabled={isCesium}
                />
              </div>
              <span className="text-sm w-10 text-right whitespace-nowrap">
                {Math.round((1 - (entry.opacity ?? 1)) * 100)}%
              </span>
            </div>
          )}

          {isInteractionActive && !group && (
            <div className="w-full px-6 pb-1 sm:hidden">
              <InteractionContent layer={layer as Layer} />
            </div>
          )}

          {showInfo && secondaryViewAddon && !group && (
            <div className="w-full px-6 pb-2 overflow-y-auto">
              <TargetAddonHost
                addon={secondaryViewAddon}
                target={layer as Layer}
              />
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

          {showInfoText && !secondaryViewAddon && (
            <hr className="h-px my-0 bg-gray-300 border-0 w-full sm:hidden" />
          )}
          {showInfoText &&
            !secondaryViewAddon &&
            (isBaseLayer ? (
              <BaseLayerInfo />
            ) : group ? (
              <LayerInfo
                description={group.description ?? ""}
                legend={legend}
                metaDataText={group.groupInfo?.metaDataText}
                links={group.groupInfo?.links}
                footerText={`Layer-Gruppe (${group.layers.length} Layer)`}
              />
            ) : (
              <LayerInfo
                description={layer.description}
                legend={legend}
                links={layer.layerInfo?.links}
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
