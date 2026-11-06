import { Checkbox } from "antd";
import { HolderOutlined } from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DeleteIconButton } from "../advanced-dialog/Panel";

interface CsvColumnRowViewProps {
  index: number;
  label: string;
  groupLabel?: string;
  color?: string;
  colorTitle?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onRemove?: () => void;
  dragging?: boolean;
}

export const CsvColumnRowView = ({
  index,
  label,
  groupLabel,
  color,
  colorTitle,
  checked = false,
  onCheckedChange,
  onRemove,
  dragging,
}: CsvColumnRowViewProps) => (
  <div
    className={`flex items-center gap-3 border rounded-lg pl-3 pr-1 py-1 bg-white select-none ${
      dragging
        ? "border-blue-500 shadow-lg cursor-grabbing"
        : checked
        ? "border-blue-400 bg-blue-50 cursor-grab"
        : "border-gray-200 hover:border-blue-400 cursor-grab"
    }`}
  >
    <HolderOutlined className="text-gray-400" />
    {onCheckedChange && (
      // Checkbox clicks must not start a drag.
      <span onPointerDown={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
      </span>
    )}
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
    {groupLabel && (
      <span className="text-xs text-gray-400 truncate">{groupLabel}</span>
    )}
    {onRemove && (
      <DeleteIconButton onClick={onRemove} label="Spalte entfernen" small />
    )}
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
