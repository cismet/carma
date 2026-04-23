/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useCallback, useContext, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { useDispatch, useSelector } from "react-redux";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  faEye,
  faEyeSlash,
  faFilter,
  faSearchLocation,
  faTimes,
  faTrashCan,
  faX,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import L from "leaflet";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import type {
  BackgroundLayer,
  Layer,
  DynamicStylingOptionsConfig,
} from "@carma-mapping/layers";
import { getInteractionButtons } from "@carma-mapping/layers";
import { cn, getHashParams } from "@carma-commons/utils";
import { CameraLimiterToggleButton } from "@carma-commons/ui/components";

import {
  getSelectedFeature,
  setSelectedFeature as setSelectedFeatureAction,
  updateInfoElementsAfterRemovingFeature,
} from "../../store/slices/features";
import {
  changeVisibility,
  getClickFromInfoView,
  getLayers,
  getSelectedLayerIndex,
  getActiveInteractionLayerID,
  getActiveInteractionButtonID,
  getShowLeftScrollButton,
  removeLayer,
  setClickFromInfoView,
  setSelectedLayerIndex,
  setSelectedLayerIndexNoSelection,
  setActiveInteractionLayerID,
  setActiveInteractionButtonID,
  setShowLeftScrollButton,
  setShowRightScrollButton,
  toggleUseInFeatureInfo,
  getMaplibreMaps,
  setLayerDynamicStylingSelection,
  updateLayerFromLayerInfo,
} from "../../store/slices/mapping";
import {
  UIMode,
  getUIMode,
  getUIShowLayerHideButtons,
  triggerFeatureInfoUpdateAction,
} from "../../store/slices/ui";
import "./pulsing.css";
import "./tabs.css";

