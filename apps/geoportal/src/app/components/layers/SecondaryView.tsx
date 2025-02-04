/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { forwardRef, useContext, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Slider } from "antd";
import type { SliderSingleProps } from "antd";
import {
  faArrowDown,
  faArrowUp,
  faChevronCircleDown,
  faChevronCircleUp,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faEye,
  faEyeSlash,
  faLayerGroup,
  faMap,
  faWindowMaximize,
  faWindowMinimize,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { SELECTED_LAYER_INDEX } from "@carma-apps/portals";

import { cn } from "../../helper/helper";
import {
  changeBackgroundOpacity,
  changeOpacity,
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
import { iconColorMap, iconMap } from "./items";
import LayerInfo from "./LayerInfo";
import BaseLayerInfo from "./BaseLayerInfo";
import BaseLayerSelection from "./BaseLayerSelection";
import AerialLayerSelection from "./AerialLayerSelection";

type Ref = HTMLDivElement;

interface SecondaryViewProps {}

export const formatter: NonNullable<
  SliderSingleProps["tooltip"]
>["formatter"] = (value) => `${100 - value * 100}%`;

const SecondaryView = forwardRef<Ref, SecondaryViewProps>(({}, ref) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const infoRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const showInfo = useSelector(getUIShowInfo);
  const showInfoText = useSelector(getUIShowInfoText);
  const urlPrefix = window.location.origin + window.location.pathname;
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const layer =
    selectedLayerIndex >= 0 ? layers[selectedLayerIndex] : backgroundLayer;
  const iconName = layer?.other?.icon;
  const icon = layer.title.includes("Orthofoto")
    ? "ortho"
    : layer.title === "Bäume"
    ? "bäume"
    : layer.title.includes("gärten")
    ? "gärten"
    : undefined;
  const isBaseLayer = selectedLayerIndex === -1;

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

    const handleOutsideClick = (event: MouseEvent) => {
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

      openBaseLayerViewButtons.forEach((layerButton, i) => {
        if (layerButton.contains(event.target as Node)) {
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

      removeLayerButtons.forEach((layerButton, i) => {
        if (layerButton.contains(event.target as Node)) {
          removedOtherLayer = true;
        }
      });

      layerButtons.forEach((layerButton, i) => {
        if (layerButton.contains(event.target as Node)) {
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

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [dispatch, selectedLayerIndex]);

  return (
    <div
      onClick={() => {
        dispatch(setSelectedLayerIndexNoSelection());
      }}
      className="absolute top-14 w-full z-[999]"
    >
      <div className="w-full flex items-center justify-center">
        <div
          ref={infoRef}
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={cn(
            `bg-white rounded-[10px] 2xl:w-1/2 w-5/6 flex flex-col relative px-10 gap-2 py-2 transition-all duration-300`,
            showInfo ? "h-[600px]" : isBaseLayer ? "h-fit" : "h-12"
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
            onClick={() => dispatch(setPreviousSelectedLayerIndex())}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            className="text-base rounded-full flex items-center justify-center p-2 hover:text-neutral-600 absolute top-2 right-1"
            onClick={() => dispatch(setNextSelectedLayerIndex())}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
          <div className="flex items-center w-full h-8 gap-6">
            <div className="w-1/4 flex items-center gap-2">
              {iconName ? (
                <div style={{ height: 14, width: 14 }}>
                  <img
                    src={urlPrefix + `icons/${iconName}.png`}
                    alt="Ortho"
                    className="h-full"
                  />
                </div>
              ) : (
                <FontAwesomeIcon
                  icon={
                    icon ? iconMap[icon] : isBaseLayer ? faLayerGroup : faMap
                  }
                  className="text-base"
                  style={{ color: iconColorMap[icon] }}
                  id="icon"
                />
              )}
              <label className="mb-0 text-base w-full truncate" htmlFor="icon">
                {isBaseLayer ? "Hintergrund" : layer.title}
              </label>
            </div>
            <div className="w-full flex items-center gap-2">
              <label className="mb-0 text-[15px]" htmlFor="opacity-slider">
                Transparenz:
              </label>
              <Slider
                tooltip={{ formatter }}
                onFocus={() => {
                  routedMapRef?.leafletMap?.leafletElement.dragging.disable();
                }}
                onChange={(value) => {
                  if (isBaseLayer) {
                    dispatch(changeBackgroundOpacity({ opacity: value }));
                  } else {
                    dispatch(changeOpacity({ id: layer.id, opacity: value }));
                  }
                }}
                onChangeComplete={() => {
                  routedMapRef?.leafletMap?.leafletElement.dragging.enable();
                }}
                value={layer.opacity}
                min={0}
                max={1}
                step={0.1}
                className="w-2/3 pt-1"
                id="opacity-slider"
              />
            </div>
            <button
              className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
              onClick={(e) => {
                if (layer.visible) {
                  dispatch(changeVisibility({ id: layer.id, visible: false }));
                } else {
                  dispatch(changeVisibility({ id: layer.id, visible: true }));
                }
              }}
            >
              <FontAwesomeIcon icon={layer.visible ? faEye : faEyeSlash} />
            </button>
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
                legend={layer.props.legend ? layer.props.legend : []}
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
