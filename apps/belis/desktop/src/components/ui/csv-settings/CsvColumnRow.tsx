import type { ReactNode } from "react";
import { HolderOutlined, RightOutlined } from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DeleteIconButton } from "../advanced-dialog/Panel";

interface CsvColumnRowViewProps {
  index: number;
  label: string;
  color?: string;
  colorTitle?: string;
  onRemove?: () => void;
  dragging?: boolean;
}

export const CsvColumnRowView = ({
  index,
  label,
  color,
  colorTitle,
  onRemove,
  dragging,
}: CsvColumnRowViewProps) => (
  <div
    className={`flex items-center gap-3 border rounded-lg pl-3 pr-1 py-1 bg-white select-none ${
      dragging
        ? "border-blue-500 shadow-lg cursor-grabbing"
        : "border-gray-200 hover:border-blue-400 cursor-grab"
    }`}
  >
    <HolderOutlined className="text-gray-400" />
    <span className="w-5 flex-shrink-0 text-center text-xs text-gray-400">
      {index + 1}
    </span>
    {color && (
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        title={colorTitle}
      />
    )}
    <span className="flex-1 min-w-0 truncate text-sm text-gray-700">
      {label}
    </span>
    {onRemove && (
      <DeleteIconButton onClick={onRemove} label="Spalte entfernen" small />
    )}
  </div>
);

export const CsvColumnGroup = ({
  label,
  count,
  collapsed,
  onToggle,
  onRemove,
  children,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onRemove: () => void;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-gray-500">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex-1 min-w-0 flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer text-left hover:text-blue-500"
      >
        <RightOutlined
          className={`text-[10px] text-gray-400 transition-transform ${
            collapsed ? "" : "rotate-90"
          }`}
        />
        <span className="truncate">{label}</span>
        <span className="font-normal text-gray-400">{count}</span>
      </button>
      <DeleteIconButton
        onClick={onRemove}
        label={`${label} entfernen`}
        title="Ganze Gruppe entfernen"
        small
      />
    </div>
    {!collapsed && <div className="flex flex-col gap-2 pl-4">{children}</div>}
  </div>
);

interface CsvColumnRowProps extends CsvColumnRowViewProps {
  id: string;
}

const CsvColumnRow = ({ id, ...viewProps }: CsvColumnRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <CsvColumnRowView {...viewProps} />
    </div>
  );
};

export default CsvColumnRow;
