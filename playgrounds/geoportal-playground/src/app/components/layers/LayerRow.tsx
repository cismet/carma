import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faEye,
  faEyeSlash,
  faGripVertical,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Slider } from "antd";
import { Layer } from "@carma-mapping/layers";
import { useDispatch } from "react-redux";
import { changeOpacity, changeVisibility } from "../../store/slices/mapping";
import { iconColorMap, iconMap } from "./items";
import { formatter } from "./SecondaryView";

interface LayerRowProps {
  layer: Layer;
  id: string;
}

const LayerRow = ({ layer, id }: LayerRowProps) => {
  const dispatch = useDispatch();
  const urlPrefix = window.location.origin + window.location.pathname;
  const icon = layer.title.includes("Orthofoto")
    ? "ortho"
    : layer.title === "Bäume"
    ? "bäume"
    : layer.title.includes("gärten")
    ? "gärten"
    : undefined;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
    });

  const style = { transform: CSS.Translate.toString(transform) };

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
          className="flex items-center justify-center !cursor-grab"
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
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
        <p className="mb-0 text-lg truncate">{layer.title}</p>
      </div>
      <Slider
        min={0}
        max={1}
        tooltip={{ formatter: formatter }}
        step={0.1}
        onChange={(value) => {
          dispatch(changeOpacity({ id: layer.id, opacity: value }));
        }}
        className="w-full"
        value={layer.opacity}
      />
      <button
        className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
        onClick={(e) => {
          if (layer.visible) {
            dispatch(changeVisibility({ id, visible: false }));
          } else {
            dispatch(changeVisibility({ id, visible: true }));
          }
        }}
      >
        <FontAwesomeIcon icon={layer.visible ? faEye : faEyeSlash} />
      </button>
    </div>
  );
};

export default LayerRow;
