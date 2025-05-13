/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useContext, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useDispatch, useSelector } from "react-redux";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { faEye, faEyeSlash, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type L from "leaflet";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import type { Layer } from "@carma-commons/types";
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
import LayerIcon from "./LayerIcon";

import "./tabs.css";

interface LayerButtonProps {
  title: string;
  id: string;
  index: number;
  icon?: string;
  layer: Layer;
  background?: boolean;
}

const LayerButton = ({
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

  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const showLayerHideButtons = useSelector(getUIShowLayerHideButtons);
  const showLeftScrollButton = useSelector(getShowLeftScrollButton);
  const clickFromInfoView = useSelector(getClickFromInfoView);
  const mode = useSelector(getUIMode);
  const showSettings = index === selectedLayerIndex;
  const layers = useSelector(getLayers);
  const layersLength = layers.length;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
    });
  const buttonRef = useRef<HTMLDivElement>(null);
  const hashParams = getHashParams();
  const zoom =
    routedMapRef?.leafletMap?.leafletElement.getZoom() || hashParams.zoom;
  const queryable =
    layer?.queryable &&
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

  useEffect(() => {
    map?.eachLayer((leafletLayer) => {
      if (
        // @ts-ignore
        leafletLayer.options?.layers &&
        layer.other?.name &&
        // @ts-ignore
        leafletLayer.options?.layers === layer.other?.name
      ) {
        leafletLayer.on("tileerror", () => {
          setError(true);
        });

        leafletLayer.on("tileload", () => {
          setError(false);
        });
      }
    });
  }, [map]);

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
      <div
        ref={setNodeRef}
        onClick={(e) => {
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
        className={cn(
          "w-fit min-w-max relative flex items-center gap-1 pl-3 rounded-[10px] h-8 z-[9999999] button-shadow",
          selectedLayerIndex === -2
            ? layer.visible
              ? "bg-white"
              : "bg-neutral-200/70"
            : showSettings
            ? "bg-white"
            : "bg-neutral-200",
          zoom >= layer.props.maxZoom && "opacity-50",
          zoom <= layer.props.minZoom && "opacity-50",
          background ? "pr-3" : "pr-2"
        )}
      >
        <LayerIcon layer={layer} fallbackIcon={icon} />
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
      </div>
    </div>
  );
};

export default LayerButton;
