import {
  faLock,
  faLockOpen,
  faMagnifyingGlass,
  faPlus,
  faRotateLeft,
  faRotateRight,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { SHAPE_ICONS, SHAPE_LABELS, type AnnotationShape } from "./shape-tools";

const WRAPPER =
  "w-fit max-w-full flex flex-col items-center gap-2 overflow-visible";
const ROW = "flex items-center gap-2";
const BUTTON =
  "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors text-base button-shadow [&_svg]:text-current";
const ACTIVE = "!text-[#1677ff] hover:!text-[#1677ff]";
const INACTIVE = "text-gray-600 hover:!text-[#1677ff]";
const DIVIDER = "h-6 w-px bg-gray-300/80";
const DRAWING =
  "flex h-8 items-center rounded-[10px] bg-white pl-3 pr-1.5 button-shadow ring-1 ring-inset transition-colors";
const DRAWING_ON = "ring-[#1677ff]/40 bg-[#1677ff]/[0.06]";
const DRAWING_OFF = "ring-transparent hover:ring-gray-300/70";
const DRAWING_LABEL =
  "max-w-[9rem] truncate text-[13px] font-medium leading-none transition-colors";
const DRAWING_TOOLS =
  "ml-2 flex items-center gap-0.5 border-l border-gray-200 pl-1.5";
const DRAWING_ICON =
  "flex h-6 w-6 items-center justify-center rounded-md text-[11px] text-gray-400 transition-colors hover:bg-gray-100 hover:!text-[#1677ff]";
const DRAWING_ICON_DANGER =
  "flex h-6 w-6 items-center justify-center rounded-md text-[15px] text-gray-400 transition-colors hover:bg-red-50 hover:!text-[#ff4d4f]";

export type AnnotationDrawingEntry = {
  id: string;
  label: string;
  active: boolean;
};

export type AnnotationShapeToolbarProps = {
  shapes: AnnotationShape[];
  shape: AnnotationShape | null;
  onShapeChange: (shape: AnnotationShape) => void;
  drawings?: AnnotationDrawingEntry[];
  onPickDrawing?: (id: string) => void;
  onZoomDrawing?: (id: string) => void;
  onDeleteDrawing?: (id: string) => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  onAddGroup?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
};

export const AnnotationShapeToolbar = ({
  shapes,
  shape,
  onShapeChange,
  drawings = [],
  onPickDrawing,
  onZoomDrawing,
  onDeleteDrawing,
  isLocked = false,
  onToggleLock,
  onAddGroup,
  onUndo,
  onRedo,
}: AnnotationShapeToolbarProps) => (
  <div className={WRAPPER}>
    <div className={ROW}>
      {drawings.map((entry) => (
        <div
          key={entry.id}
          className={[DRAWING, entry.active ? DRAWING_ON : DRAWING_OFF].join(
            " "
          )}
        >
          <Tooltip title="Diese Zeichnung bearbeiten" placement="bottom">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPickDrawing?.(entry.id);
              }}
              aria-pressed={entry.active}
              data-test-id={`annotation-drawing-${entry.id}`}
              className={[
                DRAWING_LABEL,
                entry.active ? ACTIVE : INACTIVE,
                onPickDrawing ? "" : "cursor-default",
              ].join(" ")}
            >
              {entry.label}
            </button>
          </Tooltip>
          {(onZoomDrawing || onDeleteDrawing) && (
            <span className={DRAWING_TOOLS}>
              {onZoomDrawing && (
                <Tooltip title="Auf Zeichnung zoomen" placement="bottom">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onZoomDrawing(entry.id);
                    }}
                    aria-label={`${entry.label} anzeigen`}
                    data-test-id={`annotation-drawing-zoom-${entry.id}`}
                    className={DRAWING_ICON}
                  >
                    <FontAwesomeIcon icon={faMagnifyingGlass} />
                  </button>
                </Tooltip>
              )}
              {onDeleteDrawing && (
                <Tooltip title="Zeichnung löschen" placement="bottom">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteDrawing(entry.id);
                    }}
                    aria-label={`${entry.label} löschen`}
                    data-test-id={`annotation-drawing-delete-${entry.id}`}
                    className={DRAWING_ICON_DANGER}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </Tooltip>
              )}
            </span>
          )}
        </div>
      ))}
      {onAddGroup && (
        <Tooltip title="Neue Zeichnung beginnen" placement="bottom">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAddGroup();
            }}
            aria-label="Neue Zeichnung beginnen"
            data-test-id="annotation-add-drawing"
            className={[BUTTON, INACTIVE].join(" ")}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </Tooltip>
      )}
      {onToggleLock && (
        <Tooltip
          title={isLocked ? "Zeichnung entsperren" : "Zeichnung sperren"}
          placement="bottom"
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleLock();
            }}
            aria-pressed={isLocked}
            aria-label={isLocked ? "Zeichnung entsperren" : "Zeichnung sperren"}
            data-test-id="annotation-lock-toggle"
            className={[BUTTON, isLocked ? ACTIVE : INACTIVE].join(" ")}
          >
            <FontAwesomeIcon icon={isLocked ? faLock : faLockOpen} />
          </button>
        </Tooltip>
      )}
    </div>
    {(shapes.length > 0 || onUndo || onRedo) && (
      <div className={ROW}>
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
    )}
  </div>
);
