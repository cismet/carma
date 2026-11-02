import { Button } from "antd";
import { LockDetails } from "./LockDetails";
import { LockDialog } from "./LockDialog";
import { draftRow } from "./draftRow";
import type { DraftRecord } from "./draftStore";

export interface ResumeDraftDialogProps {
  record: DraftRecord | undefined;
  objectLabel: string;
  onResume: () => void;
  onDiscard: () => void;
  busy?: boolean;
}

export const ResumeDraftDialog = ({
  record,
  objectLabel,
  onResume,
  onDiscard,
  busy = false,
}: ResumeDraftDialogProps) => (
  <LockDialog
    open={Boolean(record)}
    title={`Ungespeicherte Änderungen an ${objectLabel}`}
    details={
      <LockDetails
        extra={
          record
            ? [
                draftRow(record),
                { key: "lock", label: "Sperre", value: "noch für Sie aktiv" },
              ]
            : []
        }
      />
    }
    actions={
      <>
        <Button danger disabled={busy} onClick={onDiscard}>
          Verwerfen
        </Button>
        <Button type="primary" loading={busy} onClick={onResume}>
          Weiterarbeiten
        </Button>
      </>
    }
  />
);
