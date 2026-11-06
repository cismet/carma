import type { MouseEvent, ReactNode } from "react";
import { DeleteOutlined } from "@ant-design/icons";

interface PanelProps {
  icon: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  // Highlighted as the target of sidebar clicks.
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

const Panel = ({
  icon,
  title,
  actions,
  selected,
  onClick,
  className = "mb-4",
  children,
}: PanelProps) => (
  // Container of interactive controls, so a div rather than a button.
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
  <div
    onClick={onClick}
    className={`flex flex-col border rounded-xl bg-gray-50 overflow-hidden transition-colors ${
      onClick ? "cursor-pointer" : ""
    } ${selected ? "border-blue-500" : "border-gray-200"} ${className}`}
  >
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-100/60">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-gray-500">
        <span className="text-gray-400">{icon}</span>
        {title}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
    {children}
  </div>
);

export const PanelActionButton = ({
  icon,
  onClick,
  disabled,
  danger,
  children,
}: {
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={(e: MouseEvent) => {
      e.stopPropagation();
      onClick();
    }}
    disabled={disabled}
    className={`flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-md px-2.5 py-1 bg-white cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600 ${
      danger
        ? "hover:border-red-400 hover:text-red-500"
        : "hover:border-blue-400 hover:text-blue-500"
    }`}
  >
    {icon && <span className="text-[10px]">{icon}</span>}
    {children}
  </button>
);

export const DeleteIconButton = ({
  onClick,
  label,
  disabled,
  title,
  small,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
  small?: boolean;
}) => (
  <button
    type="button"
    onClick={(e: MouseEvent) => {
      e.stopPropagation();
      onClick();
    }}
    disabled={disabled}
    aria-label={label}
    title={title}
    className={`${
      small ? "w-7 h-7" : "w-9 h-9"
    } flex-shrink-0 flex items-center justify-center rounded-lg text-gray-400 bg-transparent border-none hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent`}
  >
    <DeleteOutlined />
  </button>
);

export default Panel;
