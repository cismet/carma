import { Tooltip } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowPointer,
  faDrawPolygon,
  faLocationDot,
  faRuler,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import type { DrawMode } from "@carma-mapping/measurements";

import {
  getLibreDrawMode,
  setLibreDrawMode,
} from "../../store/slices/measurements";

type DrawButton = {
  mode: Exclude<DrawMode, "none">;
  label: string;
  icon: IconDefinition;
};

const DRAW_BUTTONS: DrawButton[] = [
  { mode: "select", label: "Messung auswählen", icon: faArrowPointer },
  { mode: "point", label: "Punkt messen", icon: faLocationDot },
  { mode: "line", label: "Linienzug messen", icon: faRuler },
  { mode: "polygon", label: "Fläche messen", icon: faDrawPolygon },
];

// Pill styling mirrors the 3D-measurement layerbar's AnnotationsToolbar so the
// maplibre and cesium paths look identical: each tool is its own rounded white
// shadow button rather than a single panel with buttons inside.
const TOOL_BUTTON_BASE =
  "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors text-base [&_svg]:text-current";
const TOOL_BUTTON_ACTIVE = "!text-[#1677ff] hover:!text-[#1677ff] !shadow-none";
const TOOL_BUTTON_INACTIVE =
  "text-gray-600 hover:!text-[#1677ff] button-shadow";

function MeasurementDrawTools() {
  const dispatch = useDispatch();
  const drawMode = useSelector(getLibreDrawMode);

  const handleSelect = (mode: Exclude<DrawMode, "none">) => {
    dispatch(setLibreDrawMode(drawMode === mode ? "none" : mode));
  };

  return (
    <div
      className="w-fit max-w-full flex items-start gap-2 overflow-visible"
      onClick={(event) => event.stopPropagation()}
    >
      {DRAW_BUTTONS.map(({ mode, label, icon }) => {
        const isActive = drawMode === mode;
        return (
          <Tooltip key={mode} title={label} placement="bottom">
            <button
              type="button"
              onClick={() => handleSelect(mode)}
              aria-pressed={isActive}
              aria-label={label}
              data-test-id={`measurement-draw-${mode}`}
              className={[
                TOOL_BUTTON_BASE,
                isActive ? TOOL_BUTTON_ACTIVE : TOOL_BUTTON_INACTIVE,
              ].join(" ")}
            >
              <FontAwesomeIcon icon={icon} />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default MeasurementDrawTools;
