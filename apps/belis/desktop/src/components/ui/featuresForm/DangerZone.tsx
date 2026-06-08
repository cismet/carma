import { Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";

interface DangerZoneProps {
  /** Heading of the danger box. Defaults to "Gefahrenzone". */
  heading?: string;
  /** Bold title of the delete row, e.g. "Leuchte löschen". */
  title: string;
  /** Muted explanatory line below the title. */
  description?: string;
  /** Label of the destructive button. Defaults to "Löschen". */
  buttonLabel?: string;
  /** Invoked when the delete button is clicked. */
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * GitHub-style "Danger Zone": a red-bordered box with a heading and a single
 * destructive action anchored to the right. Rendered at the bottom of a
 * feature form when the dangerous delete mode is enabled.
 */
const DangerZone = ({
  heading = "Gefahrenzone",
  title,
  description,
  buttonLabel = "Löschen",
  onConfirm,
  loading,
  disabled,
}: DangerZoneProps) => {
  return (
    <div className="mt-8 rounded-md border border-[#f5c2c7] overflow-hidden">
      <div className="bg-[#fff5f5] px-4 py-2 border-b border-[#f5c2c7]">
        <span className="text-[#cf222e] font-semibold text-sm">{heading}</span>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-gray-900 font-semibold text-sm">{title}</span>
          {description && (
            <span className="text-gray-500 text-[13px]">{description}</span>
          )}
        </div>
        <Button
          danger
          icon={<DeleteOutlined />}
          loading={loading}
          disabled={disabled}
          onClick={onConfirm}
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
};

export default DangerZone;
