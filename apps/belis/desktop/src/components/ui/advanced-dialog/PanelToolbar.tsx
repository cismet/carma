import { Children, Fragment } from "react";
import type { ReactNode } from "react";
import { DownOutlined } from "@ant-design/icons";

// Bordered strip of toolbar items, separated by vertical dividers.
const PanelToolbar = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-4 border border-gray-200 rounded-lg bg-gray-50 px-3 py-1.5">
    {Children.toArray(children).map((child, index) => (
      <Fragment key={index}>
        {index > 0 && <div className="w-px h-5 bg-gray-200" />}
        {child}
      </Fragment>
    ))}
  </div>
);

export const CountBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-semibold">
      {count}
    </span>
  ) : null;

export const PanelToggle = ({
  icon,
  label,
  count = 0,
  open,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={open}
    className="flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer group"
  >
    <span className="text-gray-400 text-xs group-hover:text-blue-500">
      {icon}
    </span>
    <span className="text-xs font-semibold tracking-wide uppercase text-gray-500 group-hover:text-blue-500">
      {label}
    </span>
    <CountBadge count={count} />
    <DownOutlined
      className={`text-gray-400 text-[10px] transition-transform group-hover:text-blue-500 ${
        open ? "rotate-180" : ""
      }`}
    />
  </button>
);

export default PanelToolbar;
