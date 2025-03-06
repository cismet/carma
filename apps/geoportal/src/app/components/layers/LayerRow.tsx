import { Layer } from "@carma-mapping/layers";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { faGripVertical, faMap, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDispatch, useSelector } from "react-redux";
import { getSelectedFeature } from "../../store/slices/features";
import {
  getBackgroundLayer,
  removeLayer,
  setSelectedLayerIndex,
} from "../../store/slices/mapping";
import { iconColorMap, iconMap } from "./items";
import OpacitySlider from "./OpacitySlider";
import VisibilityToggle from "./VisibilityToggle";
import { ICON_PREFIX } from "../../config/app.config";

interface LayerRowProps {
  layer: Layer;
  id: string;
  isBackgroundLayer?: boolean;
  index: number;
}

const LayerRow = ({ layer, id, isBackgroundLayer, index }: LayerRowProps) => {
  const dispatch = useDispatch();
  const icon = layer?.other?.icon;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
    });

  const style = { transform: CSS.Translate.toString(transform) };

  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedFeature = useSelector(getSelectedFeature);

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
              src={ICON_PREFIX + `${icon}.png`}
              alt="Icon"
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
      <OpacitySlider
        isBackgroundLayer={isBackgroundLayer}
        opacity={layer.opacity}
        id={layer.id}
      />
      <VisibilityToggle
        visible={layer.visible}
        id={id}
        isBackgroundLayer={isBackgroundLayer}
      />
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
