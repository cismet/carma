import { faRotateLeft, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { SHAPE_ICONS, SHAPE_LABELS, type AnnotationShape } from "./shape-tools";

const WRAPPER = "w-fit max-w-full flex items-center gap-2 overflow-visible";
const BUTTON =
  "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors text-base button-shadow [&_svg]:text-current";
const ACTIVE = "!text-[#1677ff] hover:!text-[#1677ff]";
const INACTIVE = "text-gray-600 hover:!text-[#1677ff]";
const DIVIDER = "h-6 w-px bg-gray-300/80";

export type AnnotationShapeToolbarProps = {
  shapes: AnnotationShape[];
  shape: AnnotationShape | null;
  onShapeChange: (shape: AnnotationShape) => void;
  onUndo?: () => void;
  onRedo?: () => void;
};

export const AnnotationShapeToolbar = ({
  shapes,
  shape,
  onShapeChange,
  onUndo,
  onRedo,
}: AnnotationShapeToolbarProps) => (
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
            data-test-id={`annotation-shape-${entry}`}
            className={[BUTTON, isActive ? ACTIVE : INACTIVE].join(" ")}
          >
            <FontAwesomeIcon icon={SHAPE_ICONS[entry]} />
          </button>
        </Tooltip>
      );
    })}
    {(onUndo || onRedo) && <span className={DIVIDER} aria-hidden />}
    {onUndo && (
      <Tooltip title="Rückgängig" placement="bottom">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onUndo();
          }}
          aria-label="Rückgängig"
          data-test-id="annotation-undo"
          className={[BUTTON, INACTIVE].join(" ")}
        >
          <FontAwesomeIcon icon={faRotateLeft} />
        </button>
      </Tooltip>
    )}
    {onRedo && (
      <Tooltip title="Wiederholen" placement="bottom">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRedo();
          }}
          aria-label="Wiederholen"
          data-test-id="annotation-redo"
          className={[BUTTON, INACTIVE].join(" ")}
        >
          <FontAwesomeIcon icon={faRotateRight} />
        </button>
      </Tooltip>
    )}
  </div>
);
