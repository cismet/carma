import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Tooltip } from "antd";

import { getGeoportalLayerToolActionButtonClassName } from "./layer-tool-action-button-style";

export type LayerbarAction = Readonly<{
  id: string;
  title: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}>;

const LayerButtonActionButton = ({
  title,
  icon,
  active = false,
  disabled = false,
  onClick,
}: LayerbarAction) => (
  <Tooltip title={title} placement="top">
    <button
      type="button"
      className={getGeoportalLayerToolActionButtonClassName(
        active,
        "disabled:text-gray-400"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      disabled={disabled}
      aria-label={title}
    >
      {icon}
    </button>
  </Tooltip>
);

export const LayerbarActionGroup = ({
  actions,
}: {
  actions: LayerbarAction[];
}) => (
  <div className="flex items-center">
    {actions.map((action) => (
      <LayerButtonActionButton key={action.id} {...action} />
    ))}
  </div>
);
