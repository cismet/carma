/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useContext, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useDispatch, useSelector } from "react-redux";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { faEye, faEyeSlash, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import L from "leaflet";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import type { Layer } from "@carma/types";
import { cn, getHashParams } from "@carma-commons/utils";

import { updateInfoElementsAfterRemovingFeature } from "../../store/slices/features";
import {
  changeVisibility,
  getClickFromInfoView,
  getLayers,
  getSelectedLayerIndex,
  getShowLeftScrollButton,
  removeLayer,
  setClickFromInfoView,
  setSelectedLayerIndex,
  setSelectedLayerIndexNoSelection,
  setShowLeftScrollButton,
  setShowRightScrollButton,
  toggleUseInFeatureInfo,
} from "../../store/slices/mapping";
import {
  UIMode,
  getUIMode,
  getUIShowLayerHideButtons,
} from "../../store/slices/ui";

import "./tabs.css";
import { LayerButton, LayerIcon } from "@carma-mapping/components";
import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";

interface LayerButtonProps {
  title: string;
  id: string;
  index: number;
  icon?: string;
  layer: Layer;
  background?: boolean;
}

const GeoportalLayerButton = ({
  title,
  id,
  index,
  icon,
  layer,
  background,
}: LayerButtonProps) => {
  const { ref, inView } = useInView({
    threshold: 0.99,
    onChange: (inView) => {
      console.debug("HOOK: [LayerButton] inView", inView);
      if (index === 0) {
        dispatch(setShowLeftScrollButton(!inView));
      } else if (index === layersLength - 1) {
        dispatch(setShowRightScrollButton(!inView));
      }
    },
  });
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const showLayerHideButtons = useSelector(getUIShowLayerHideButtons);
  const showLeftScrollButton = useSelector(getShowLeftScrollButton);
  const clickFromInfoView = useSelector(getClickFromInfoView);
  const mode = useSelector(getUIMode);
  const showSettings = index === selectedLayerIndex;
  const layers = useSelector(getLayers);
  const layersLength = layers.length;
  const wmsName =
    layer.layerType === "wmts" || layer.layerType === "wmts-nt"
      ? layer.props.name
      : layer.other.name;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
    });
  const buttonRef = useRef<HTMLDivElement>(null);
  const hashParams = getHashParams();
  const zoom =
    routedMapRef?.leafletMap?.leafletElement.getZoom() || hashParams.zoom;
  const queryable =
    (layer?.queryable || layer?.other?.accentColor || layer?.other?.header) &&
    zoom < (layer.props.maxZoom ? layer.props.maxZoom : Infinity) &&
    zoom > (layer.props.minZoom ? layer.props.minZoom : 0);
  const map = routedMapRef?.leafletMap?.leafletElement as L.Map;

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

  // Track if event listeners have been attached to this layer
  const [listenersAttached, setListenersAttached] = useState(false);

  // Check if this layer should have loading indicators
  const shouldShowLoading = () => {
    // Don't show loading for background layers
    if (background) return false;

    // Don't show loading for vector layers
    if (layer.layerType === "vector") {
      return false;
    }

    return true;
  };

  // Function to find and attach event listeners to the layer
  const findAndAttachListeners = () => {
    if (!map || !wmsName || listenersAttached) return;

    // Skip loading indicators for certain layer types
    const showLoading = shouldShowLoading();

    let found = false;
    map.eachLayer((leafletLayer) => {
      // Check if this is our target layer by name
      // @ts-ignore
      const isTargetLayer = leafletLayer.options?.layers === wmsName;

      if (isTargetLayer) {
        found = true;

        // Check if it's a GridLayer to access its methods
        const isGridLayer = leafletLayer instanceof L.GridLayer;

        if (isGridLayer && showLoading) {
          // Use GridLayer's isLoading method if available
          const isCurrentlyLoading = leafletLayer.isLoading?.();
          if (isCurrentlyLoading !== undefined) {
            setLoading(isCurrentlyLoading);
          }

          // We can also check _loading property which some GridLayer implementations use
          // @ts-ignore
          if (leafletLayer._loading !== undefined) {
            // @ts-ignore
            setLoading(leafletLayer._loading);
          }
        }

        // Only attach loading-related events if we should show loading
        if (showLoading) {
          // Attach events
          leafletLayer.on("tileerror", () => {
            setError(true);
            setLoading(false);
          });

          leafletLayer.on("tileload", () => {
            setError(false);
          });

          leafletLayer.on("loading", () => {
            setLoading(true);
          });

          leafletLayer.on("tileloadstart", () => {
            setLoading(true);
          });

          leafletLayer.on("load", () => {
            setLoading(false);
          });
        }

        setListenersAttached(true);
      }
    });

    // If layer is visible but we didn't find it, it might still be loading
    if (!found && layer.visible && showLoading) {
      setLoading(true);
    }
  };

  // Run when map or layer changes
  useEffect(() => {
    findAndAttachListeners();

    // Set up a MutationObserver to detect when new layers are added to the map
    if (map && !listenersAttached) {
      // Listen for layeradd events on the map
      const layerAddHandler = () => {
        findAndAttachListeners();
      };

      map.on("layeradd", layerAddHandler);

      // Initial check
      findAndAttachListeners();

      return () => {
        map.off("layeradd", layerAddHandler);
      };
    }
  }, [map, layer, listenersAttached]);

  // Also check when layer visibility changes
  useEffect(() => {
    if (layer.visible && map) {
      // When layer becomes visible, it might be added to the map
      findAndAttachListeners();

      // If we still don't have listeners attached, show loading state
      // but only for non-vector and non-background layers
      if (!listenersAttached && shouldShowLoading()) {
        setLoading(true);
      }

      // Set up periodic check for GridLayer loading state
      let gridLayerRef: L.GridLayer | null = null;

      // Find our GridLayer if it exists
      map.eachLayer((leafletLayer) => {
        if (
          // @ts-ignore
          leafletLayer.options?.layers === wmsName &&
          leafletLayer instanceof L.GridLayer
        ) {
          gridLayerRef = leafletLayer as L.GridLayer;
        }
      });

      // If we found a GridLayer, set up interval to check its loading state
      if (gridLayerRef && shouldShowLoading()) {
        const intervalId = setInterval(() => {
          if (gridLayerRef) {
            // Check isLoading method
            const isCurrentlyLoading = gridLayerRef.isLoading?.();
            if (isCurrentlyLoading !== undefined) {
              setLoading(isCurrentlyLoading);
            }

            // Also check _loading property
            // @ts-ignore
            if (gridLayerRef._loading !== undefined) {
              // @ts-ignore
              setLoading(gridLayerRef._loading);
            }
          }
        }, 500); // Check every 500ms

        return () => clearInterval(intervalId);
      }
    }
  }, [layer.visible, map]);

  return (
    <div
      ref={(el) => {
        buttonRef.current = el;
        ref(el);
      }}
      className={cn(
        "",
        // index === -1 && 'ml-auto',
        // index === layersLength - 1 && 'mr-auto',
        showLeftScrollButton && index === -1 && "pr-4"
      )}
      id={`layer-${id}`}
    >
      <LayerButton
        ref={setNodeRef}
        onClick={(e) => {
          console.log("xxx", layer);
          e.stopPropagation();
          console.debug(
            "onClick LayerButton settings clickFromInfoView",
            showSettings,
            clickFromInfoView
          );
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
          zoom >= layer.props.maxZoom && "opacity-50",
          zoom <= layer.props.minZoom && "opacity-50",
          background ? "pr-3" : "pr-2",
          "pl-3",
        ]}
      >
        {loading ? (
          <Spin indicator={<LoadingOutlined spin />} size="small" />
        ) : (
          <LayerIcon
            layer={layer}
            fallbackIcon={layer.icon}
            iconPrefix="https://www.wuppertal.de/geoportal/geoportal_icon_legends/"
            id={`test`}
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
            <button
              id={`removeLayerButton-${id}`}
              className="hover:text-gray-500 text-gray-600 px-1.5 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                if (showLayerHideButtons) {
                  if (layer.visible) {
                    dispatch(changeVisibility({ id, visible: false }));
                  } else {
                    dispatch(changeVisibility({ id, visible: true }));
                  }
                } else {
                  dispatch(removeLayer(id));
                  dispatch(updateInfoElementsAfterRemovingFeature(id));
                }
              }}
            >
              <FontAwesomeIcon
                icon={
                  showLayerHideButtons
                    ? layer.visible
                      ? faEye
                      : faEyeSlash
                    : faX
                }
                className="text-xs"
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
