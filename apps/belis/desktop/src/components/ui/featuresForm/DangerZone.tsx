import { Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";

interface DangerZoneProps {
  /** Bold title of the delete row, e.g. "Leuchte löschen". */
  title: string;
  /** Whether the feature is currently marked for deletion. */
  pendingDeletion: boolean;
  /** Mark the feature for deletion (creates the deletion draft). */
  onMark: () => void;
}

/**
 * GitHub-style "Danger Zone": a red-bordered box anchored at the bottom of a
 * feature form. Clicking the delete button marks the feature for deletion
 * (creating a draft); the box then just shows the pending status — committing
 * or cancelling the deletion is done via the form header's existing
 * "Speichern" / "zurücksetzen" buttons, like any other draft.
 */
const DangerZone = ({
  title,
  pendingDeletion,
  onMark,
}: DangerZoneProps) => {
  return (
    <div className="mt-8 rounded-md border border-[#f5c2c7] overflow-hidden">
      <div className="bg-[#fff5f5] px-4 py-2 border-b border-[#f5c2c7]">
        <span className="text-[#cf222e] font-semibold text-sm">{title}</span>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex flex-col">
          {pendingDeletion ? (
            <span className="flex items-center gap-1.5 text-[#cf222e] text-[13px] font-medium">
              Zum Löschen vorgemerkt mit „Speichern" wird das Fachobjekt
              dauerhaft gelöscht, „zurücksetzen" verwirft die Löschung.
            </span>
          ) : (
            <span className="text-gray-500 text-[13px]">
              Das Fachobjekt wird zum Löschen vorgemerkt.
            </span>
          )}
        </div>
        {!pendingDeletion && (
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={onMark}
            className="flex-shrink-0"
          >
            Fachobjekt löschen
          </Button>
        )}
      </div>
    </div>
  );
};

export default DangerZone;
