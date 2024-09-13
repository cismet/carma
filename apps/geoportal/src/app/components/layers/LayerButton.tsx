import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faEye,
  faEyeSlash,
  faInfo,
  faLayerGroup,
  faX,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Layer } from "@carma-mapping/layers";
import { useContext, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useDispatch, useSelector } from "react-redux";
import { cn } from "../../helper/helper";
import {
  changeVisibility,
  getLayers,
  getSelectedLayerIndex,
  getShowLeftScrollButton,
  removeLayer,
  setSelectedLayerIndex,
  setShowLeftScrollButton,
  setShowRightScrollButton,
  toggleUseInFeatureInfo,
} from "../../store/slices/mapping";
import { getUIMode, getUIShowLayerHideButtons, UIMode } from "../../store/slices/ui";
import { iconColorMap, iconMap } from "./items";
import "./tabs.css";
import { useSearchParams } from "react-router-dom";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import type L from "leaflet";
// import { faCircle } from '@fortawesome/free-regular-svg-icons';

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
  const queryable = layer?.queryable;
  const { ref, inView } = useInView({
    threshold: 0.99,
  });
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const [error, setError] = useState(false);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const showLayerHideButtons = useSelector(getUIShowLayerHideButtons);
  const showLeftScrollButton = useSelector(getShowLeftScrollButton);
  const mode = useSelector(getUIMode);
  const showSettings = index === selectedLayerIndex;
  const layersLength = useSelector(getLayers).length;
  const urlPrefix = window.location.origin + window.location.pathname;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
    });
  const buttonRef = useRef<HTMLDivElement>(null);
  let [searchParams, setSearchParams] = useSearchParams();
  const showAlternateIcons = searchParams.get("altIcon") !== null;
  const iconName = showAlternateIcons
    ? layer.other?.alternativeIcon
    : layer.other?.icon;

  const style = { transform: CSS.Translate.toString(transform) };
  const zoom = routedMapRef?.leafletMap?.leafletElement.getZoom();
  const map = routedMapRef?.leafletMap?.leafletElement as L.Map;

  useEffect(() => {
    if (!inView && index === 0) {
      dispatch(setShowLeftScrollButton(true));
    }
    if (!inView && index === layersLength - 1) {
      dispatch(setShowRightScrollButton(true));
    }
    if (inView && index === 0) {
      dispatch(setShowLeftScrollButton(false));
    }
    if (inView && index === layersLength - 1) {
      dispatch(setShowRightScrollButton(false));
    }
    if (!inView && selectedLayerIndex === index) {
      document.getElementById(`layer-${id}`).scrollIntoView();
    }
  }, [inView, selectedLayerIndex]);

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
        showLeftScrollButton && index === -1 && "pr-4",
      )}
      id={`layer-${id}`}
    >
      <div
        ref={setNodeRef}
        onClick={(e) => {
          e.stopPropagation();
          dispatch(setSelectedLayerIndex(showSettings ? -2 : index));
        }}
        style={style}
        {...listeners}
        {...attributes}
        className={cn(
          "w-fit min-w-max relative flex items-center gap-2 px-3 rounded-[10px] h-8 z-[9999999] button-shadow",
          selectedLayerIndex === -2
            ? layer.visible
              ? "bg-white"
              : "bg-neutral-200/70"
            : showSettings
              ? "bg-white"
              : "bg-neutral-200",
          zoom >= layer.props.maxZoom && "opacity-50",
          zoom <= layer.props.minZoom && "opacity-50",
        )}
      >
        {iconName ? (
          <div style={{ height: 14, width: 14 }}>
            <img
              src={urlPrefix + `icons/${iconName}.svg`}
              alt="icon"
              className="h-full"
            />
          </div>
        ) : icon === "ortho" ? (
          <div style={{ height: 14, width: 14 }}>
            <img
              src={urlPrefix + "images/ortho.png"}
              alt="Ortho"
              className="h-full"
            />
          </div>
        ) : (
          <FontAwesomeIcon
            icon={icon ? iconMap[icon] : faLayerGroup}
            className="text-base"
            style={{ color: iconColorMap[icon] }}
            id="icon"
          />
        )}
        <span className="text-base sm:hidden">{layersLength} Layer</span>
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
            <span className="text-base pt-0.5">{title}</span>
            <button
              className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
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
                !layer.useInFeatureInfo && "bg-gray-500",
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default LayerButton;
