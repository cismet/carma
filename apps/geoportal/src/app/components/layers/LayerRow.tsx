import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faEye,
  faEyeSlash,
  faGripVertical,
  faLayerGroup,
  faMap,
  faX,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Slider } from "antd";
import { Layer } from "@carma-mapping/layers";
import { useDispatch, useSelector } from "react-redux";
import {
  changeBackgroundOpacity,
  changeBackgroundVisibility,
  changeOpacity,
  changePaleOpacity,
  changeVisibility,
  getBackgroundLayer,
  removeLayer,
  setFocusMode,
  setSelectedLayerIndex,
} from "../../store/slices/mapping";
import { iconColorMap, iconMap } from "./items";
import { formatter } from "./SecondaryView";

interface LayerRowProps {
  layer: Layer;
  id: string;
  isBackgroundLayer?: boolean;
  index: number;
}

const LayerRow = ({ layer, id, isBackgroundLayer, index }: LayerRowProps) => {
  const dispatch = useDispatch();
  const urlPrefix = window.location.origin + window.location.pathname;
  const icon = layer?.other?.icon;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
    });

  const style = { transform: CSS.Translate.toString(transform) };

  const backgroundLayer = useSelector(getBackgroundLayer);

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
          className={`flex items-center justify-center !cursor-grab ${
            isBackgroundLayer ? "invisible" : ""
          }`}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
        {icon ? (
          <div style={{ height: 14, width: 14 }}>
            <img
              src={urlPrefix + `icons/${icon}.png`}
              alt="Ortho"
              className="h-full"
            />
          </div>
        ) : (
          <FontAwesomeIcon
            icon={icon ? iconMap[icon] : faMap}
            className="text-base"
            style={{ color: iconColorMap[icon] }}
            id="icon"
          />
        )}
        <p
          className={`mb-0 text-lg truncate ${
            index !== -1 && "hover:underline cursor-pointer"
          }`}
          onClick={() => {
            if (index !== -1) {
              dispatch(setSelectedLayerIndex(index));
            }
          }}
        >
          {layer.title}
        </p>
      </div>
      <Slider
        min={0}
        max={1}
        tooltip={{ formatter: formatter }}
        step={0.1}
        onChange={(value) => {
          if (isBackgroundLayer) {
            dispatch(changeBackgroundOpacity({ opacity: value }));
            if (value !== 1) {
              dispatch(changePaleOpacity({ paleOpacityValue: value }));
              dispatch(setFocusMode(true));
            } else {
              dispatch(setFocusMode(false));
            }

            if (value !== 0) {
              dispatch(changeBackgroundVisibility(true));
            }
          } else {
            dispatch(changeOpacity({ id: layer.id, opacity: value }));
          }
        }}
        className="w-full"
        value={layer.opacity}
      />
      <button
        className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
        onClick={(e) => {
          if (layer.visible) {
            if (isBackgroundLayer) {
              dispatch(changeBackgroundVisibility(false));
            } else {
              dispatch(changeVisibility({ id, visible: false }));
            }
          } else {
            if (isBackgroundLayer) {
              dispatch(changeBackgroundVisibility(true));
              if (backgroundLayer.opacity === 0) {
                dispatch(changeBackgroundOpacity({ opacity: 1 }));
              }
            } else {
              dispatch(changeVisibility({ id, visible: true }));
            }
          }
        }}
      >
        <FontAwesomeIcon icon={layer.visible ? faEye : faEyeSlash} />
      </button>
      <button
        className={`hover:text-gray-500 text-gray-600 flex items-center justify-center ${
          isBackgroundLayer && "invisible"
        }`}
        onClick={(e) => {
          dispatch(removeLayer(id));
        }}
      >
        <FontAwesomeIcon icon={faX} />
      </button>
    </div>
  );
};

export default LayerRow;
