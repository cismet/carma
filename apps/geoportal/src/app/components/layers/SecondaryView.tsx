import {
  faArrowDown,
  faArrowUp,
  faChevronLeft,
  faChevronRight,
  faEye,
  faEyeSlash,
  faInfo,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Slider } from "antd";
import { forwardRef, useContext, useEffect, useRef } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useDispatch, useSelector } from "react-redux";
import { cn } from "../../helper/helper";
import type { SliderSingleProps } from "antd";
import {
  changeOpacity,
  changeVisibility,
  getBackgroundLayer,
  getLayers,
  getSelectedLayerIndex,
  setNextSelectedLayerIndex,
  setPreviousSelectedLayerIndex,
  setSelectedLayerIndex,
} from "../../store/slices/mapping";
import {
  getUIShowInfo,
  getUIShowInfoText,
  setUIShowInfo,
  setUIShowInfoText,
} from "../../store/slices/ui";
import Info from "./Info";
import { iconColorMap, iconMap } from "./items";

type Ref = HTMLDivElement;

interface SecondaryViewProps {}

export const formatter: NonNullable<
  SliderSingleProps["tooltip"]
>["formatter"] = (value) => `${value * 100}%`;

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
  const icon = layer.title.includes("Orthofoto")
    ? "ortho"
    : layer.title === "Bäume"
    ? "bäume"
    : layer.title.includes("gärten")
    ? "gärten"
    : undefined;
  const background = selectedLayerIndex === -1;

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) {
        dispatch(setSelectedLayerIndex(-2));
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  return (
    <div
      onClick={() => {
        dispatch(setSelectedLayerIndex(-2));
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
            showInfo ? "h-[600px]" : "h-12",
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
              {icon === "ortho" ? (
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
              <label className="mb-0 text-base w-full truncate" htmlFor="icon">
                {layer.title}
              </label>
            </div>
            <div className="w-full flex items-center gap-2">
              <label className="mb-0 text-[15px]" htmlFor="opacity-slider">
                Transparenz:
              </label>
              <Slider
                disabled={background}
                tooltip={{ formatter }}
                onFocus={() => {
                  routedMapRef?.leafletMap?.leafletElement.dragging.disable();
                }}
                onChange={(value) => {
                  dispatch(changeOpacity({ id: layer.id, opacity: value }));
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
                  showInfoText ? 0 : 80,
                );
              }}
              className="relative fa-stack"
            >
              <hr className="h-0.5 absolute -top-[9px] right-[3px] bg-black border-0 w-full" />
              <FontAwesomeIcon
                className="text-base pr-[5px]"
                icon={showInfo ? faArrowUp : faArrowDown}
              />
              {!showInfo && (
                <hr className="h-0.5 absolute top-[7px] right-[3px] bg-black border-0 w-full" />
              )}
            </button>
          </div>

          {showInfoText && (
            <Info
              description={layer.description}
              legend={layer.props.legend ? layer.props.legend : []}
            />
          )}
        </div>
      </div>
    </div>
  );
});

export default SecondaryView;
