import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { SHAPE_ICONS, SHAPE_LABELS, type ExcalidrawShape } from "./shape-tools";

const WRAPPER = "w-fit max-w-full flex items-center gap-2 overflow-visible";
const BUTTON =
  "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors text-base button-shadow [&_svg]:text-current";
const ACTIVE = "!text-[#1677ff] hover:!text-[#1677ff]";
const INACTIVE = "text-gray-600 hover:!text-[#1677ff]";

export type ExcalidrawShapeToolbarProps = {
  shapes: ExcalidrawShape[];
  shape: ExcalidrawShape | null;
  onShapeChange: (shape: ExcalidrawShape) => void;
};

export const ExcalidrawShapeToolbar = ({
  shapes,
  shape,
  onShapeChange,
}: ExcalidrawShapeToolbarProps) => (
  <div className={WRAPPER}>
    {shapes.map((entry) => {
      const label = SHAPE_LABELS[entry];
      const isActive = entry === shape;
      return (
        <Tooltip key={entry} title={label} placement="bottom">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onShapeChange(entry);
            }}
            aria-pressed={isActive}
            aria-label={label}
            data-test-id={`excalidraw-shape-${entry}`}
            className={[BUTTON, isActive ? ACTIVE : INACTIVE].join(" ")}
          >
            <FontAwesomeIcon icon={SHAPE_ICONS[entry]} />
          </button>
        </Tooltip>
      );
    })}
  </div>
);