import {
  LayerButton,
  LayerIcon,
  buildFilterExpression,
  captureOriginalFilters,
  DynamicStylingControl,
  applyDynamicStyling,
  getLastAppliedSelection,
  setLastAppliedSelection,
} from "@carma-mapping/components";
import { Badge, Spin, Tooltip } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useLayerLoading } from "@carma-mapping/utils";
import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
import { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";
import { isAdhocVectorLayer } from "../../helper/adhoc-feature-utils";
import { useGeoportalCameraLimiterLayerControl } from "../../hooks/use-geoportal-camera-limiter-layer-control";
import { CESIUM_ANNOTATION_LAYER_ID } from "../annotations/cesium-annotations.constants";

interface LayerButtonProps {
  title: string;
  id: string;
  index: number;
  layer: Layer | BackgroundLayer;
  background?: boolean;
  hide?: boolean;
}

const LIMITER_BUTTON_CLASSNAME =
  "h-8 w-8 min-w-8 flex items-center justify-center text-gray-600 hover:text-gray-500";

const GeoportalLayerButton = ({
  title,
  id,
  index,
  layer,
  background,
  hide = false,
}: LayerButtonProps) => {
  const { ref, inView } = useInView({
    threshold: 0.99,
    onChange: (inView) => {
      console.debug("HOOK: [LayerButton] inView", inView);
      if (hide) {
        return;
      }
      if (index === 0) {
        dispatch(setShowLeftScrollButton(!inView));
      } else if (index === layersLength - 1) {
        dispatch(setShowRightScrollButton(!inView));
      }
    },
  });
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const { loading, error } = useLayerLoading({
    map: routedMapRef?.leafletMap?.leafletElement as L.Map,
    layer,
  });

  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const showLayerHideButtons = useSelector(getUIShowLayerHideButtons);
  const showLeftScrollButton = useSelector(getShowLeftScrollButton);
  const clickFromInfoView = useSelector(getClickFromInfoView);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const maplibreMaps = useSelector(getMaplibreMaps);
  const mode = useSelector(getUIMode);
  const showSettings = index === selectedLayerIndex;
  const layers = useSelector(getLayers);
  const layersLength = layers.length;

  const isPinned = !!(layer as Layer).pinned;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
      disabled: isPinned,
    });
  const buttonRef = useRef<HTMLDivElement>(null);

  const { clearFeatureCollections } = useAdhocFeatureDisplay();
  const { annotationEntries, flyToAllAnnotations, removeAnnotationById } =
    useAnnotationsRuntime();
  const isCesiumAnnotationLayerButton = id === CESIUM_ANNOTATION_LAYER_ID;
  const {
    areCameraLimitersDisabled,
    setCameraLimitersDisabled,
  } = useGeoportalCameraLimiterLayerControl({
    enabled: isCesiumAnnotationLayerButton,
  });

  const mergedRef = useCallback(
    (el: HTMLDivElement | null) => {
      buttonRef.current = el;
      ref(el);
    },
    [ref]
  );
  const hashParams = getHashParams();
  const zoom =
    routedMapRef?.leafletMap?.leafletElement.getZoom() || hashParams.zoom;
  const queryable =
    (layer?.queryable ||
      layer?.layerInfo?.accentColor ||
      layer?.layerInfo?.header) &&
    zoom < (layer.props.maxZoom ? layer.props.maxZoom : Infinity) &&
    zoom > (layer.props.minZoom ? layer.props.minZoom : 0);
  const map = routedMapRef?.leafletMap?.leafletElement as L.Map;
  const hasAnyCesiumAnnotations = annotationEntries.length > 0;

  useEffect(() => {
    if (hide && activeInteractionLayerID === id) {
      dispatch(setActiveInteractionLayerID(null));
    }
  }, [hide, activeInteractionLayerID, id, dispatch]);

  useEffect(() => {
    if (!inView && selectedLayerIndex === index) {
      document.getElementById(`layer-${id}`).scrollIntoView();
    }
  }, [inView, selectedLayerIndex]);

  useEffect(() => {
    if (index === layersLength - 1 && inView) {
      dispatch(setShowRightScrollButton(false));
    }
  }, [layersLength]);

  const filterAppliedRef = useRef(false);
  useEffect(() => {
    if (!layer.filterConfig || !layer.filterState || filterAppliedRef.current)
      return;

    const mapEntry = maplibreMaps?.find((entry) => entry.id === id);
    if (!mapEntry?.map) return;

    const libreMap = mapEntry.map;
    try {
      const originals = captureOriginalFilters(
        layer.filterConfig.layerPattern,
        libreMap
      );

      const filterExpression = buildFilterExpression(
        layer.filterConfig,
        layer.filterState
      );

      Object.keys(originals).forEach((layerId) => {
        try {
          const origFilter = originals[layerId];
          let combinedFilter = filterExpression;

          if (origFilter && filterExpression) {
            combinedFilter = ["all", origFilter, filterExpression];
          } else if (origFilter && !filterExpression) {
            combinedFilter = origFilter;
          }

          libreMap.setFilter(layerId, combinedFilter);
        } catch (error) {
          console.error(
            `[FilterRestore] Error setting filter on layer ${layerId}:`,
            error
          );
        }
      });

      filterAppliedRef.current = true;
    } catch (error) {
      console.error(
        `[FilterRestore] Error restoring filters for ${id}:`,
        error
      );
    }
  }, [layer.filterConfig, layer.filterState, maplibreMaps, id]);

  const dynamicStylingConfigs = (
    Array.isArray(layer.dynamicStyling)
      ? layer.dynamicStyling
      : layer.dynamicStyling
      ? [layer.dynamicStyling]
      : []
  ).filter(
    (c): c is DynamicStylingOptionsConfig =>
      c.type === "list" || c.type === "toggle"
  );
  const dynamicStylingSelections =
    typeof layer.dynamicStylingSelection === "object" &&
    layer.dynamicStylingSelection !== null
      ? layer.dynamicStylingSelection
      : {};

  const primaryListConfigIndex = dynamicStylingConfigs.findIndex(
    (c) => c.type === "list"
  );
  const primaryListConfig =
    primaryListConfigIndex >= 0
      ? dynamicStylingConfigs[primaryListConfigIndex]
      : null;

  useEffect(() => {
    if (!dynamicStylingConfigs.length) {
      return;
    }

    const mapEntry = maplibreMaps?.find((entry) => entry.id === id);
    if (!mapEntry?.map) {
      return;
    }

    dynamicStylingConfigs.forEach((config, idx) => {
      if (config.type !== "list" && config.type !== "toggle") {
        return;
      }
      const currentSelection =
        dynamicStylingSelections[idx] ?? config.default;
      const lastApplied =
        getLastAppliedSelection(id, idx) ?? config.default;
      if (currentSelection === lastApplied) {
        return;
      }

      const layerInfo = applyDynamicStyling(
        mapEntry.map,
        id,
        config,
        currentSelection
      );
      setLastAppliedSelection(id, idx, currentSelection);
      if (layerInfo) {
        dispatch(updateLayerFromLayerInfo({ id, layerInfo }));
      }
    });
  }, [layer.dynamicStyling, layer.dynamicStylingSelection, maplibreMaps, id]);

  const isCurrentlyVisible = () => {
    if (zoom >= layer?.props?.maxZoom || zoom <= layer?.props?.minZoom) {
      return false;
    } else {
      return true;
    }
  };

  return (
    <div
      ref={mergedRef}
      className={cn(
        "py-2 overflow-visible",
        // index === -1 && 'ml-auto',
        // index === layersLength - 1 && 'mr-auto',
        showLeftScrollButton && index === -1 && "pr-4",
        hide && "hidden"
      )}
      id={`layer-${id}`}
    >
      <LayerButton
        ref={setNodeRef}
        onClick={(e) => {
          e.stopPropagation();
          console.debug(
            "onClick LayerButton settings clickFromInfoView",
            showSettings,
            clickFromInfoView
          );
          if (activeInteractionLayerID && activeInteractionLayerID !== id) {
            dispatch(setActiveInteractionLayerID(null));
          }
          if (layer.interactionButton) {
            dispatch(
              setActiveInteractionLayerID(
                activeInteractionLayerID === id ? null : id
              )
            );
            return;
          }
          if (layer.skipSelection) {
            return;
          }
          if (!clickFromInfoView) {
            showSettings
              ? dispatch(setSelectedLayerIndexNoSelection())
              : dispatch(setSelectedLayerIndex(index));
          } else {
            dispatch(setClickFromInfoView(false));
          }
        }}
        // make sure the shadow is still visible after click
        onMouseDown={(e) => e.preventDefault()}
        style={{
          transform: CSS.Translate.toString(transform),
          userSelect: "none",
        }}
        {...listeners}
        {...attributes}
        classNames={[
          selectedLayerIndex === -2
            ? layer.visible
              ? "bg-white"
              : "bg-neutral-200/70"
            : showSettings
            ? "bg-white"
            : "bg-neutral-200",
          !isCurrentlyVisible() && "opacity-50",
          background ? "pr-3" : "pr-2",
          "pl-3",
        ]}
      >
        {primaryListConfig && !background ? (
          <DynamicStylingControl
            config={primaryListConfig}
            maplibreMap={maplibreMaps?.find((entry) => entry.id === id)?.map}
            carmaLayerId={id}
            currentSelection={
              dynamicStylingSelections[primaryListConfigIndex] ||
              primaryListConfig.default
            }
            onSelectionChange={(selection) => {
              dispatch(
                setLayerDynamicStylingSelection({
                  id,
                  configIndex: primaryListConfigIndex,
                  selection,
                })
              );
            }}
            onLayerInfoChange={(layerInfo) => {
              dispatch(updateLayerFromLayerInfo({ id, layerInfo }));
            }}
          >
            <LayerIcon
              layer={layer}
              fallbackIcon={layer.icon}
              className={loading && isCurrentlyVisible() ? "icon" : ""}
            />
          </DynamicStylingControl>
        ) : (
          <LayerIcon
            layer={layer}
            fallbackIcon={layer.icon}
            className={loading && isCurrentlyVisible() ? "icon" : ""}
          />
        )}

        {layersLength > 0 && (
          <span className="text-base sm:hidden">{layersLength} Layer</span>
        )}
        {error && (
          <div
            className="absolute bottom-0.5 left-0 flex"
            style={{ width: buttonRef.current?.clientWidth + "px" }}
          >
            <div className="w-full mx-3 h-[1px] rounded-lg bg-red-500" />
          </div>
        )}

        {!background && (
          <>
            <span className="text-base ml-1">{title}</span>
            {!isCesiumAnnotationLayerButton &&
              (layer.filterConfig || layer.interactionButton) && (
                <button
                  id={`layerInteractionButton-${id}`}
                  className="px-1.5 flex items-center justify-center"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dispatch(
                      setActiveInteractionLayerID(
                        activeInteractionLayerID === id ? null : id
                      )
                    );
                  }}
                >
                  <Badge
                    count={
                      layer.filterInfo && !layer.filterInfo.isShowingAll
                        ? layer.filterInfo.activeCount
                        : 0
                    }
                    size="small"
                    color="#4b5563"
                  >
                    <FontAwesomeIcon
                      icon={layer.interactionButton?.icon ?? faFilter}
                      className={cn(
                        "text-sm",
                        activeInteractionLayerID === id
                          ? "text-[#1677ff]"
                          : "text-gray-600 hover:text-gray-500"
                      )}
                    />
                  </Badge>
                </button>
              )}

            {isCesiumAnnotationLayerButton && (
              <>
                <Tooltip title="Alle Messungen fokussieren" placement="top">
                  <button
                    className="h-8 w-8 min-w-8 flex items-center justify-center text-gray-600 hover:text-gray-500 disabled:text-gray-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      flyToAllAnnotations();
                    }}
                    disabled={!hasAnyCesiumAnnotations}
                    aria-label="Alle Messungen fokussieren"
                  >
                    <FontAwesomeIcon
                      icon={faSearchLocation}
                      className="text-base leading-none"
                    />
                  </button>
                </Tooltip>

                <Tooltip
                  title={
                    areCameraLimitersDisabled
                      ? "Kameralimiter aktivieren"
                      : "Kameralimiter deaktivieren"
                  }
                  placement="top"
                >
                  <CameraLimiterToggleButton
                    className={LIMITER_BUTTON_CLASSNAME}
                    areLimitersDisabled={areCameraLimitersDisabled}
                    onToggle={setCameraLimitersDisabled}
                    stopPropagation
                    fontSize={16}
                    ariaLabel={
                      areCameraLimitersDisabled
                        ? "Kameralimiter aktivieren"
                        : "Kameralimiter deaktivieren"
                    }
                  />
                </Tooltip>
              </>
            )}
            {getInteractionButtons(layer.interactionButtons).map((btn) => {
              const isActive =
                activeInteractionLayerID === id &&
                activeInteractionButtonID === btn.id;
              const button = (
                <button
                  key={btn.id}
                  id={`layerInteractionButton-${id}-${btn.id}`}
                  className={cn(
                    "px-1.5 flex items-center justify-center text-sm",
                    isActive
                      ? "text-[#1677ff]"
                      : "text-gray-600 hover:text-gray-500"
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (btn.onClick) {
                      btn.onClick();
                      return;
                    }
                    dispatch(setActiveInteractionLayerID(isActive ? null : id));
                    dispatch(
                      setActiveInteractionButtonID(isActive ? null : btn.id)
                    );
                  }}
                >
                  {btn.icon}
                </button>
              );
              return btn.tooltip ? (
                <Tooltip key={btn.id} title={btn.tooltip}>
                  {button}
                </Tooltip>
              ) : (
                button
              );
            })}

            {dynamicStylingConfigs.map((config, idx) => {
              if (idx === primaryListConfigIndex) return null;
              return (
                <DynamicStylingControl
                  key={idx}
                  config={config}
                  maplibreMap={
                    maplibreMaps?.find((entry) => entry.id === id)?.map
                  }
                  carmaLayerId={id}
                  currentSelection={
                    dynamicStylingSelections[idx] || config.default
                  }
                  onSelectionChange={(selection) => {
                    dispatch(
                      setLayerDynamicStylingSelection({
                        id,
                        configIndex: idx,
                        selection,
                      })
                    );
                  }}
                  onLayerInfoChange={(layerInfo) => {
                    dispatch(updateLayerFromLayerInfo({ id, layerInfo }));
                  }}
                  showIcon={false}
                />
              );
            })}

            <button
              id={`removeLayerButton-${id}`}
              className="h-8 w-8 min-w-8 flex items-center justify-center text-gray-600 hover:text-gray-500"
              onClick={(e) => {
                e.stopPropagation();
                if (isCesiumAnnotationLayerButton) {
                  dispatch(removeLayer(id));
                } else if (showLayerHideButtons) {
                  if (layer.visible) {
                    dispatch(changeVisibility({ id, visible: false }));
                  } else {
                    dispatch(changeVisibility({ id, visible: true }));
                  }
                } else {
                  dispatch(removeLayer(id));
                  if (isAdhocVectorLayer(layer)) {
                    clearFeatureCollections([id]);
                    console.debug(
                      "[ADHOC|REMOVE] layer button clearFeatureCollections",
                      {
                        collectionId: id,
                      }
                    );
                  }
                  dispatch(updateInfoElementsAfterRemovingFeature(id));
                }
              }}
            >
              <FontAwesomeIcon
                icon={
                  isCesiumAnnotationLayerButton
                    ? faTimes
                    : showLayerHideButtons
                    ? layer.visible
                      ? faEye
                      : faEyeSlash
                    : faX
                }
                className="text-base leading-none"
              />
            </button>
          </>
        )}
        {queryable && mode === UIMode.FEATURE_INFO && !background && (
          <div
            className="absolute flex items-center top-[32px] left-0 z-[999999999]"
            style={{ width: buttonRef.current?.clientWidth + "px" }}
          >
            <div
              onClick={(e) => {
                e.stopPropagation();
                dispatch(toggleUseInFeatureInfo({ id }));
              }}
              className={cn(
                "h-[5px] z-[999999999] cursor-pointer w-full mx-3 rounded-full",
                layer.useInFeatureInfo && "bg-[#1677ff]",
                !layer.useInFeatureInfo && "bg-gray-500"
              )}
            />
          </div>
        )}
      </LayerButton>
    </div>
  );
};

export default GeoportalLayerButton;
