import { Popconfirm, Tooltip } from "antd";
import { UndoOutlined } from "@ant-design/icons";

interface ResetButtonProps {
  label: string;
  onReset: () => void;
  // Nothing to reset: already the default.
  isDefault?: boolean;
  // Asks before resetting; omit for cheap, undoable resets.
  confirmTitle?: string;
  // Icon with `label` as tooltip instead of a text link.
  iconOnly?: boolean;
}

const ResetButton = ({
  label,
  onReset,
  isDefault = false,
  confirmTitle,
  iconOnly = false,
}: ResetButtonProps) => {
  const tooltip = isDefault ? `${label} (bereits Standard)` : label;
  const button = (
    <button
      type="button"
      disabled={isDefault}
      onClick={confirmTitle ? undefined : onReset}
      aria-label={label}
      className={`flex items-center bg-transparent border-none cursor-pointer disabled:text-gray-300 disabled:cursor-not-allowed ${
        iconOnly
          ? "w-6 h-6 justify-center rounded-md text-gray-500 hover:text-blue-500 hover:bg-blue-50 disabled:hover:bg-transparent"
          : "p-0 text-[#6B7280] hover:text-[#4B5563]"
      }`}
    >
      {iconOnly ? <UndoOutlined /> : label}
    </button>
  );
  const withTooltip = iconOnly ? (
    <Tooltip title={tooltip}>
      {/* Disabled buttons swallow hover events; the span keeps the tooltip. */}
      <span className="inline-flex">{button}</span>
    </Tooltip>
  ) : (
    button
  );

  return confirmTitle && !isDefault ? (
    <Popconfirm
      title={confirmTitle}
      okText="Zurücksetzen"
      cancelText="Abbrechen"
      onConfirm={onReset}
    >
      {withTooltip}
    </Popconfirm>
  ) : (
    withTooltip
  );
};

export default ResetButton;
