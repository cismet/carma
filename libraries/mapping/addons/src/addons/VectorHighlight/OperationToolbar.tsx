import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import type { ShapeToolbarClassNames } from "./ShapeToolbar";
import {
  OPERATION_ICONS,
  OPERATION_LABELS,
  type HighlightOperation,
} from "./operations";

/** same pills the shape toolbar uses, so both groups read as one family */
const DEFAULT_CLASS_NAMES: Pick<
  ShapeToolbarClassNames,
  "wrapper" | "button" | "buttonInactive"
> = {
  wrapper: "w-fit max-w-full flex items-center gap-2 overflow-visible",
  button:
    "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors text-base button-shadow [&_svg]:text-current",
  buttonInactive: "text-gray-600 hover:!text-[#1677ff]",
};

export type OperationToolbarProps = {
  operations: HighlightOperation[];
  operation: HighlightOperation;
  onOperationChange: (operation: HighlightOperation) => void;
  /** colour of the selected operation */
  activeColor?: string;
  labels?: Partial<Record<HighlightOperation, string>>;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
};

export const OperationToolbar = ({
  operations,
  operation,
  onOperationChange,
  activeColor,
  labels,
  tooltipPlacement = "bottom",
}: OperationToolbarProps) => (
  <div className={DEFAULT_CLASS_NAMES.wrapper}>
    {operations.map((entry) => {
      const label = labels?.[entry] ?? OPERATION_LABELS[entry];
      const isActive = entry === operation;
      return (
        <Tooltip key={entry} title={label} placement={tooltipPlacement}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOperationChange(entry);
            }}
            aria-pressed={isActive}
            aria-label={label}
            data-test-id={`vector-highlight-operation-${entry}`}
            className={[
              DEFAULT_CLASS_NAMES.button,
              isActive ? "" : DEFAULT_CLASS_NAMES.buttonInactive,
            ].join(" ")}
            style={isActive && activeColor ? { color: activeColor } : undefined}
          >
            <FontAwesomeIcon icon={OPERATION_ICONS[entry]} />
          </button>
        </Tooltip>
      );
    })}
  </div>
);
